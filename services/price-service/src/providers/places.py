"""
Google Places Provider

Uses Google Places API for establishment autocomplete and details.
Only active if GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY environment variable is set.

API Docs: https://developers.google.com/maps/documentation/places/web-service
"""
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
import logging

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from .base import (
    ProviderStatus,
    ProviderError,
    log_global_error,
)
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class PlacePrediction:
    """A place autocomplete prediction."""
    place_id: str
    name: str
    address: str
    types: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "place_id": self.place_id,
            "name": self.name,
            "address": self.address,
            "types": self.types,
        }


@dataclass
class PlaceDetails:
    """Detailed place information."""
    place_id: str
    name: str
    address: str
    lat: float
    lng: float
    phone: Optional[str] = None
    website: Optional[str] = None
    rating: Optional[float] = None
    types: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "place_id": self.place_id,
            "name": self.name,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
            "phone": self.phone,
            "website": self.website,
            "rating": self.rating,
            "types": self.types,
        }


class PlacesCache:
    """Cache for Places API results."""
    
    def __init__(self, ttl_autocomplete: int = 300, ttl_details: int = 86400):
        self.ttl_autocomplete = timedelta(seconds=ttl_autocomplete)  # 5 min
        self.ttl_details = timedelta(seconds=ttl_details)  # 24 hours
        self._cache: Dict[str, tuple[datetime, Any]] = {}
    
    def _make_key(self, prefix: str, *args) -> str:
        return f"{prefix}:" + hashlib.md5(":".join(str(a) for a in args).encode()).hexdigest()
    
    def get_autocomplete(self, *args) -> Optional[List[PlacePrediction]]:
        key = self._make_key("ac", *args)
        if key in self._cache:
            ts, value = self._cache[key]
            if datetime.utcnow() - ts < self.ttl_autocomplete:
                return value
            del self._cache[key]
        return None
    
    def set_autocomplete(self, value: List[PlacePrediction], *args):
        key = self._make_key("ac", *args)
        self._cache[key] = (datetime.utcnow(), value)
    
    def get_details(self, place_id: str) -> Optional[PlaceDetails]:
        key = self._make_key("details", place_id)
        if key in self._cache:
            ts, value = self._cache[key]
            if datetime.utcnow() - ts < self.ttl_details:
                return value
            del self._cache[key]
        return None
    
    def set_details(self, place_id: str, value: PlaceDetails):
        key = self._make_key("details", place_id)
        self._cache[key] = (datetime.utcnow(), value)


