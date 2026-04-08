#!/usr/bin/env bash
# ============================================================
# snapshot_prod_documents_v2.sh
# Read-only re-fetch of production pet documents + metadata.
# Enhanced over v1:
#   - exports storage_key_basename alongside raw storage_key
#   - lists actual files present on VPS (detects orphans)
#   - saves to a NEW directory (never overwrites existing snapshots)
#   - prints a quick validation summary at the end
#
# Usage:
#   bash snapshot_prod_documents_v2.sh [OUT_DIR]
#
# Does NOT modify production — pure SELECT + rsync read.
# ============================================================
set -euo pipefail

VPS="${PETMOL_VPS:-root@147.93.33.24}"
REMOTE_APP="${PETMOL_REMOTE_APP:-/opt/petmol/app/services/price-service}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="${1:-$MONOREPO_ROOT/analysis/prod_docs_snapshot_v2_${TIMESTAMP}}"

echo "[snapshot_v2] Output dir: $OUT_DIR"
mkdir -p "$OUT_DIR/pet_documents"

# ──────────────────────────────────────────────────────────
# Step 1: Rsync physical files from VPS (read-only)
# ──────────────────────────────────────────────────────────
echo "[snapshot_v2] (1/3) rsync pet_documents from $VPS ..."
rsync -avz --timeout=120 \
  -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new' \
  "$VPS:$REMOTE_APP/uploads/pet_documents/" \
  "$OUT_DIR/pet_documents/"

SYNCED_COUNT=$(find "$OUT_DIR/pet_documents" -maxdepth 1 -type f | wc -l | tr -d ' ')
echo "[snapshot_v2] Synced $SYNCED_COUNT physical files."

# ──────────────────────────────────────────────────────────
# Step 2: List actual files present on VPS (for orphan check)
# ──────────────────────────────────────────────────────────
echo "[snapshot_v2] (2/3) Listing actual files on VPS ..."
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$VPS" \
  "find $REMOTE_APP/uploads/pet_documents -maxdepth 1 -type f -printf '%f\n' 2>/dev/null | sort" \
  > "$OUT_DIR/vps_files_listing.txt"

VPS_FILE_COUNT=$(wc -l < "$OUT_DIR/vps_files_listing.txt" | tr -d ' ')
echo "[snapshot_v2] VPS has $VPS_FILE_COUNT files in uploads/pet_documents."

# ──────────────────────────────────────────────────────────
# Step 3: Export metadata from production PostgreSQL (SELECT only)
# ──────────────────────────────────────────────────────────
echo "[snapshot_v2] (3/3) Exporting metadata from production PostgreSQL ..."
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$VPS" bash <<REMOTE > "$OUT_DIR/pet_documents_metadata.jsonl"
cd "$REMOTE_APP" && .venv/bin/python - <<'PY'
import json, os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(".env"))
url = os.environ.get("DATABASE_URL")
if not url:
    print("ERROR: DATABASE_URL not set on VPS", file=sys.stderr)
    sys.exit(1)

from sqlalchemy import create_engine, text

engine = create_engine(url, pool_pre_ping=True)

sql = text("""
SELECT
    d.id                                                    AS doc_id,
    d.pet_id,
    p.name                                                  AS pet_name,
    d.storage_key                                           AS storage_key_raw,
    CASE
        WHEN d.storage_key LIKE '%/%'
        THEN regexp_replace(d.storage_key, '^.*/', '')
        ELSE d.storage_key
    END                                                     AS storage_key_basename,
    d.mime_type,
    d.title                                                 AS db_title,
    d.category                                              AS db_category,
    d.document_date                                         AS db_document_date,
    d.establishment_name                                    AS db_establishment,
    d.size_bytes                                            AS db_size_bytes,
    d.kind,
    d.created_at                                            AS db_created_at
FROM pet_documents d
JOIN pets p ON p.id = d.pet_id
WHERE d.kind = 'file'
  AND d.storage_key IS NOT NULL
  AND d.storage_key != ''
ORDER BY d.created_at ASC
""")

with engine.connect() as conn:
    rows = list(conn.execute(sql).mappings())

for row in rows:
    d = dict(row)
    for k, v in list(d.items()):
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
    print(json.dumps(d, ensure_ascii=False))

print(f"[metadata] Exported {len(rows)} rows.", file=sys.stderr)
PY
REMOTE

DB_ROW_COUNT=$(wc -l < "$OUT_DIR/pet_documents_metadata.jsonl" | tr -d ' ')
echo "[snapshot_v2] Exported $DB_ROW_COUNT metadata rows."

# ──────────────────────────────────────────────────────────
# Step 4: Quick local validation summary
# ──────────────────────────────────────────────────────────
echo "[snapshot_v2] Running local validation ..."
python3 - "$OUT_DIR" <<'PY'
import json, sys
from pathlib import Path

out = Path(sys.argv[1])
lines = (out / "pet_documents_metadata.jsonl").read_text(encoding="utf-8").strip().split("\n")
rows = [json.loads(l) for l in lines if l.strip()]

synced = {f.name for f in (out / "pet_documents").iterdir() if f.is_file()}
vps_files = set((out / "vps_files_listing.txt").read_text().strip().split("\n")) if (out / "vps_files_listing.txt").exists() else set()

db_basenames = {r["storage_key_basename"] for r in rows}
bad_storage_keys = [r for r in rows if "/" in r["storage_key_raw"]]
correct_storage_keys = [r for r in rows if "/" not in r["storage_key_raw"]]

matched = db_basenames & synced
unmatched_db = db_basenames - synced
orphan_files = synced - db_basenames

print()
print("=" * 60)
print("  VALIDATION SUMMARY")
print("=" * 60)
print(f"  DB rows (kind=file, storage_key not null): {len(rows)}")
print(f"  Physical files synced locally:             {len(synced)}")
print(f"  Physical files reported on VPS:            {len(vps_files)}")
print()
print(f"  storage_key with absolute/wrong path:      {len(bad_storage_keys)}")
print(f"  storage_key as correct basename only:      {len(correct_storage_keys)}")
print()
print(f"  DB basenames matched in synced files:      {len(matched)}")
print(f"  DB basenames NOT in synced files:          {len(unmatched_db)}")
print(f"  Synced files with no DB entry (orphans):   {len(orphan_files)}")

if unmatched_db:
    print()
    print("  WARNING — files in DB with no local copy:")
    for f in sorted(unmatched_db)[:10]:
        print(f"    {f}")

if orphan_files:
    print()
    print("  INFO — synced orphan files (no DB row):")
    for f in sorted(orphan_files)[:10]:
        print(f"    {f}")

print("=" * 60)
print(f"  Snapshot ready at: {out}")
print("=" * 60)
print()
print("NEXT STEP: run audit_prod_snapshot.py on this snapshot.")
print(f"  python3 scripts/audit_prod_snapshot.py --snapshot-dir {out}")
PY

echo "[snapshot_v2] Done."
