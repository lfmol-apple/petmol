#!/usr/bin/env python3
"""
audit_prod_snapshot.py
======================
Read-only: audits a production pet_documents snapshot.

Workflow:
  1. Load JSONL metadata from the snapshot
  2. Cross-reference with physical files in pet_documents/
  3. Print a 10-row audit sample (doc_id, pet_id, pet_name,
     storage_key_raw, real_filename, category, title,
     document_date, establishment_name)
  4. Print a full inconsistency report
  5. (Optional) compare with a previous snapshot to show regression

Usage:
  python3 scripts/audit_prod_snapshot.py \\
      --snapshot-dir analysis/prod_docs_snapshot_v2_TIMESTAMP

  # Or use the legacy snapshot (for comparison):
  python3 scripts/audit_prod_snapshot.py \\
      --snapshot-dir analysis/prod_docs_snapshot \\
      --compare-old analysis/prod_docs_snapshot

Does NOT modify anything.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
MONOREPO_ROOT = SCRIPT_DIR.parents[2]
DEFAULT_SNAPSHOT_V2 = MONOREPO_ROOT / "analysis" / "prod_docs_snapshot_v2"
DEFAULT_SNAPSHOT_V1 = MONOREPO_ROOT / "analysis" / "prod_docs_snapshot"
OLD_AI_REPORT = MONOREPO_ROOT / "analysis" / "reports" / "pet_documents_AI_rebuild_20260408.json"


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def _real_filename(row: dict) -> str:
    """Returns the plain basename that should exist on disk."""
    # New v2 snapshot exports storage_key_basename directly
    if row.get("storage_key_basename"):
        return row["storage_key_basename"]
    # Fallback: derive from raw storage_key
    sk = row.get("storage_key_raw") or row.get("storage_key", "")
    return Path(sk).name if sk else ""


def _storage_key_raw(row: dict) -> str:
    return row.get("storage_key_raw") or row.get("storage_key", "")


def _storage_key_is_absolute_local(sk_raw: str) -> bool:
    """True when storage_key contains an absolute path (the bug)."""
    return "/" in sk_raw and not sk_raw.startswith("./")


def _print_divider(char: str = "─", width: int = 80) -> None:
    print(char * width)


def _fmt(value: object, width: int = 0) -> str:
    s = str(value) if value is not None else "—"
    if width:
        return s[:width].ljust(width)
    return s


# ─── Audit sample (10 rows) ───────────────────────────────────────────────────
def print_audit_sample(rows: list[dict], synced: set[str], n: int = 10) -> None:
    print()
    _print_divider("═")
    print("  AUDIT SAMPLE — primeiros 10 documentos (leitura da produção)")
    _print_divider("═")

    cols = [
        ("doc_id",        36),
        ("pet_id",        36),
        ("pet_name",      16),
        ("storage_key_raw (DB)",   52),
        ("arquivo_real (basename)", 52),
        ("file_ok",        8),
        ("category",      12),
        ("title",         30),
        ("document_date", 12),
        ("establishment", 30),
    ]

    header = "  ".join(_fmt(c[0], c[1]) for c in cols)
    _print_divider()
    print(header)
    _print_divider()

    sample = rows[:n]
    for r in sample:
        sk_raw  = _storage_key_raw(r)
        real_fn = _real_filename(r)
        file_ok = "✓" if real_fn in synced else "✗ MISSING"
        values = [
            _fmt(r.get("doc_id"), 36),
            _fmt(r.get("pet_id"), 36),
            _fmt(r.get("pet_name"), 16),
            _fmt(sk_raw, 52),
            _fmt(real_fn, 52),
            _fmt(file_ok, 8),
            _fmt(r.get("db_category"), 12),
            _fmt(r.get("db_title"), 30),
            _fmt(r.get("db_document_date"), 12),
            _fmt(r.get("db_establishment"), 30),
        ]
        print("  ".join(values))

    _print_divider()
    print(f"  Mostrando {len(sample)} de {len(rows)} documentos.")
    print()


# ─── Inconsistency report ─────────────────────────────────────────────────────
def print_inconsistency_report(
    rows: list[dict],
    synced: set[str],
    vps_files: set[str],
    compare_old_rows: list[dict] | None,
) -> None:
    print()
    _print_divider("═")
    print("  RELATÓRIO DE INCONSISTÊNCIAS")
    _print_divider("═")

    # ── 1. storage_key format analysis ────────────────────────────────────────
    rows_with_abs_path: list[dict] = []
    rows_with_rel_path: list[dict] = []
    rows_with_basename: list[dict] = []
    rows_null_key: list[dict] = []

    for r in rows:
        sk = _storage_key_raw(r)
        if not sk:
            rows_null_key.append(r)
        elif sk.startswith("/Users/") or sk.startswith("/home/") or sk.startswith("/opt/"):
            rows_with_abs_path.append(r)
        elif "/" in sk:
            rows_with_rel_path.append(r)
        else:
            rows_with_basename.append(r)

    total = len(rows)

    print()
    print("  [1] Formato do campo storage_key no PostgreSQL da produção")
    _print_divider("-")
    print(f"  Total de documentos (kind=file, storage_key not null): {total}")
    print()
    print(f"  ✗ Caminho absoluto (path local vazado):  {len(rows_with_abs_path):>4}  ({100*len(rows_with_abs_path)/total:.0f}%)")
    print(f"  ~ Caminho relativo com '/':              {len(rows_with_rel_path):>4}  ({100*len(rows_with_rel_path)/total:.0f}%)")
    print(f"  ✓ Apenas basename (formato correto):     {len(rows_with_basename):>4}  ({100*len(rows_with_basename)/total:.0f}%)")
    print(f"  ✗ Nulo ou vazio:                         {len(rows_null_key):>4}")

    if rows_with_abs_path:
        print()
        print("  Exemplos de paths locais vazados no storage_key:")
        for r in rows_with_abs_path[:5]:
            print(f"    doc_id={r['doc_id'][:8]}  pet={r.get('pet_name','?')}  key={_storage_key_raw(r)}")
        if len(rows_with_abs_path) > 5:
            print(f"    ... e mais {len(rows_with_abs_path)-5} registros")

    if rows_with_rel_path:
        print()
        print("  Exemplos de paths relativos (não basename puro):")
        for r in rows_with_rel_path[:5]:
            print(f"    doc_id={r['doc_id'][:8]}  key={_storage_key_raw(r)}")

    # ── 2. File cross-reference ────────────────────────────────────────────────
    db_basenames = {_real_filename(r): r for r in rows}
    matched      = {fn for fn in db_basenames if fn in synced}
    unmatched_db = {fn: db_basenames[fn] for fn in db_basenames if fn not in synced}
    orphan_files = synced - set(db_basenames.keys())

    print()
    print("  [2] Correspondência arquivo físico ↔ registro no banco")
    _print_divider("-")
    print(f"  Arquivos sincronizados localmente (rsync):  {len(synced)}")
    print(f"  Basenames de storage_key no banco:          {len(db_basenames)}")
    print()
    print(f"  ✓ Correspondência encontrada (DB ↔ arquivo): {len(matched)}")
    print(f"  ✗ Registro no DB sem arquivo no snapshot:    {len(unmatched_db)}")
    print(f"  ~ Arquivo no snapshot sem registro no DB:    {len(orphan_files)} (orphans)")

    if unmatched_db:
        print()
        print("  CRÍTICO — Documentos no DB sem arquivo físico:")
        for fn, r in list(unmatched_db.items())[:10]:
            print(f"    doc_id={r['doc_id'][:8]}  pet={r.get('pet_name','?')}  basename={fn}")

    if orphan_files:
        print()
        print("  Arquivos órfãos (arquivo físico existe mas sem registro no DB):")
        for fn in sorted(orphan_files)[:10]:
            print(f"    {fn}")
        if len(orphan_files) > 10:
            print(f"    ... e mais {len(orphan_files)-10}")

    # ── 3. VPS vs local sync consistency ──────────────────────────────────────
    if vps_files:
        vps_extra = vps_files - synced
        local_extra = synced - vps_files
        vps_no_db = vps_files - set(db_basenames.keys())

        print()
        print("  [3] VPS upload dir vs. snapshot local")
        _print_divider("-")
        print(f"  Arquivos listados no VPS:                   {len(vps_files)}")
        print(f"  Arquivos sync'ados localmente:              {len(synced)}")
        print(f"  Nos dois (sync completo):                   {len(vps_files & synced)}")
        print(f"  No VPS mas não no snapshot local:           {len(vps_extra)}")
        print(f"  No snapshot local mas não no VPS:           {len(local_extra)}")
        print(f"  No VPS sem registro no DB (órfãos no VPS):  {len(vps_no_db)}")

        if vps_extra:
            print()
            print("  Arquivos no VPS que não foram sync'ados localmente (verificar rsync):")
            for f in sorted(vps_extra)[:10]:
                print(f"    {f}")

    # ── 4. Comparison with previous snapshot ──────────────────────────────────
    if compare_old_rows is not None:
        old_by_id = {r.get("doc_id"): r for r in compare_old_rows}
        new_by_id = {r.get("doc_id"): r for r in rows}

        new_ids = set(new_by_id.keys())
        old_ids = set(old_by_id.keys())

        added   = new_ids - old_ids
        removed = old_ids - new_ids
        changed: list[tuple[str, str, str, str]] = []

        for doc_id in new_ids & old_ids:
            o = old_by_id[doc_id]
            n = new_by_id[doc_id]
            for field in ("db_category", "db_document_date", "db_establishment", "db_title"):
                if o.get(field) != n.get(field):
                    changed.append((doc_id[:8], field, o.get(field), n.get(field)))

        print()
        print("  [4] Comparação snapshot novo vs. snapshot antigo")
        _print_divider("-")
        print(f"  Docs no snapshot novo:   {len(new_ids)}")
        print(f"  Docs no snapshot antigo: {len(old_ids)}")
        print()
        print(f"  Novos (adicionados na produção): {len(added)}")
        print(f"  Removidos (não estão mais lá):   {len(removed)}")
        print(f"  Campos alterados entre snapshots: {len(changed)}")

        if changed:
            print()
            print("  Detalhes de campos alterados:")
            for doc_id, field, old_val, new_val in changed[:20]:
                print(f"    doc_id={doc_id}  {field}: {old_val!r} → {new_val!r}")

    # ── 5. Root cause diagnosis ────────────────────────────────────────────────
    print()
    _print_divider("═")
    print("  DIAGNÓSTICO: CAUSA RAIZ DOS DADOS ERRADOS")
    _print_divider("═")
    print("""
  Problema identificado: campo storage_key na tabela pet_documents da produção
  contém caminhos absolutos da máquina local do desenvolvedor.

  Exemplo encontrado:
    Valor no DB:   /Users/leonardomol/PETMOL/services/price-service/uploads/pet_documents/<basename>
    Valor correto: <basename>  (somente o nome do arquivo)

  Origem provável:
    - Documentos foram enviados enquanto o serviço rodava localmente.
    - Uma versão antiga de _save_bytes_to_disk() retornava o filepath absoluto
      em vez de apenas o safe_name.
    - Esses registros com path absoluto vazaram para o banco de produção.

  Evidências:
    - 7 registros têm storage_key correto (basename puro) — esses foram
      criados após a correção do código.
    - 41 registros têm o path da máquina local (/Users/leonardomol/PETMOL/).
    - O código atual em _save_bytes_to_disk() JÁ está correto:
        return safe_name  # só o basename

  Impacto nos dados anteriores:
    - O classify_prod_documents_snapshot.py leu o storage_key errado do JSONL
      e propagou os paths absolutos para o relatório JSON de IA.
    - O campo file_name no relatório de IA foi derivado corretamente via
      Path(storage_key).name — por isso os arquivos foram encontrados.
    - A classificação em si (categoria, data, estabelecimento) pode estar
      correta, mas o storage_key no relatório reflete o dado corrompido.

  O que NÃO foi afetado:
    - Os arquivos físicos estão íntegros no VPS e foram sync'ados corretamente.
    - Os doc_id, pet_id e pet_name são confiáveis.
    - O vínculo doc_id → arquivo real pode ser reconstruído via basename.

  Próximos passos recomendados:
    1. Confirmar que o total de arquivos físicos no VPS bate com a listagem acima.
    2. Validar o mapeamento doc_id → basename → arquivo físico.
    3. Corrigir storage_key no banco (UPDATE) usando apenas o basename.
       (ver script fix_storage_keys_prod.py — gerar antes de executar)
    4. Só então re-executar a classificação com snapshot limpo.
