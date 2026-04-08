#!/usr/bin/env python3
"""
fix_storage_keys_prod.py
========================
Corrige o campo storage_key na tabela pet_documents da produção:
substitui paths absolutos locais pelo basename correto.

Modo padrão (dry-run / geração de SQL):
  - Lê o snapshot JSONL v2 (somente leitura)
  - Gera um .sql com os UPDATEs para revisão
  - NÃO toca na produção

Modo --apply:
  - Abre transação no PostgreSQL de produção
  - Executa os UPDATEs dentro da transação
  - Só commita se TODOS bem-sucedidos
  - Salva backup da lista de afetados antes de executar

Uso:
  # Ver o SQL gerado e prévia dos registros afetados:
  python3 scripts/fix_storage_keys_prod.py

  # Aplicar na produção (requer confirmação interativa):
  python3 scripts/fix_storage_keys_prod.py --apply

  # Apontar para um snapshot específico:
  python3 scripts/fix_storage_keys_prod.py \\
    --snapshot-jsonl analysis/prod_docs_snapshot_v2_20260407_225846/pet_documents_metadata.jsonl
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
MONOREPO_ROOT = SCRIPT_DIR.parents[2]
ANALYSIS_DIR = MONOREPO_ROOT / "analysis"
REPORTS_DIR = ANALYSIS_DIR / "reports"


def _find_latest_v2_jsonl() -> Path | None:
    dirs = sorted(ANALYSIS_DIR.glob("prod_docs_snapshot_v2*"), reverse=True)
    for d in dirs:
        candidate = d / "pet_documents_metadata.jsonl"
        if candidate.is_file():
            return candidate
    return None


def _load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def _needs_fix(row: dict) -> bool:
    sk = row.get("storage_key_raw") or row.get("storage_key", "")
    return "/" in sk


def _make_updates(rows: list[dict]) -> list[tuple[str, str, str]]:
    """Returns list of (doc_id, old_storage_key, new_storage_key)."""
    updates: list[tuple[str, str, str]] = []
    for row in rows:
        if not _needs_fix(row):
            continue
        doc_id = row["doc_id"]
        old_key = row.get("storage_key_raw") or row.get("storage_key", "")
        basename = row.get("storage_key_basename") or Path(old_key).name
        if not basename:
            continue
        updates.append((doc_id, old_key, basename))
    return updates


def generate_sql(updates: list[tuple[str, str, str]]) -> str:
    lines = [
        "-- ============================================================",
        "-- fix_storage_keys_prod.py — generated " + datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "-- Corrige storage_key: substitui paths absolutos por basename",
        f"-- Registros afetados: {len(updates)}",
        "-- ============================================================",
        "",
        "BEGIN;",
        "",
    ]
    for doc_id, old_key, new_key in updates:
        # Escape single quotes in values (shouldn't be any, but defensive)
        safe_old = old_key.replace("'", "''")
        safe_new = new_key.replace("'", "''")
        safe_id  = doc_id.replace("'", "''")
        lines.append(
            f"UPDATE pet_documents"
            f"  SET storage_key = '{safe_new}'"
            f"  WHERE id = '{safe_id}'"
            f"    AND storage_key = '{safe_old}';"
        )
    lines += [
        "",
        "COMMIT;",
        "",
        "-- Verification query (run after commit):",
        "-- SELECT id, storage_key FROM pet_documents",
        "--   WHERE storage_key LIKE '/%'",
        "--   ORDER BY created_at;",
        "-- (should return 0 rows if fix was complete)",
        "",
    ]
    return "\n".join(lines)


def apply_to_prod(updates: list[tuple[str, str, str]], sql_path: Path) -> int:
    """Execute the updates against the production PostgreSQL inside a single transaction."""
    import os
    from dotenv import load_dotenv
    from sqlalchemy import create_engine, text

    load_dotenv(SCRIPT_DIR.parent / ".secrets" / ".env")
    load_dotenv(SCRIPT_DIR.parent / ".env")

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL não encontrada no .env", file=sys.stderr)
        return 1

    # Refuse to run against SQLite
    if "sqlite" in db_url.lower():
        print("ERROR: DATABASE_URL aponta para SQLite. Este script só deve rodar contra PostgreSQL.", file=sys.stderr)
        return 1

    print(f"\n  DATABASE_URL aponta para: {db_url.split('@')[-1] if '@' in db_url else db_url[:40]}...")
    print(f"  Registros a corrigir: {len(updates)}")
    print()

    # Double confirmation
    resp = input("  ⚠️  Confirma aplicar os UPDATEs na produção? [digite SIM para confirmar]: ")
    if resp.strip() != "SIM":
        print("  Cancelado pelo usuário.")
        return 0

    engine = create_engine(db_url, pool_pre_ping=True)

    # Pre-fix backup: dump current state of affected rows
    backup_path = REPORTS_DIR / f"fix_storage_keys_backup_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    affected_ids = [doc_id for doc_id, _, _ in updates]
    placeholders = ", ".join(f"'{i}'" for i in affected_ids)

    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT id, storage_key, pet_id, mime_type, created_at::text FROM pet_documents WHERE id IN ({placeholders})")
        ).mappings()
        backup_rows = [dict(r) for r in result]

    backup_path.write_text(json.dumps(backup_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Backup salvo em: {backup_path}")

    # Apply inside single transaction
    update_stmt = text(
        "UPDATE pet_documents SET storage_key = :new_key WHERE id = :doc_id AND storage_key = :old_key"
    )

    ok = 0
    warn = 0
    with engine.begin() as conn:
        for doc_id, old_key, new_key in updates:
            result = conn.execute(update_stmt, {"new_key": new_key, "doc_id": doc_id, "old_key": old_key})
            if result.rowcount == 1:
                ok += 1
            else:
                print(f"  WARN: rowcount={result.rowcount} para doc_id={doc_id[:8]} (esperado 1)")
                warn += 1

    print()
    print(f"  ✅ UPDATEs aplicados: {ok}")
    if warn:
        print(f"  ⚠️  Linhas com rowcount ≠ 1: {warn}")

    # Post-fix verification
    with engine.connect() as conn:
        remaining = conn.execute(
            text("SELECT COUNT(*) FROM pet_documents WHERE storage_key LIKE '/%'")
        ).scalar()
    print(f"  Registros ainda com path absoluto no DB: {remaining}  {'✅' if remaining == 0 else '⚠️'}")

    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Fix storage_key paths in production pet_documents")
    ap.add_argument(
        "--snapshot-jsonl",
        type=Path,
        default=None,
        help="Path to pet_documents_metadata.jsonl from a v2 snapshot (auto-detected if omitted)",
    )
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Apply UPDATEs to production PostgreSQL (requires interactive confirmation)",
    )
    ap.add_argument(
        "--out-sql",
        type=Path,
        default=None,
        help="Where to write the generated SQL file (default: analysis/reports/fix_storage_keys_TIMESTAMP.sql)",
    )
    args = ap.parse_args()

    # ── Resolve JSONL ──────────────────────────────────────────────────────────
    jsonl_path = args.snapshot_jsonl
    if jsonl_path is None:
        jsonl_path = _find_latest_v2_jsonl()
        if jsonl_path is None:
            print("ERROR: Nenhum snapshot v2 encontrado. Rode snapshot_prod_documents_v2.sh primeiro.", file=sys.stderr)
            return 1
        print(f"[fix] Auto-selecionado: {jsonl_path.parent.name}/pet_documents_metadata.jsonl")

    rows = _load_jsonl(jsonl_path)
    updates = _make_updates(rows)

    already_correct = len(rows) - len(updates)

    print()
    print("=" * 70)
    print("  FIX STORAGE KEYS — prévia")
    print("=" * 70)
    print(f"  Total de registros no snapshot: {len(rows)}")
    print(f"  Já corretos (basename puro):    {already_correct}")
    print(f"  Precisam de correção:           {len(updates)}")
    print()

    if not updates:
        print("  ✅ Nenhuma correção necessária. storage_key já está limpo na produção.")
        return 0

    print("  Amostra dos primeiros 5 registros a corrigir:")
    print()
    for doc_id, old_key, new_key in updates[:5]:
        print(f"  doc_id : {doc_id}")
        print(f"  DE     : {old_key}")
        print(f"  PARA   : {new_key}")
        print()
    if len(updates) > 5:
        print(f"  ... e mais {len(updates) - 5} registros")
        print()

    # ── Generate SQL ───────────────────────────────────────────────────────────
    sql = generate_sql(updates)
    ts  = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    sql_path = args.out_sql or (REPORTS_DIR / f"fix_storage_keys_{ts}.sql")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    sql_path.write_text(sql, encoding="utf-8")
    print(f"  SQL gerado em: {sql_path}")
    print()
    print("  Revise o SQL antes de continuar.")
    print("  Para aplicar na produção:")
    print(f"    python3 scripts/fix_storage_keys_prod.py --apply")

    if not args.apply:
        return 0

    # ── Apply ──────────────────────────────────────────────────────────────────
    return apply_to_prod(updates, sql_path)


if __name__ == "__main__":
    sys.exit(main())
