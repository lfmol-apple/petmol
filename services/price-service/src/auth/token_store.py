"""
Token Store for Mercado Livre credentials.

Persists refresh_token securely in .secrets/ml.json
Never logs tokens, never exposes in API responses.
"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Secrets directory relative to price-service
SECRETS_DIR = Path(__file__).parent.parent.parent / ".secrets"
ML_TOKEN_FILE = SECRETS_DIR / "ml.json"


class MLTokenStore:
    """
    Secure storage for Mercado Livre OAuth tokens.
    
    Stores only refresh_token persistently.
    Access token cached in memory with expiry.
    """
    
    def __init__(self, secrets_path: Path = ML_TOKEN_FILE):
        self._path = secrets_path
        self._access_token: Optional[str] = None
        self._access_token_expires: Optional[datetime] = None
        self._ensure_secrets_dir()
    
    def _ensure_secrets_dir(self):
        """Create secrets directory with secure permissions."""
        if not self._path.parent.exists():
            self._path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            logger.info(f"Created secrets directory: {self._path.parent}")
    
    def _read_file(self) -> Dict[str, Any]:
        """Read token file if exists."""
        if not self._path.exists():
            return {}
        try:
            with open(self._path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            logger.error(f"Failed to read token file: {e}")
            return {}
    
    def _write_file(self, data: Dict[str, Any]):
        """Write token file with secure permissions."""
        self._ensure_secrets_dir()
        try:
            with open(self._path, "w") as f:
                json.dump(data, f, indent=2)
            os.chmod(self._path, 0o600)
            logger.info("Token file updated")
        except IOError as e:
            logger.error(f"Failed to write token file: {e}")
            raise
    
    # ===== Refresh Token (persistent) =====
    
    def get_refresh_token(self) -> Optional[str]:
        """Get stored refresh token."""
        data = self._read_file()
        return data.get("refresh_token")
    
    def save_refresh_token(self, refresh_token: str):
        """Save refresh token to disk."""
        data = self._read_file()
        data["refresh_token"] = refresh_token
        data["updated_at"] = datetime.utcnow().isoformat()
        self._write_file(data)
    
    def has_refresh_token(self) -> bool:
        """Check if refresh token is configured."""
        return bool(self.get_refresh_token())
    
    # ===== Access Token (memory only) =====
    
    def get_access_token(self) -> Optional[str]:
        """Get cached access token if still valid."""
        if self._access_token and self._access_token_expires:
            if datetime.utcnow() < self._access_token_expires:
                return self._access_token
        return None
    
    def set_access_token(self, access_token: str, expires_in: int):
        """Cache access token in memory."""
        self._access_token = access_token
        # Expire 60 seconds early to avoid edge cases
        from datetime import timedelta
        self._access_token_expires = datetime.utcnow() + timedelta(seconds=expires_in - 60)
    
    def clear_access_token(self):
        """Clear cached access token."""
        self._access_token = None
        self._access_token_expires = None
    
    # ===== Status =====
    
    def get_status(self) -> Dict[str, Any]:
        """Get status for debug endpoint (no tokens exposed)."""
        data = self._read_file()
        return {
            "configured": bool(data.get("refresh_token")),
            "has_refresh": bool(data.get("refresh_token")),
            "has_access_cached": self._access_token is not None,
            "access_expires": self._access_token_expires.isoformat() if self._access_token_expires else None,
            "last_updated": data.get("updated_at"),
        }
    
    def clear_all(self):
        """Clear all tokens (for testing/reset)."""
        self._access_token = None
        self._access_token_expires = None
        if self._path.exists():
            self._path.unlink()
            logger.info("Token file deleted")


@lru_cache
def get_token_store() -> MLTokenStore:
    """Get singleton token store instance."""
    return MLTokenStore()
