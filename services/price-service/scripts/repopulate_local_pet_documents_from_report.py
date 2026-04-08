#!/usr/bin/env python3
"""
One-off: backup local pet_documents + uploads/pet_documents, copy snapshot files in,
UPSERT pet_documents from AI classification report (LOCAL DB only).

Idempotent: ON CONFLICT (id) DO UPDATE for same production doc IDs.
Skips rows if pet_id does not exist locally or file missing in snapshot.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import date, datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

PRICE_SERVICE_ROOT = Path(__file__).resolve().parent.parent


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        t = s.replace("Z", "+00:00") if isinstance(s, str) and s.endswith("Z") else s
        dt = datetime.fromisoformat(t)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        try:
            return datetime.fromisoformat(s[:19]).replace(tzinfo=timezone.utc)
        except Exception:
            return None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--report", type=Path, required=True, help="classify_prod_documents_snapshot JSON output")
    p.add_argument("--snapshot-docs", type=Path, required=True, help="snapshot pet_documents/ folder (basenames)")
    p.add_argument(
        "--uploads-dest",
        type=Path,
        default=PRICE_SERVICE_ROOT / "uploads" / "pet_documents",
        help="Local uploads/pet_documents directory",
    )
    p.add_argument(
        "--backup-root",
        type=Path,
        required=True,
        help="Directory to store backups (uploads copy + pet_documents JSON dump)",
    )
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    load_dotenv(PRICE_SERVICE_ROOT / ".secrets" / ".env")
    load_dotenv(PRICE_SERVICE_ROOT / ".env")

    report_path = args.report.resolve()
    snapshot_docs = args.snapshot_docs.resolve()
    uploads_dest = args.uploads_dest.resolve()
    backup_root = args.backup_root.resolve()

    if not report_path.is_file():
        print(f"Report not found: {report_path}", file=sys.stderr)
        return 1
    if not snapshot_docs.is_dir():
        print(f"Snapshot docs not found: {snapshot_docs}", file=sys.stderr)
        return 1

    report: list[dict] = json.loads(report_path.read_text(encoding="utf-8"))

    db_url = __import__("os").environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL missing", file=sys.stderr)
        return 1

    engine = create_engine(db_url, pool_pre_ping=True)

    backup_root.mkdir(parents=True, exist_ok=True)
    uploads_backup = backup_root / "uploads_pet_documents_before"
    json_backup = backup_root / "pet_documents_before.json"

    if not args.dry_run:
        if uploads_dest.exists():
            if uploads_backup.exists():
                shutil.rmtree(uploads_backup)
            shutil.copytree(uploads_dest, uploads_backup)
            print(f"Backed up uploads → {uploads_backup}")
        else:
            uploads_dest.mkdir(parents=True, exist_ok=True)
            print("No existing uploads dir; created empty target.")

        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, pet_id, kind, category, title, document_date::text, source, "
                    "storage_key, mime_type, size_bytes, created_at::text FROM pet_documents"
                )
            ).mappings()
            json_backup.write_text(
                json.dumps([dict(r) for r in rows], ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        print(f"Backed up pet_documents rows → {json_backup}")

    upsert_sql = text(
        """
        INSERT INTO pet_documents (
            id, pet_id, kind, category, title, document_date, notes, source,
            url_masked, url_raw, establishment_name, storage_key, mime_type, size_bytes, event_id, created_at
        ) VALUES (
            :id, :pet_id, 'file', :category, :title, :document_date, NULL, 'upload',
            NULL, NULL, :establishment_name, :storage_key, :mime_type, :size_bytes, NULL, :created_at
        )
        ON CONFLICT (id) DO UPDATE SET
            category = EXCLUDED.category,
            title = EXCLUDED.title,
            document_date = EXCLUDED.document_date,
            establishment_name = EXCLUDED.establishment_name,
            storage_key = EXCLUDED.storage_key,
            mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes
        """
    )

    inserted = 0
    skipped = 0
    errors: list[str] = []

    with engine.connect() as conn:
        pet_ids = {r[0] for r in conn.execute(text("SELECT id FROM pets"))}

    for row in report:
        if row.get("classification_path") == "skipped_missing_file":
            skipped += 1
            errors.append(f"skip missing file: {row.get('doc_id')}")
            continue
        pet_id = row.get("pet_id")
        if pet_id not in pet_ids:
            skipped += 1
            errors.append(f"skip unknown pet {pet_id}: {row.get('doc_id')}")
            continue
        fname = row.get("file_name")
        if not fname:
            skipped += 1
            continue
        src = snapshot_docs / fname
        if not src.is_file():
            skipped += 1
            errors.append(f"skip snapshot missing {fname}")
            continue

        if not args.dry_run:
            uploads_dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, uploads_dest / fname)

        doc_date = _parse_date(row.get("classified_document_date"))
        created_at = _parse_dt(row.get("db_created_at")) or datetime.now(timezone.utc)
        title = row.get("db_title") or fname
        size_b = row.get("bytes_read") or row.get("db_size_bytes")

        params = {
            "id": row["doc_id"],
            "pet_id": pet_id,
            "category": row.get("classified_category"),
            "title": title[:255] if title else None,
            "document_date": doc_date,
            "establishment_name": row.get("classified_establishment"),
            "storage_key": fname,
            "mime_type": row.get("mime_stored"),
            "size_bytes": size_b,
            "created_at": created_at,
        }

        if args.dry_run:
            inserted += 1
            continue

        with engine.begin() as conn:
            conn.execute(upsert_sql, params)
        inserted += 1

    summary = {
        "upserted_or_would": inserted,
        "skipped": skipped,
        "dry_run": args.dry_run,
        "errors_sample": errors[:30],
    }
    (backup_root / "repopulate_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
