#!/usr/bin/env python3
"""
Import da base mestre de produtos pet para ProductCatalog e ProductReliableCatalog.

Uso:
    cd services/price-service
    python -m src.tools.import_master_catalog [caminho_json]

Por padrão lê /REPOSITÓRIO MOL/PRODUTOS/base_mestre_pet.json relativo a este repo.

Regras:
  - Nunca sobrescreve ProductCatalog com source_confidence == 1.0 (dado humano)
  - Nunca sobrescreve campos de ProductReliableCatalog com correction_count > 0
  - Faz UPSERT: atualiza apenas se a nova confiança for maior
  - Deduplica por EAN normalizado antes de persistir
  - Gera relatório final no stdout
"""
from __future__ import annotations

import json
import logging
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Caminho padrão da base mestre — relativo ao topo do repositório
_TOOLS_DIR = Path(__file__).parent
_SRC_DIR = _TOOLS_DIR.parent
_REPO_ROOT = _SRC_DIR.parents[2]  # services/price-service/src/tools → repo root
_DEFAULT_PATH = _REPO_ROOT.parent / "PRODUTOS" / "base_mestre_pet.json"

_HTML_TAG = re.compile(r"<[^>]+>")
_MULTI_SPACE = re.compile(r"\s+")
_WEIGHT_RE = re.compile(r"([\d]+(?:[.,]\d+)?)\s*(kg|g|ml|l|lb|oz)\b", re.IGNORECASE)

BATCH_SIZE = 200

from sqlalchemy import select  # noqa: E402

# Importações relativas (usar: python -m src.tools.import_master_catalog)
try:
    from ..db import SessionLocal  # noqa: E402
    from ..product_catalog_lookup import (  # noqa: E402
        ProductCatalog,
        ProductReliableCatalog,
        _canonical_key,
        _safe_json_list,
        is_valid_gtin,
        normalize_gtin,
    )
except ImportError:
    # Fallback para execução direta com PYTHONPATH=src
    from db import SessionLocal  # type: ignore[no-redef]
    from product_catalog_lookup import (  # type: ignore[no-redef]
        ProductCatalog,
        ProductReliableCatalog,
        _canonical_key,
        _safe_json_list,
        is_valid_gtin,
        normalize_gtin,
    )

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ── Helpers de normalização ───────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    return _MULTI_SPACE.sub(" ", _HTML_TAG.sub(" ", text)).strip()


def _normalize_str(value: Optional[str], max_len: int = 255) -> Optional[str]:
    if not value:
        return None
    cleaned = _strip_html(value).strip()
    normalized = unicodedata.normalize("NFC", cleaned)
    return normalized[:max_len] if normalized else None


def _parse_weight(raw: Optional[str]) -> Optional[str]:
    """Normaliza string de peso: '100g' → '100 g', '1.5kg' → '1.5 kg'."""
    if not raw:
        return None
    text = raw.replace(",", ".").strip()
    m = _WEIGHT_RE.search(text)
    if not m:
        cleaned = text[:32]
        return cleaned if cleaned else None
    value_f = float(m.group(1))
    unit = m.group(2).lower()
    value_str = str(int(value_f)) if value_f == int(value_f) else str(value_f)
    return f"{value_str} {unit}"


def _infer_category(item: dict) -> str:
    """Infere categoria a partir de search_term e product_name."""
    text = " ".join(filter(None, [
        item.get("search_term", ""),
        item.get("product_name", ""),
        item.get("brand", ""),
    ])).lower()

    if any(w in text for w in ("antipulgas", "carrapato", "bravecto", "nexgard", "simparica",
                                "frontline", "revolution", "seresto", "scalibor")):
        return "antiparasite"
    if any(w in text for w in ("vermifugo", "vermífugo", "drontal", "milbemax", "panacur")):
        return "dewormer"
    if any(w in text for w in ("coleira antiparasit", "collar antiparasit")):
        return "collar"
    if any(w in text for w in ("racao", "ração", "alimento pet", "petisco", "snack",
                                "sache", "sachê", "wet food", "dry food", "kibble",
                                "biscoito pet", "tapete higienico")):
        return "food"
    if any(w in text for w in ("shampoo", "higiene", "areia sanitaria", "areia sanitária",
                                "tapete", "condicionador")):
        return "hygiene"
    if any(w in text for w in ("medicamento", "remedio", "remédio", "comprimido",
                                "vitamina", "suplemento")):
        return "medication"
    return "other"


