"""SQLAlchemy model for pet_places — imported from OSM (or future sources).

Source of truth for offline-first nearby detection without Google Places.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from ..db import Base


class PetPlace(Base):
    """A pet-service location imported from an external source (e.g. OSM).

    Columns
    -------
    id            — auto PK
    source        — 'osm' | 'manual' | 'google'
    external_id   — "{type}/{osm_id}" for OSM, place_id for Google
    name          — display name
    category      — 'vet_clinic' | 'petshop' | 'grooming' | 'dog_park' | 'hotel'
    confidence    — 'HIGH' | 'MEDIUM' | 'LOW'
    lat, lng      — WGS84 coordinates
    address       — formatted address string
    city          — municipality name
    state         — state abbreviation (e.g. 'MG')
    country_code  — ISO-3166 alpha-2 (e.g. 'BR')
    tags_json     — raw OSM tags as JSON string (for auditability)
    created_at    — first import timestamp
    updated_at    — last upsert timestamp
    """

    __tablename__ = "pet_places"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Source tracking
    source = Column(String(32), nullable=False, default="osm")
    external_id = Column(String(128), nullable=False)

    # Core data
    name = Column(String(256), nullable=False)
    category = Column(String(64), nullable=False)
    confidence = Column(String(16), nullable=False, default="MEDIUM")

    # Geography
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    address = Column(String(512), nullable=True)
    city = Column(String(128), nullable=True)
    state = Column(String(8), nullable=True)
    country_code = Column(String(4), nullable=True, default="BR")

    # Raw data
    tags_json = Column(Text, nullable=True)  # JSON string of OSM tags

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        # source + external_id must be unique (upsert key)
        UniqueConstraint("source", "external_id", name="uq_pet_places_source_eid"),
        # Geo query index: lat + lng for Haversine-range scans
        Index("idx_pet_places_lat_lng", "lat", "lng"),
        # Filter by city/category
        Index("idx_pet_places_city_category", "city", "category"),
        Index("idx_pet_places_category", "category"),
    )

    # ── Helper ─────────────────────────────────────────────────────────────

    def tags(self) -> dict:
        """Return parsed tags_json dict (or empty dict)."""
        if not self.tags_json:
            return {}
        try:
            return json.loads(self.tags_json)
        except Exception:
            return {}

    def to_dict(self, distance_m: float | None = None) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "external_id": self.external_id,
            "name": self.name,
            "category": self.category,
            "confidence": self.confidence,
            "lat": self.lat,
            "lng": self.lng,
            "address": self.address,
            "city": self.city,
            "state": self.state,
            "country_code": self.country_code,
            "distance_m": round(distance_m) if distance_m is not None else None,
        }
