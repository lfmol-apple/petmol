#!/usr/bin/env python3
"""
One-off analysis: classify files from a read-only snapshot of production pet documents.

Uses the SAME decision rules as src.pets.document_router._classify_from_content (keep in sync).
Does not connect to production; expects local copies of petmol.db + uploads/pet_documents/.

Read-only: never writes to the snapshot DB or files.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
import os
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path

# price-service root (parent of scripts/)
PRICE_SERVICE_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(PRICE_SERVICE_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(PRICE_SERVICE_ROOT / ".secrets" / ".env")
    load_dotenv(PRICE_SERVICE_ROOT / ".env")
except Exception:
    pass

from src.pets.document_router import (  # noqa: E402
    _GEMINI_SUPPORTED_MIMES,
    _classify_local,
    _gemini_classify_sync,
    _mime_from_ext,
)

logging.basicConfig(level=logging.WARNING)


def _resolve_mime_for_classification(stored_mime: str | None, storage_key: str) -> str:
    m = (stored_mime or "").strip() or "application/octet-stream"
    if m == "application/octet-stream":
        ext = Path(storage_key).suffix.lower()
        inferred = _mime_from_ext(ext)
        if inferred != "application/octet-stream":
            return inferred
    return m


async def classify_traced(
    content: bytes, mime: str, filename: str
) -> tuple[str, date | None, str | None, str]:
    """
    Mirror document_router._classify_from_content; returns (category, doc_date, establishment, source_tag).
    Source tags: gemini | local_after_gemini_timeout | local_after_gemini_error |
                 local_after_gemini_null | local_skipped_ai_disabled | local_skipped_no_api_key |
                 local_skipped_mime_unsupported
    """
    # Keep in sync with document_router._classify_from_content
    ai_enabled = os.environ.get("DOCUMENT_AI_CLASSIFY_ENABLED", "false").lower() not in ("false", "0", "no")
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    if not (ai_enabled and api_key and mime in _GEMINI_SUPPORTED_MIMES):
        if not ai_enabled:
            src = "local_skipped_ai_disabled"
        elif not api_key:
            src = "local_skipped_no_api_key"
        else:
            src = "local_skipped_mime_unsupported"
        c, d, e = _classify_local(content, mime, filename)
        return c, d, e, src

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(_gemini_classify_sync, content, mime, filename, api_key),
            timeout=15.0,
        )
        if result is not None:
            c, d, e = result
            return c, d, e, "gemini"
    except asyncio.TimeoutError:
        c, d, e = _classify_local(content, mime, filename)
        return c, d, e, "local_after_gemini_timeout"
    except Exception:
        c, d, e = _classify_local(content, mime, filename)
        return c, d, e, "local_after_gemini_error"

    c, d, e = _classify_local(content, mime, filename)
    return c, d, e, "local_after_gemini_null"


def uncertainty_note(
    category: str, doc_date: date | None, establishment: str | None, source_tag: str
) -> str:
    parts: list[str] = []
    if category == "other":
        parts.append("category_generic_other")
    if doc_date is None:
        parts.append("no_date_detected")
    if not establishment:
        parts.append("no_establishment_detected")
    if source_tag.startswith("local_skipped"):
        parts.append("ai_path_not_used")
    if not parts:
        return "heuristic_ok" if source_tag != "gemini" else "model_output_no_extra_flags"
    return ";".join(parts)


async def main_async() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--db", type=Path, help="Path to copied petmol.db (read-only); use with --metadata-jsonl OR this")
    p.add_argument(
        "--metadata-jsonl",
        type=Path,
        help="JSONL from read-only export (e.g. prod Postgres); each line = one row dict",
    )
    p.add_argument("--docs-dir", type=Path, required=True, help="Path to pet_documents/ folder")
    p.add_argument("--out-json", type=Path, required=True)
    p.add_argument("--out-csv", type=Path, required=True)
    p.add_argument("--out-summary", type=Path, required=True)
    args = p.parse_args()

    docs_dir = args.docs_dir.resolve()
    if not docs_dir.is_dir():
        print(f"Docs dir not found: {docs_dir}", file=sys.stderr)
        return 1

    rows: list[dict] = []
    if args.metadata_jsonl:
        meta_path = args.metadata_jsonl.resolve()
        if not meta_path.is_file():
            print(f"metadata jsonl not found: {meta_path}", file=sys.stderr)
            return 1
        with open(meta_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                # v2 snapshot exports storage_key_raw + storage_key_basename separately.
                # Normalise so that 'storage_key' always contains the clean basename, and
                # store the original raw value for audit traceability.
                if "storage_key_basename" in row and row["storage_key_basename"]:
                    row.setdefault("storage_key_raw_original", row.get("storage_key_raw"))
                    row["storage_key"] = row["storage_key_basename"]
                rows.append(row)
    elif args.db:
        db_path = args.db.resolve()
        if not db_path.is_file():
            print(f"DB not found: {db_path}", file=sys.stderr)
            return 1
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.id AS doc_id, d.pet_id, p.name AS pet_name, d.storage_key, d.mime_type,
                   d.title AS db_title, d.category AS db_category,
                   d.document_date AS db_document_date, d.establishment_name AS db_establishment,
                   d.size_bytes AS db_size_bytes
            FROM pet_documents d
            JOIN pets p ON p.id = d.pet_id
            WHERE d.kind = 'file' AND d.storage_key IS NOT NULL AND d.storage_key != ''
            ORDER BY d.created_at ASC
            """
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
    else:
        print("Provide --metadata-jsonl or --db", file=sys.stderr)
        return 1

    results: list[dict] = []
    for row in rows:
        storage_key = row["storage_key"]
        file_basename = Path(storage_key).name
        fpath = docs_dir / file_basename
        mime_used = _resolve_mime_for_classification(row.get("mime_type"), file_basename)
        entry: dict = {
            "doc_id": row["doc_id"],
            "pet_id": row["pet_id"],
            "pet_name": row["pet_name"],
            "storage_key": storage_key,
            "storage_key_raw_in_db": row.get("storage_key_raw_original") or storage_key,
            "file_name": file_basename,
            "file_present": fpath.is_file(),
            "mime_stored": row["mime_type"],
            "mime_used_for_classification": mime_used,
            "db_title": row.get("db_title"),
            "db_category": row.get("db_category"),
            "db_document_date": row.get("db_document_date"),
            "db_establishment": row.get("db_establishment"),
            "db_size_bytes": row.get("db_size_bytes"),
            "db_created_at": row.get("db_created_at"),
        }
        if not fpath.is_file():
            entry["classified_category"] = None
            entry["classified_document_date"] = None
            entry["classified_establishment"] = None
            entry["classification_path"] = "skipped_missing_file"
            entry["uncertainty_note"] = "file_not_in_snapshot"
            results.append(entry)
            continue

        content = fpath.read_bytes()
        cat, ddt, est, src = await classify_traced(content, mime_used, file_basename)
        entry["bytes_read"] = len(content)
        entry["classified_category"] = cat
        entry["classified_document_date"] = ddt.isoformat() if ddt else None
        entry["classified_establishment"] = est
        entry["classification_path"] = src
        entry["uncertainty_note"] = uncertainty_note(cat, ddt, est, src)
        results.append(entry)

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    fieldnames = list(results[0].keys()) if results else []
    with open(args.out_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in results:
            w.writerow(r)

    # Summary counts
    by_path: dict[str, int] = {}
    by_cat: dict[str, int] = {}
    missing = 0
    for r in results:
        by_path[r["classification_path"]] = by_path.get(r["classification_path"], 0) + 1
        if r.get("classified_category"):
            by_cat[r["classified_category"]] = by_cat.get(r["classified_category"], 0) + 1
        if r.get("classification_path") == "skipped_missing_file":
            missing += 1

    summary_lines = [
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"Total rows (DB file docs): {len(results)}",
        f"Missing files in snapshot: {missing}",
        "By classification_path:",
        *[f"  {k}: {v}" for k, v in sorted(by_path.items(), key=lambda x: -x[1])],
        "By classified_category (present files only):",
        *[f"  {k}: {v}" for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
        "",
        "DOCUMENT_AI_CLASSIFY_ENABLED=" + repr(os.environ.get("DOCUMENT_AI_CLASSIFY_ENABLED")),
        "GEMINI_API_KEY set=" + repr(bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))),
    ]
    args.out_summary.write_text("\n".join(summary_lines), encoding="utf-8")

    print(f"Wrote {args.out_json}")
    print(f"Wrote {args.out_csv}")
    print(f"Wrote {args.out_summary}")
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
