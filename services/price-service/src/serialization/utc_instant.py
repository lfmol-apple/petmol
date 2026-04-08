"""Serialize aware datetimes as ISO-8601 UTC with Z in JSON (unambiguous instants)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from pydantic import PlainSerializer


def datetime_to_utc_z_str(value: Any) -> Any:
    if value is None:
        return None
    if not isinstance(value, datetime):
        return value
    dt = value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


UtcInstant = Annotated[datetime, PlainSerializer(datetime_to_utc_z_str, when_used="json")]
OptionalUtcInstant = Annotated[
    Optional[datetime],
    PlainSerializer(datetime_to_utc_z_str, when_used="json"),
]
