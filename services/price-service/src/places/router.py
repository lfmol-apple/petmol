"""FastAPI router for /api/pet-places — OSM-backed nearby lookup.

GET /api/pet-places/nearby
  ?lat=...&lng=...&radius_m=120&category=vet_clinic&limit=10

Resposta sempre vazia e barata (SQLite local); nunca chama Google.
Cache in-memory TTL 30 min por chave (lat3, lng3, radius, category).
"""
from __future__ import annotations

import logging
import math
import threading
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from .models import PetPlace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pet-places", tags=["PetPlaces"])

# ── In-memory Cache ────────────────────────────────────────────────────────

_cache_lock = threading.Lock()
_cache: dict[str, tuple[float, list]] = {}  # key → (expires_at, results)

CACHE_TTL_SECONDS = 30 * 60  # 30 min


def _cache_key(lat: float, lng: float, radius_m: int, category: Optional[str]) -> str:
    lat3 = round(lat, 3)
    lng3 = round(lng, 3)
    return f"{lat3}:{lng3}:{radius_m}:{category or ''}"


def _cache_get(key: str) -> list | None:
    with _cache_lock:
        entry = _cache.get(key)
        if entry and entry[0] > time.time():
            return entry[1]
        if entry:
            del _cache[key]
    return None


def _cache_set(key: str, value: list) -> None:
    with _cache_lock:
        _cache[key] = (time.time() + CACHE_TTL_SECONDS, value)


# ── Haversine ─────────────────────────────────────────────────────────────

def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in meters between two WGS84 coordinates."""
    R = 6_371_000  # Earth radius in metres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Endpoint ───────────────────────────────────────────────────────────────

@router.get("/nearby")
async def pet_places_nearby(
    lat: float = Query(..., description="Latitude WGS84"),
    lng: float = Query(..., description="Longitude WGS84"),
    radius_m: int = Query(120, ge=10, le=50_000, description="Buscar dentro de N metros"),
    category: Optional[str] = Query(None, description="Filtrar por categoria: vet_clinic | petshop | grooming | dog_park | hotel"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """
    Retorna estabelecimentos pet próximos a lat/lng dentro de radius_m metros.

    Dados servidos do banco local (SQLite) — SEM chamada externa.
    Alimentado pelo script import_osm_pet_places.py (job manual/cron).
    Cache in-memory TTL 30 min por (lat3, lng3, radius_m, category).
    """
    key = _cache_key(lat, lng, radius_m, category)
    cached = _cache_get(key)
    if cached is not None:
        logger.debug("[pet-places/nearby] cache HIT key=%s", key)
        return {"places": cached, "source": "cache", "count": len(cached)}

    # ── Bounding box pré-filtro (rápido, sem Haversine em todos os registros) ──
    # 1 grau de lat ≈ 111 km; 1 grau de lng ≈ 111 km * cos(lat)
    delta_lat = radius_m / 111_000
    delta_lng = radius_m / (111_000 * math.cos(math.radians(lat)) + 1e-9)

    q = db.query(PetPlace).filter(
        PetPlace.lat.between(lat - delta_lat, lat + delta_lat),
        PetPlace.lng.between(lng - delta_lng, lng + delta_lng),
    )
    if category:
        q = q.filter(PetPlace.category == category)

    candidates = q.all()

    # ── Haversine preciso + sort ───────────────────────────────────────────
    results = []
    for place in candidates:
        dist = _haversine_m(lat, lng, place.lat, place.lng)
        if dist <= radius_m:
            results.append((dist, place))

    results.sort(key=lambda x: x[0])
    results = results[:limit]

    payload = [p.to_dict(distance_m=d) for d, p in results]

    _cache_set(key, payload)
    logger.debug("[pet-places/nearby] cache MISS — %d results for key=%s", len(payload), key)

    return {"places": payload, "source": "db", "count": len(payload)}


@router.get("/stats")
async def pet_places_stats(db: Session = Depends(get_db)):
    """Resumo do banco de locais importados — para monitoramento."""
    from sqlalchemy import func as sqlfunc
    rows = (
        db.query(PetPlace.category, PetPlace.city, sqlfunc.count(PetPlace.id))
        .group_by(PetPlace.category, PetPlace.city)
        .order_by(sqlfunc.count(PetPlace.id).desc())
        .all()
    )
    total = db.query(PetPlace).count()
    return {
        "total": total,
        "by_category_city": [
            {"category": r[0], "city": r[1], "count": r[2]} for r in rows
        ],
    }