class GooglePlacesProvider:
    """
    Google Places API provider.
    
    Requires GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY environment variable.
    """
    
    name = "places"
    display_name = "Google Places"
    
    BASE_URL = "https://maps.googleapis.com/maps/api/place"
    TIMEOUT = 8.0
    
    def __init__(self):
        import os
        # ── Kill switch global: PLACES_ENABLED (default false) ────────────────
        _places_enabled = os.getenv("PLACES_ENABLED", "false").lower() not in ("false", "0", "no")

        # Use unified key (GOOGLE_PLACES_KEY with fallback to GOOGLE_MAPS_API_KEY)
        self._api_key = settings.google_maps_api_key_resolved
        self._cache = PlacesCache()
        self._errors: List[ProviderError] = []
        self._last_error: Optional[ProviderError] = None

        if not _places_enabled:
            self._status = ProviderStatus.DISABLED
            logger.info("[Places] PLACES_DISABLED — returning empty (PLACES_ENABLED=false)")
        elif not self._api_key:
            self._status = ProviderStatus.MISSING_CONFIG
            logger.info("Google Places provider: GOOGLE_PLACES_KEY/GOOGLE_MAPS_API_KEY not set")
        elif not HTTPX_AVAILABLE:
            self._status = ProviderStatus.DISABLED
            logger.warning("Google Places provider disabled: httpx not installed")
        else:
            self._status = ProviderStatus.ACTIVE
    
    @property
    def status(self) -> ProviderStatus:
        return self._status
    
    @property
    def is_available(self) -> bool:
        return self._status == ProviderStatus.ACTIVE
    
    def get_info(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "display_name": self.display_name,
            "status": self._status.value,
            "configured": bool(self._api_key),
            "last_error": self._last_error.to_dict() if self._last_error else None,
        }
    
    def _log_error(self, error: ProviderError):
        self._last_error = error
        self._errors.append(error)
        if len(self._errors) > 50:
            self._errors = self._errors[-50:]
        log_global_error(error)
        logger.warning(f"[Places] {error.error_type}: {error.message}")
    
    async def _fetch(self, endpoint: str, params: Dict) -> Optional[Dict]:
        """Fetch from Places API."""
        if not self.is_available:
            return None
        
        params["key"] = self._api_key
        url = f"{self.BASE_URL}/{endpoint}/json"
        
        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                response = await client.get(url, params=params)
                
                if response.status_code != 200:
                    self._log_error(ProviderError(
                        provider=self.name,
                        error_type="http_error",
                        message=f"HTTP {response.status_code}",
                        status_code=response.status_code,
                    ))
                    return None
                
                data = response.json()
                
                if data.get("status") not in ["OK", "ZERO_RESULTS"]:
                    self._log_error(ProviderError(
                        provider=self.name,
                        error_type="api_error",
                        message=data.get("error_message", data.get("status")),
                    ))
                    return None
                
                return data
                
        except httpx.TimeoutException:
            self._log_error(ProviderError(
                provider=self.name,
                error_type="timeout",
                message=f"Request timeout after {self.TIMEOUT}s",
            ))
        except Exception as e:
            self._log_error(ProviderError(
                provider=self.name,
                error_type="exception",
                message=str(e),
            ))
        
        return None
    
    async def autocomplete(
        self,
        query: str,
        country: str = "BR",
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        radius: int = 50000,  # 50km
        limit: int = 8,
    ) -> List[PlacePrediction]:
        """
        Get place autocomplete predictions.
        
        Types focused on pet stores and similar establishments.
        """
        
        if not self.is_available:
            return []
        
        # Check cache
        cached = self._cache.get_autocomplete(query, country, lat, lng, radius)
        if cached is not None:
            return cached[:limit]
        
        params = {
            "input": query,
            "types": "establishment",
            "components": f"country:{country.lower()}",
        }
        
        if lat and lng:
            params["location"] = f"{lat},{lng}"
            params["radius"] = str(radius)
        
        data = await self._fetch("autocomplete", params)
        
        if not data:
            return []
        
        predictions = []
        for p in data.get("predictions", [])[:limit]:
            pred = PlacePrediction(
                place_id=p.get("place_id", ""),
                name=p.get("structured_formatting", {}).get("main_text", ""),
                address=p.get("structured_formatting", {}).get("secondary_text", ""),
                types=p.get("types", []),
            )
            predictions.append(pred)
        
        self._cache.set_autocomplete(predictions, query, country, lat, lng, radius)
        logger.info(f"[Places] Found {len(predictions)} predictions for '{query}'")
        
        return predictions
    
    async def get_details(self, place_id: str) -> Optional[PlaceDetails]:
        """Get detailed information about a place."""
        
        if not self.is_available:
            return None
        
        # Check cache
        cached = self._cache.get_details(place_id)
        if cached is not None:
            return cached
        
        params = {
            "place_id": place_id,
            "fields": "place_id,name,formatted_address,geometry,formatted_phone_number,website,rating,types",
        }
        
        data = await self._fetch("details", params)
        
        if not data or "result" not in data:
            return None
        
        result = data["result"]
        geometry = result.get("geometry", {}).get("location", {})
        
        details = PlaceDetails(
            place_id=result.get("place_id", place_id),
            name=result.get("name", ""),
            address=result.get("formatted_address", ""),
            lat=geometry.get("lat", 0),
            lng=geometry.get("lng", 0),
            phone=result.get("formatted_phone_number"),
            website=result.get("website"),
            rating=result.get("rating"),
            types=result.get("types", []),
        )
        
        self._cache.set_details(place_id, details)
        
        return details


# Singleton
google_places_provider = GooglePlacesProvider()
