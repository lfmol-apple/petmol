"""Storage provider factory — picks backend from settings."""
from functools import lru_cache
from .base import StorageProvider


@lru_cache(maxsize=1)
def get_storage_provider() -> StorageProvider:
    from ..config import get_settings
    settings = get_settings()

    backend = getattr(settings, "storage_backend", "local").lower()

    if backend == "r2":
        from .r2 import S3CompatibleStorage
        return S3CompatibleStorage(
            endpoint=settings.r2_endpoint,
            access_key_id=settings.r2_access_key_id,
            secret_access_key=settings.r2_secret_access_key,
            bucket=settings.r2_bucket,
        )

    from .local import LocalDiskStorage
    uploads_dir = getattr(settings, "uploads_dir", "uploads")
    return LocalDiskStorage(uploads_dir=uploads_dir)
