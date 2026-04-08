"""Abstract storage provider interface."""
from abc import ABC, abstractmethod
from typing import Optional


class StorageProvider(ABC):
    """Base class for all storage backends."""

    @abstractmethod
    def save(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Save bytes to the given key. Returns the storage key."""

    @abstractmethod
    def get_url(self, key: str, expires_in: int = 600) -> str:
        """Return a URL to access the object.
        - R2: signed URL valid for `expires_in` seconds
        - Local: path fragment (caller constructs full URL)
        """

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete object by key."""