""")
    _print_divider("═")


# ─── Main ─────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Audit a prod_docs snapshot")
    ap.add_argument(
        "--snapshot-dir",
        type=Path,
        default=None,
        help="Path to the snapshot directory (contains pet_documents_metadata.jsonl + pet_documents/)",
    )
    ap.add_argument(
        "--compare-old",
        type=Path,
        default=None,
        help="Path to an older snapshot dir to compare against",
    )
    ap.add_argument(
        "--sample-size",
        type=int,
        default=10,
        help="Number of rows to show in the audit sample (default: 10)",
    )
    args = ap.parse_args()

    # ── Resolve snapshot dir ───────────────────────────────────────────────────
    snapshot_dir: Path | None = args.snapshot_dir
    if snapshot_dir is None:
        # Auto-discover: prefer newest v2 timestamp dir
        analysis = MONOREPO_ROOT / "analysis"
        v2_dirs = sorted(analysis.glob("prod_docs_snapshot_v2*"), reverse=True)
        if v2_dirs:
            snapshot_dir = v2_dirs[0]
            print(f"[audit] Auto-selected newest v2 snapshot: {snapshot_dir.name}")
        elif DEFAULT_SNAPSHOT_V1.exists():
            snapshot_dir = DEFAULT_SNAPSHOT_V1
            print(f"[audit] Falling back to legacy snapshot: {snapshot_dir.name}")
        else:
            print("ERROR: No snapshot directory found. Run snapshot_prod_documents_v2.sh first.", file=sys.stderr)
            return 1

    jsonl_path   = snapshot_dir / "pet_documents_metadata.jsonl"
    files_dir    = snapshot_dir / "pet_documents"
    vps_listing  = snapshot_dir / "vps_files_listing.txt"

    if not jsonl_path.is_file():
        print(f"ERROR: JSONL not found: {jsonl_path}", file=sys.stderr)
        return 1
    if not files_dir.is_dir():
        print(f"ERROR: pet_documents dir not found: {files_dir}", file=sys.stderr)
        return 1

    # ── Load data ──────────────────────────────────────────────────────────────
    rows = _load_jsonl(jsonl_path)
    synced = {f.name for f in files_dir.iterdir() if f.is_file()}
    vps_files: set[str] = set()
    if vps_listing.is_file():
        vps_files = {line.strip() for line in vps_listing.read_text().splitlines() if line.strip()}

    # ── Load old snapshot for comparison ──────────────────────────────────────
    compare_old_rows: list[dict] | None = None
    compare_path: Path | None = args.compare_old
    if compare_path is None and snapshot_dir != DEFAULT_SNAPSHOT_V1 and DEFAULT_SNAPSHOT_V1.exists():
        compare_path = DEFAULT_SNAPSHOT_V1
    if compare_path and compare_path != snapshot_dir:
        old_jsonl = compare_path / "pet_documents_metadata.jsonl"
        if old_jsonl.is_file():
            compare_old_rows = _load_jsonl(old_jsonl)
            print(f"[audit] Comparing with old snapshot: {compare_path.name} ({len(compare_old_rows)} rows)")

    print()
    print("=" * 80)
    print(f"  AUDITORIA DE DOCUMENTOS — snapshot: {snapshot_dir.name}")
    print("=" * 80)
    print(f"  Metadata rows:   {len(rows)}")
    print(f"  Synced files:    {len(synced)}")
    print(f"  VPS files known: {len(vps_files) if vps_files else 'n/a (run v2 snapshot)'}")

    # ── Step 1: Sanity check — must have rows ──────────────────────────────────
    if not rows:
        print()
        print("ERROR: JSONL is empty. Re-run the snapshot script.", file=sys.stderr)
        return 1

    # ── Step 2: Audit sample ───────────────────────────────────────────────────
    print_audit_sample(rows, synced, n=args.sample_size)

    # ── Step 3: Block if critical inconsistencies ──────────────────────────────
    db_basenames = {_real_filename(r) for r in rows}
    unmatched_db = db_basenames - synced

    print()
    if unmatched_db:
        print("  ⛔  BLOQUEIO: existem registros no banco sem arquivo físico correspondente.")
        print("      Não prosseguir com a classificação até resolver.")
    else:
        print("  ✅  Mapeamento doc_id → arquivo físico está consistente (0 arquivos faltando).")

    # ── Step 4: Inconsistency report ──────────────────────────────────────────
    print_inconsistency_report(rows, synced, vps_files, compare_old_rows)

    return 0


if __name__ == "__main__":
    sys.exit(main())