def _calc_confidence(item: dict) -> float:
    """Calcula confiança inicial baseada nos dados disponíveis."""
    has_ean = bool(is_valid_gtin(normalize_gtin(str(item.get("ean") or item.get("key") or ""))))
    has_name = bool((item.get("product_name") or "").strip())
    has_brand = bool((item.get("brand") or "").strip())
    has_weight = bool((item.get("weight") or "").strip())

    if has_ean and has_name and has_brand and has_weight:
        return 0.82
    if has_ean and has_name and has_brand:
        return 0.70
    if has_ean and has_name:
        return 0.55
    return 0.40


# ── Import principal ──────────────────────────────────────────────────────────

def run_import(json_path: Path) -> dict:
    logger.info("Lendo base mestre: %s", json_path)
    with open(json_path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    items: list[dict] = data.get("items", []) if isinstance(data, dict) else data
    logger.info("Total de itens na base: %d", len(items))

    stats: dict[str, int] = {
        "total": len(items),
        "valid": 0,
        "skipped_invalid_ean": 0,
        "skipped_duplicate_ean": 0,
        "catalog_inserted": 0,
        "catalog_updated": 0,
        "catalog_skipped_human": 0,
        "reliable_inserted": 0,
        "reliable_merged": 0,
        "reliable_skipped_human": 0,
        "errors": 0,
    }

    # Passo 1: deduplicar por EAN normalizado (mantém a primeira ocorrência)
    deduped: dict[str, dict] = {}
    for item in items:
        raw_ean = str(item.get("ean") or item.get("key") or "").strip()
        norm = normalize_gtin(raw_ean)
        if not norm or not is_valid_gtin(norm):
            stats["skipped_invalid_ean"] += 1
            continue
        if norm in deduped:
            stats["skipped_duplicate_ean"] += 1
            continue
        deduped[norm] = item

    stats["valid"] = len(deduped)
    logger.info("EANs únicos válidos: %d", stats["valid"])

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    batch_count = 0
    # Rastrear canonical_keys inseridos neste import para evitar duplicatas intra-batch
    seen_canonical_keys: set[str] = set()

    try:
        for norm_ean, item in deduped.items():
            try:
                name = _normalize_str(item.get("product_name"))
                if not name:
                    stats["skipped_invalid_ean"] += 1
                    continue

                brand = _normalize_str(item.get("brand"))
                weight = _parse_weight(item.get("weight"))
                category = _infer_category(item)
                confidence = _calc_confidence(item)
                thumbnail_url = item.get("image_url") or None
                if thumbnail_url:
                    thumbnail_url = str(thumbnail_url)[:512]
                product_url = item.get("product_url") or None

                raw_payload = json.dumps({
                    "weight": weight,
                    "image_url": thumbnail_url,
                    "product_url": product_url,
                    "source": "petmol_master",
                }, ensure_ascii=False)

                # ── ProductCatalog: UPSERT ────────────────────────────────────
                row = db.scalar(
                    select(ProductCatalog).where(
                        ProductCatalog.barcode_normalized == norm_ean
                    )
                )
                if row:
                    if row.source_confidence >= 1.0:
                        # Dado confirmado por humano — nunca sobrescrever
                        stats["catalog_skipped_human"] += 1
                    elif confidence > row.source_confidence:
                        row.name = name
                        row.brand = brand
                        row.category = category
                        row.thumbnail_url = thumbnail_url or row.thumbnail_url
                        row.source_primary = "petmol_master"
                        row.source_confidence = confidence
                        row.updated_at = now
                        row.raw_payload = raw_payload
                        stats["catalog_updated"] += 1
                    # Se confiança igual ou menor, manter dado existente
                else:
                    row = ProductCatalog(
                        barcode=norm_ean,
                        barcode_normalized=norm_ean,
                        name=name,
                        brand=brand,
                        category=category,
                        thumbnail_url=thumbnail_url,
                        source_primary="petmol_master",
                        source_confidence=confidence,
                        raw_payload=raw_payload,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(row)
                    stats["catalog_inserted"] += 1

                # ── ProductReliableCatalog: UPSERT por canonical_key ──────────
                if name and brand:
                    canon_key = _canonical_key(name, brand, category)
                    reliable = db.scalar(
                        select(ProductReliableCatalog).where(
                            ProductReliableCatalog.canonical_key == canon_key
                        )
                    )
                    if reliable:
                        # Mesclar GTINs sempre
                        gtins = set(_safe_json_list(reliable.gtins_json))
                        gtins.add(norm_ean)
                        reliable.gtins_json = json.dumps(sorted(gtins), ensure_ascii=False)

                        if reliable.correction_count > 0:
                            # Dado corrigido por humano — não sobrescrever campos principais
                            stats["reliable_skipped_human"] += 1
                        else:
                            # Completar campos ausentes
                            reliable.weight = reliable.weight or weight
                            reliable.updated_at = now
                        stats["reliable_merged"] += 1
                        seen_canonical_keys.add(canon_key)
                    elif canon_key not in seen_canonical_keys:
                        # Novo — inserir
                        db.add(ProductReliableCatalog(
                            canonical_key=canon_key,
                            canonical_name=name,
                            aliases_json=json.dumps([name], ensure_ascii=False),
                            gtins_json=json.dumps([norm_ean], ensure_ascii=False),
                            brand=brand,
                            category=category,
                            weight=weight,
                            confirmation_count=0,
                            correction_count=0,
                            created_at=now,
                            updated_at=now,
                        ))
                        seen_canonical_keys.add(canon_key)
                        stats["reliable_inserted"] += 1
                    else:
                        # Já processado neste import — pular silenciosamente
                        stats["skipped_duplicate_ean"] += 1

                batch_count += 1
                if batch_count % BATCH_SIZE == 0:
                    db.commit()
                    logger.info(
                        "  %d/%d processados (ins=%d upd=%d err=%d)",
                        batch_count,
                        stats["valid"],
                        stats["catalog_inserted"],
                        stats["catalog_updated"],
                        stats["errors"],
                    )

            except Exception as exc:
                logger.warning("Erro ao importar EAN %s: %s", norm_ean, exc)
                stats["errors"] += 1
                try:
                    db.rollback()
                except Exception:
                    pass
                # Reiniciar sessão para o próximo batch
                try:
                    db.close()
                except Exception:
                    pass
                db = SessionLocal()
                now = datetime.now(timezone.utc)
                batch_count = 0
                # Resetar tracking intra-batch após reiniciar sessão
                seen_canonical_keys = set()

        # Commit final
        db.commit()
        logger.info("Import concluído. Total processado: %d", batch_count)

    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        logger.exception("Erro fatal durante import: %s", exc)
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass

    return stats


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else _DEFAULT_PATH
    if not path.exists():
        logger.error("Arquivo não encontrado: %s", path)
        logger.error("Uso: python -m src.tools.import_master_catalog [caminho_json]")
        sys.exit(1)

    stats = run_import(path)

    print()
    print("═══════════════════════════════════════════════")
    print("  RELATÓRIO DE IMPORT — BASE MESTRE PET")
    print("═══════════════════════════════════════════════")
    print(f"  Total na base                : {stats['total']}")
    print(f"  EANs válidos e únicos        : {stats['valid']}")
    print(f"  EANs inválidos (sem EAN/nome): {stats['skipped_invalid_ean']}")
    print(f"  EANs duplicados              : {stats['skipped_duplicate_ean']}")
    print()
    print(f"  ProductCatalog inseridos     : {stats['catalog_inserted']}")
    print(f"  ProductCatalog atualizados   : {stats['catalog_updated']}")
    print(f"  ProductCatalog protegidos    : {stats['catalog_skipped_human']}  (dados humanos, source_confidence=1.0)")
    print()
    print(f"  ReliableCatalog inseridos    : {stats['reliable_inserted']}")
    print(f"  ReliableCatalog mesclados    : {stats['reliable_merged']}")
    print(f"  ReliableCatalog protegidos   : {stats['reliable_skipped_human']}  (correction_count > 0)")
    print()
    print(f"  Erros de processamento       : {stats['errors']}")
    print("═══════════════════════════════════════════════")


if __name__ == "__main__":
    main()
