#!/usr/bin/env bash
# Read-only: copy production pet document files + export metadata JSONL (Postgres on VPS).
# Does not modify production.
set -euo pipefail
VPS="${PETMOL_VPS:-root@147.93.33.24}"
REMOTE_APP="${PETMOL_REMOTE_APP:-/opt/petmol/app/services/price-service}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="${1:-$MONOREPO_ROOT/analysis/prod_docs_snapshot}"

mkdir -p "$OUT_DIR/pet_documents"

echo "[snapshot] rsync pet_documents from $VPS ..."
rsync -avz --timeout=120 -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new' \
  "$VPS:$REMOTE_APP/uploads/pet_documents/" "$OUT_DIR/pet_documents/"

echo "[snapshot] export pet_documents metadata (SELECT only) ..."
ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$VPS" bash <<REMOTE > "$OUT_DIR/pet_documents_metadata.jsonl"
cd "$REMOTE_APP" && .venv/bin/python - <<'PY'
import json, os, sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(".env"))
from sqlalchemy import create_engine, text
url = os.environ.get("DATABASE_URL")
if not url:
    print("NO_DATABASE_URL", file=sys.stderr)
    sys.exit(1)
engine = create_engine(url, pool_pre_ping=True)
sql = text("""
SELECT d.id AS doc_id, d.pet_id, p.name AS pet_name, d.storage_key, d.mime_type,
       d.title AS db_title, d.category AS db_category,
       d.document_date AS db_document_date, d.establishment_name AS db_establishment,
       d.size_bytes AS db_size_bytes, d.created_at AS db_created_at
FROM pet_documents d
JOIN pets p ON p.id = d.pet_id
WHERE d.kind = 'file' AND d.storage_key IS NOT NULL AND d.storage_key != ''
ORDER BY d.created_at ASC
""")
with engine.connect() as conn:
    for row in conn.execute(sql).mappings():
        d = dict(row)
        for k, v in list(d.items()):
            if hasattr(v, "isoformat"):
                d[k] = v.isoformat()
        print(json.dumps(d, ensure_ascii=False))
PY
REMOTE

echo "[snapshot] wrote $OUT_DIR/pet_documents_metadata.jsonl"
wc -l "$OUT_DIR/pet_documents_metadata.jsonl"
