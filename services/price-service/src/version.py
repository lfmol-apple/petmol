"""
Version information for PETMOL API.
"""
from datetime import datetime
from typing import Optional

VERSION: str = "2.0.0"
BUILT_AT: Optional[str] = datetime.utcnow().isoformat() + "Z"

def get_version_info() -> dict:
    """Get version information."""
    return {
        "service": "price-service",
        "version": VERSION,
        "built_at": BUILT_AT,
    }
