"""Local disk storage provider (dev/fallback)."""
import os
from pathlib import Path
from .base import StorageProvider


class LocalDiskStorage(StorageProvider):
    def __init__(self, uploads_dir: str = "uploads"):
        self.base = Path(uploads_dir)
        self.base.mkdir(parents=True, exist_ok=True)

    def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        dest = self.base / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return key

    def get_url(self, key: str, expires_in: int = 600) -> str:
        # Returns a relative path; the caller constructs the full URL.
        return f"/attachments/{key}/download"

    def delete(self, key: str) -> None:
        path = self.base / key
        if path.exists():
            path.unlink()
