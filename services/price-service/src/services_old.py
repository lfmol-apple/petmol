"""
Services module for Google Places integration.

Provides nearby search for pet-related services:
- Petshops
- Veterinary clinics (including 24h emergency)
- Grooming (Banho & Tosa)
- Pet hotels / Daycare
- Dog trainers
"""
import os
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
import logging

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

logger = logging.getLogger(__name__)

# ── Cache em memória para /places/nearby ────────────────────────────────────
_nearby_cache: Dict[str, Any] = {}   # key → {"data": list, "expires_at": float}
_NEARBY_CACHE_TTL = 30 * 60           # 30 minutos

# ── Contador diário de chamadas + killswitch ─────────────────────────────
_places_call_counter: Dict[str, int] = {}  # "YYYY-MM-DD" -> contagem


def is_places_enabled() -> bool:
    """Verifica env PLACES_ENABLED (default: false — custo zero)."""
    return os.getenv("PLACES_ENABLED", "false").lower() not in ("false", "0", "no")


def check_and_increment_call_counter() -> bool:
    """Incrementa contador diário. Retorna False se PLACES_MAX_CALLS_PER_DAY for excedido."""
    max_calls = int(os.getenv("PLACES_MAX_CALLS_PER_DAY", "0") or "0")
    if max_calls <= 0:
        return True  # sem limite definido
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    count = _places_call_counter.get(today, 0)
    if count >= max_calls:
        logger.warning(f"[Places] Limite diário atingido: {count}/{max_calls}")
        return False
    _places_call_counter[today] = count + 1
    # Limpar dias antigos
    for k in list(_places_call_counter.keys()):
        if k != today:
            del _places_call_counter[k]
    return True


class PlacesApiError(Exception):
    """Exception for Google Places API errors that should be exposed to frontend."""
    def __init__(self, message: str, status: Optional[str] = None):
        self.message = message
        self.status = status
        super().__init__(message)


class ServiceCategory(str, Enum):
    """Service categories for Places search."""
    PETSHOP = "petshop"
    VET_CLINIC = "vet_clinic"
    VET_EMERGENCY = "vet_emergency"
    GROOMING = "grooming"
    HOTEL = "hotel"
    TRAINER = "trainer"


# Google Places type mappings
CATEGORY_SEARCH_CONFIG: Dict[ServiceCategory, Dict[str, Any]] = {
    ServiceCategory.PETSHOP: {
        "type": "pet_store",
        "keyword": "pet shop",
        "include_types": ["pet_store", "store"],
    },
    ServiceCategory.VET_CLINIC: {
        "type": "veterinary_care",
        "keyword": "veterinário clínica",
        "include_types": ["veterinary_care", "hospital"],
    },
    ServiceCategory.VET_EMERGENCY: {
        "type": "veterinary_care",
        "keyword": "veterinário 24 horas emergência",
        "include_types": ["veterinary_care", "hospital"],
        "require_open": True,  # Only show if open
    },
    ServiceCategory.GROOMING: {
        "type": "pet_store",
        "keyword": "banho tosa pet grooming",
        "include_types": ["pet_store"],
    },
    ServiceCategory.HOTEL: {
        "type": "lodging",
        "keyword": "hotel pet creche cachorro",
        "include_types": ["lodging", "pet_store"],
    },
    ServiceCategory.TRAINER: {
        "type": "pet_store",
        "keyword": "adestrador dog trainer",
        "include_types": ["pet_store", "gym"],
    },
}


@dataclass
class ServicePlace:
    """A place/establishment for pet services."""
    place_id: str
    name: str
    address: str
    lat: float
    lng: float
    category: ServiceCategory
    
    # Optional fields
    phone: Optional[str] = None
    website: Optional[str] = None
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    open_now: Optional[bool] = None
    distance_meters: Optional[int] = None
    photos: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "place_id": self.place_id,
            "name": self.name,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
            "category": self.category.value,
            "phone": self.phone,
            "website": self.website,
            "rating": self.rating,
            "rating_count": self.rating_count,
            "open_now": self.open_now,
            "distance_meters": self.distance_meters,
            "photos": self.photos,
        }
    
    @property
    def distance_text(self) -> Optional[str]:
        """Human-readable distance."""
        if self.distance_meters is None:
            return None
        if self.distance_meters < 1000:
            return f"{self.distance_meters}m"
        return f"{self.distance_meters / 1000:.1f}km"


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> int:
    """Calculate distance in meters between two points (Haversine)."""
    import math
    
    R = 6371000  # Earth radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    
    a = (math.sin(delta_lat / 2) ** 2 + 
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return int(R * c)


def is_pet_related(result: Dict, category: ServiceCategory, locale: str = 'en') -> bool:
    """
    Filter to ensure only PET-related establishments.
    Rejects human-only services (salons, spas, gyms, etc).
    
    MUNDIAL: Supports international keywords and business categories.
    
    Args:
        result: Google Places API result dict
        category: Service category being searched
        locale: BCP-47 locale for keyword matching
    
    Returns:
        True if establishment is pet-related
    """
    types = result.get("types", [])
    name = result.get("name", "").lower()
    business_status = result.get("business_status", "")
    
    # Skip permanently closed
    if business_status == "CLOSED_PERMANENTLY":
        return False
    
    # VETERINARY: Must have veterinary_care or animal_hospital in types
    if category in [ServiceCategory.VET_CLINIC, ServiceCategory.VET_EMERGENCY]:
        if "veterinary_care" not in types and "animal_hospital" not in types:
            return False
        # Reject if has human health types
        human_health = ["doctor", "dentist", "pharmacy", "hospital", "clinic"]
        if any(t in types for t in human_health):
            # Allow only if explicitly veterinary in name
            vet_keywords = ["vet", "veterinar", "animal"]
            if not any(kw in name for kw in vet_keywords):
                return False
        return True
    
    # PETSHOP: Must have pet_store in types
    if category == ServiceCategory.PETSHOP:
        if "pet_store" not in types:
            return False
        return True
    
    # GROOMING/HOTEL/TRAINER: More flexible - check name, types, and keywords
    if category in [ServiceCategory.GROOMING, ServiceCategory.HOTEL, ServiceCategory.TRAINER]:
        # International pet keywords (comprehensive list)
        pet_keywords_intl = [
            # English
            "pet", "dog", "cat", "animal", "canine", "feline", "puppy", "kitten", "paw",
            # Portuguese
            "cão", "cães", "cachorro", "gato", "gatos", "animal", "animais", "canil", "gatil", 
            "veterin", "pet", "bicho",
            # Spanish
            "perro", "perros", "gato", "gatos", "mascota", "mascotas", "canino", "canina", "felino",
            # French
            "chien", "chiens", "chat", "chats", "animaux", "animal",
            # Italian
            "cane", "cani", "gatto", "gatti", "animale", "animali",
        ]
        
        # Category-specific keywords
        if category == ServiceCategory.HOTEL:
            # Hotel/Daycare specific keywords (pet-specific terms)
            hotel_keywords = [
                "boarding", "daycare", "kennel", "hospedagem", 
                "creche canina", "guarderia canina", "pension canine", "guardería canina",
                "garderie canine", "pensione", "asilo", "hotelzinho", "dog hotel", "pet hotel"
            ]
            
            has_hotel_kw = any(kw in name for kw in hotel_keywords)
            has_pet_kw = any(kw in name for kw in pet_keywords_intl)
            has_relevant_type = any(t in types for t in ["pet_store", "veterinary_care"])
            
            # Accept if ANY of:
            # 1. Has pet keyword (e.g., "Hotel para Cães")
            # 2. Has pet-specific hotel keyword (e.g., "Boarding", "Creche Canina")
            # 3. Has relevant type (pet_store or veterinary_care)
            if not (has_pet_kw or has_hotel_kw or has_relevant_type):
                return False
            
            # Reject generic human hotels/daycares
            if not has_pet_kw and not has_hotel_kw:
                generic_names = ["marriott", "hilton", "plaza", "inn", "resort", "motel", "ibis", "accor", "infantil", "criança"]
                if any(kw in name for kw in generic_names):
                    return False
        
        elif category == ServiceCategory.GROOMING:
            grooming_keywords = ["grooming", "tosa", "banho", "salon", "peluquer", "toilettage", "toelettatura"]
            has_grooming_kw = any(kw in name for kw in grooming_keywords)
            has_pet_kw = any(kw in name for kw in pet_keywords_intl)
            
            if not (has_grooming_kw or has_pet_kw):
                return False
        
        elif category == ServiceCategory.TRAINER:
            trainer_keywords = ["train", "adestrad", "educad", "comportam", "dresseur", "éducateur"]
            has_trainer_kw = any(kw in name for kw in trainer_keywords)
            has_pet_kw = any(kw in name for kw in pet_keywords_intl)
            
            if not (has_trainer_kw or has_pet_kw):
                return False
        
        # Reject human-only establishments
        human_keywords = [
            # Portuguese
            "salão", "barbearia", "estética", "academia", "spa humano", "pessoas", "humanos",
            # English
            "human", "people", "barber shop", "hair salon", "beauty salon", "gym", "fitness",
            # Spanish
            "peluquería humana", "gimnasio", "spa humano",
            # French
            "salon de coiffure", "salle de sport",
        ]
        if any(kw in name for kw in human_keywords):
            return False
        
        return True
    
    return True


class ServicesProvider:
    """
    Provider for pet services using Google Places API.
    
    All API calls go through backend (never expose API key to frontend).
    """
    
    BASE_URL = "https://maps.googleapis.com/maps/api/place"
    TIMEOUT = 10.0
    
    def __init__(self):
        from .config import get_settings
        settings = get_settings()
        self._api_key = settings.google_maps_api_key_resolved
        self._available = bool(self._api_key) and HTTPX_AVAILABLE
        self._last_error: Optional[Dict[str, str]] = None
        
        if not self._api_key:
            logger.info("ServicesProvider: GOOGLE_MAPS_API_KEY not set")
        elif not HTTPX_AVAILABLE:
            logger.warning("ServicesProvider: httpx not installed")
    
    @property
    def is_available(self) -> bool:
        return self._available
    
    async def _fetch(self, endpoint: str, params: Dict) -> Dict:
        """Fetch from Places API. Raises PlacesApiError on error."""
        if not self.is_available:
            raise PlacesApiError("Google Places API not available (missing key or httpx)", "UNAVAILABLE")
        
        params["key"] = self._api_key
        url = f"{self.BASE_URL}/{endpoint}/json"
        
        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                response = await client.get(url, params=params)
                
                if response.status_code != 200:
                    error_msg = f"HTTP {response.status_code}"
                    self._last_error = {"status": str(response.status_code), "message": error_msg}
                    logger.error(f"Places API error: {error_msg}")
                    raise PlacesApiError(error_msg, str(response.status_code))
                
                data = response.json()
                status = data.get("status")
                
                # OK and ZERO_RESULTS are acceptable
                if status in ["OK", "ZERO_RESULTS"]:
                    self._last_error = None
                    return data
                
                # All other statuses are errors
                error_message = data.get("error_message", "Unknown error")
                error_msg = f"{status}: {error_message}"
                self._last_error = {"status": status, "message": error_message}
                logger.error(f"Places API error: {error_msg}")
                raise PlacesApiError(error_msg, status)
                
        except httpx.TimeoutException:
            error_msg = "Request timeout"
            self._last_error = {"status": "TIMEOUT", "message": error_msg}
            logger.error(f"Places API timeout")
            raise PlacesApiError(error_msg, "TIMEOUT")
        except PlacesApiError:
            raise
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            self._last_error = {"status": "EXCEPTION", "message": str(e)}
            logger.error(f"Places API exception: {e}")
            raise PlacesApiError(error_msg, "EXCEPTION")
    
    async def search_nearby(
        self,
        lat: float,
        lng: float,
        category: ServiceCategory,
        radius: int = 2000,   # 2km eco default
        limit: int = 10,
        locale: str = 'en',
        country: str = 'US',
        open_now: bool = False,
        quality_mode: str = "eco",  # "eco" (1 pass, sem details) | "normal" (2 passes, top-5 details)
    ) -> List[ServicePlace]:
        """
        Search for nearby pet services - MUNDIAL with multi-pass.
        
        Implements intelligent multi-pass search strategy:
        - Multiple type + keyword combinations per category
        - Deduplication by place_id
        - Sorted by distance, open_now, rating
        
        Args:
            lat: Latitude
            lng: Longitude
            category: Service category
            radius: Search radius in meters (max 50000)
            limit: Max results to return
            locale: BCP-47 locale (e.g., 'pt-BR', 'en-US', 'es')
            country: ISO-3166 alpha-2 country code (e.g., 'BR', 'US')
        
        Returns:
            List of ServicePlace sorted by: distance > open_now > rating
        """
        if not self.is_available:
            return []
        
        from .keyword_packs import get_keywords
        
        # Get localized keywords for this category
        keywords = get_keywords(category, locale)
        
        # Language code for API (remove region, e.g., 'pt-BR' -> 'pt')
        lang_code = locale.split('-')[0].lower()
        country_code = country.upper()
        
        # Multi-pass search strategy by category
        search_passes: List[Dict[str, Any]] = []
        
        if category == ServiceCategory.HOTEL:
            # Hotel/Daycare: broader search needed
            # Pass 1: pet_store + keywords
            if keywords:
                search_passes.append({
                    "type": "pet_store",
                    "keyword": " ".join(keywords[:3]),  # Top 3 keywords
                })
            # Pass 2: lodging + keywords
            search_passes.append({
                "type": "lodging",
                "keyword": " ".join(keywords[:4]) if keywords else "pet hotel dog",
            })
            # Pass 3: veterinary_care (sometimes daycares are listed there)
            search_passes.append({
                "type": "veterinary_care",
                "keyword": "daycare boarding" if locale.startswith('en') else keywords[0] if keywords else "creche",
            })
        
        elif category == ServiceCategory.GROOMING:
            # Grooming: pet_store + keywords
            if keywords:
                search_passes.append({
                    "type": "pet_store",
                    "keyword": " ".join(keywords[:3]),
                })
            # Fallback: beauty_salon + pet keywords
            search_passes.append({
                "type": "beauty_salon",
                "keyword": f"pet {keywords[0]}" if keywords else "pet grooming",
            })
        
        elif category == ServiceCategory.TRAINER:
            # Trainer: pet_store + keywords
            if keywords:
                search_passes.append({
                    "type": "pet_store",
                    "keyword": " ".join(keywords[:3]),
                })
            # Fallback: gym + pet keywords
            search_passes.append({
                "type": "gym",
                "keyword": f"dog {keywords[0]}" if keywords else "dog training",
            })
        
        elif category in [ServiceCategory.VET_CLINIC, ServiceCategory.VET_EMERGENCY]:
            # Veterinary: more specific
            search_passes.append({
                "type": "veterinary_care",
                "keyword": " ".join(keywords[:3]) if keywords else "veterinary",
            })
        
        elif category == ServiceCategory.PETSHOP:
            # Petshop: straightforward
            search_passes.append({
                "type": "pet_store",
                "keyword": " ".join(keywords[:3]) if keywords else "pet store",
            })
        
        # Collect all places (deduplicate by place_id)
        places_by_id: Dict[str, ServicePlace] = {}
        require_open = (category == ServiceCategory.VET_EMERGENCY)

        # Limitar passes pelo modo de qualidade
        if quality_mode == "eco":
            search_passes = search_passes[:1]   # Eco: apenas 1 pass (mais relevante)
            logger.info(f"[Services] eco mode: {len(search_passes)} pass para {category.value}")
        else:
            search_passes = search_passes[:2]   # Normal: máximo 2 passes
            logger.info(f"[Services] normal mode: {len(search_passes)} passes para {category.value}")

        for pass_config in search_passes:
            params = {
                "location": f"{lat},{lng}",
                "radius": min(radius, 50000),
                "type": pass_config["type"],
                "keyword": pass_config["keyword"],
                "language": lang_code,
                "region": country_code,
            }
            if open_now:
                params["opennow"] = "true"
            
            try:
                data = await self._fetch("nearbysearch", params)
            except PlacesApiError:
                # If one pass fails, continue with others
                logger.warning(f"[Services] Pass failed: {pass_config}")
                continue
            
            if not data:
                continue
            
            for result in data.get("results", []):
                place_id = result.get("place_id", "")
                
                # Skip if already have this place
                if place_id in places_by_id:
                    continue
                
                # Filter: only PET-related establishments
                if not is_pet_related(result, category, locale):
                    logger.debug(f"[Services] Rejected non-pet: {result.get('name')} - types: {result.get('types')}")
                    continue
                
                geometry = result.get("geometry", {}).get("location", {})
                place_lat = geometry.get("lat")
                place_lng = geometry.get("lng")
                
                if not place_lat or not place_lng:
                    continue
                
                # Check if open
                opening_hours = result.get("opening_hours", {})
                open_now = opening_hours.get("open_now")
                
                # Skip if require_open and not open
                if require_open and open_now is not True:
                    continue
                
                # Calculate distance
                distance = calculate_distance(lat, lng, place_lat, place_lng)
                
                # Get photos
                photos = []
                for photo in result.get("photos", [])[:3]:
                    photo_ref = photo.get("photo_reference")
                    if photo_ref and self._api_key:
                        # Create photo URL
                        photos.append(
                            f"{self.BASE_URL}/photo?maxwidth=400&photo_reference={photo_ref}&key={self._api_key}"
                        )
                
                place = ServicePlace(
                    place_id=place_id,
                    name=result.get("name", ""),
                    address=result.get("vicinity", ""),
                    lat=place_lat,
                    lng=place_lng,
                    category=category,
                    rating=result.get("rating"),
                    rating_count=result.get("user_ratings_total"),
                    open_now=open_now,
                    distance_meters=distance,
                    photos=photos,
                )
                places_by_id[place_id] = place
                
                # Stop if we have enough
                if len(places_by_id) >= limit * 2:
                    break
            
            # Stop searching if we have enough
            if len(places_by_id) >= limit * 2:
                break
        
        # Convert to list
        places = list(places_by_id.values())

        # FILTRO: remover lugares fora do raio solicitado
        places = [p for p in places if p.distance_meters and p.distance_meters <= radius]

        # Enrich com phone/website: eco = skip; normal = apenas top-5
        if places and quality_mode == "normal":
            enrich_places = places[:5]
            logger.info(f"[Services] Fetching details for {len(enrich_places)} places (normal mode)...")
            details = await asyncio.gather(
                *(self.get_place_details(p.place_id) for p in enrich_places),
                return_exceptions=True,
            )
            for place, detail in zip(enrich_places, details):
                if isinstance(detail, ServicePlace):
                    if detail.open_now is not None and place.open_now is None:
                        place.open_now = detail.open_now
                    if detail.phone:
                        place.phone = detail.phone
                    if detail.website:
                        place.website = detail.website
        
        # ORDENAÇÃO: do mais próximo ao mais distante (APENAS distância)
        places.sort(key=lambda p: p.distance_meters or 999999)
        
        logger.info(f"[Services] Found {len(places)} {category.value} places within {radius}m")
        
        # Retornar até o limite máximo
        if limit is None:
            return places
        if isinstance(limit, int):
            return places[:limit]
        # Try to convert if it's somehow a string
        try:
            return places[:int(limit)]
        except (ValueError, TypeError):
            logger.warning(f"Invalid limit type: {type(limit)}, returning all places")
            return places
    
    async def get_place_details(self, place_id: str) -> Optional[ServicePlace]:
        """Get detailed information about a place including phone."""
        if not self.is_available:
            return None
        
        params = {
            "place_id": place_id,
            "fields": "place_id,name,formatted_address,geometry,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,opening_hours,photos,types",
        }
        
        data = await self._fetch("details", params)
        
        if not data or "result" not in data:
            return None
        
        result = data["result"]
        geometry = result.get("geometry", {}).get("location", {})
        
        # Get photos
        photos = []
        for photo in result.get("photos", [])[:5]:
            photo_ref = photo.get("photo_reference")
            if photo_ref and self._api_key:
                photos.append(
                    f"{self.BASE_URL}/photo?maxwidth=800&photo_reference={photo_ref}&key={self._api_key}"
                )
        
        # Determine category from types
        types = result.get("types", [])
        category = ServiceCategory.PETSHOP  # Default
        if "veterinary_care" in types:
            category = ServiceCategory.VET_CLINIC
        
        opening_hours = result.get("opening_hours", {})
        
        return ServicePlace(
            place_id=result.get("place_id", place_id),
            name=result.get("name", ""),
            address=result.get("formatted_address", ""),
            lat=geometry.get("lat", 0),
            lng=geometry.get("lng", 0),
            category=category,
            phone=result.get("formatted_phone_number") or result.get("international_phone_number"),
            website=result.get("website"),
            rating=result.get("rating"),
            rating_count=result.get("user_ratings_total"),
            open_now=opening_hours.get("open_now"),
            photos=photos,
        )
    
    async def find_emergency_vet(
        self,
        lat: float,
        lng: float,
        radius: int = 30000,
        open_now: bool = True,
        locale: str = "pt-BR",
    ) -> Dict[str, Any]:
        """
        Find emergency veterinarians with MUNDIAL high-recall multi-pass search.
        
        Multi-pass strategy:
        1. "hospital veterinário" (or "veterinary hospital" for English)
        2. "veterinário" (or "veterinary")
        3. No keyword, just type=veterinary_care
        
        If open_now=True, tries first pass with opennow filter, if empty repeats without.
        
        Args:
            lat: Latitude
            lng: Longitude
            radius: Search radius in meters (1000-50000)
            open_now: Filter by open now
            locale: Language/locale (pt-BR, en-US, etc)
        
        Returns:
            Dict with open_places, nearby_places, has_open
        """
        all_results: List[ServicePlace] = []
        seen_place_ids = set()
        
        # Determine keywords based on locale
        is_english = locale.startswith("en")
        keywords = [
            "veterinary hospital" if is_english else "hospital veterinário",
            "veterinary" if is_english else "veterinário",
            None,  # No keyword, just type
        ]
        
        for idx, keyword in enumerate(keywords):
            params = {
                "location": f"{lat},{lng}",
                "radius": radius,
                "type": "veterinary_care",
                "language": locale,
            }
            
            if keyword:
                params["keyword"] = keyword
            
            # Only apply opennow filter on FIRST pass if open_now=True
            if idx == 0 and open_now:
                params["opennow"] = "true"
            
            try:
                data = await self._fetch("nearbysearch", params)
                
                # If first pass with opennow returned ZERO_RESULTS, retry without opennow
                if idx == 0 and open_now and data.get("status") == "ZERO_RESULTS":
                    logger.info(f"[Emergency] First pass with opennow=true returned 0 results, retrying without")
                    del params["opennow"]
                    data = await self._fetch("nearbysearch", params)
                
                for result in data.get("results", []):
                    place_id = result.get("place_id")
                    if place_id in seen_place_ids:
                        continue
                    seen_place_ids.add(place_id)
                    
                    # CRITICAL: Only veterinary_care type
                    types = result.get("types", [])
                    if "veterinary_care" not in types:
                        logger.debug(f"[Emergency] Rejected non-veterinary_care: {result.get('name')} - types: {types}")
                        continue
                    
                    geometry = result.get("geometry", {}).get("location", {})
                    place_lat = geometry.get("lat")
                    place_lng = geometry.get("lng")
                    
                    if not place_lat or not place_lng:
                        continue
                    
                    distance = calculate_distance(lat, lng, place_lat, place_lng)
                    opening_hours = result.get("opening_hours", {})
                    is_open = opening_hours.get("open_now")
                    
                    # Calculate emergency_score based on name/keywords
                    name_lower = result.get("name", "").lower()
                    emergency_keywords = ["24", "24h", "plantão", "emergencia", "emergency", "urgent", "hospital"]
                    emergency_score = sum(1 for kw in emergency_keywords if kw in name_lower)
                    
                    place = ServicePlace(
                        place_id=place_id,
                        name=result.get("name", ""),
                        address=result.get("vicinity", ""),
                        lat=place_lat,
                        lng=place_lng,
                        category=ServiceCategory.VET_EMERGENCY,
                        rating=result.get("rating"),
                        rating_count=result.get("user_ratings_total"),
                        open_now=is_open,
                        distance_meters=distance,
                    )
                    # Store emergency_score for sorting (not in dataclass)
                    place._emergency_score = emergency_score
                    all_results.append(place)
                
                # If we got good results, can stop early
                if len(all_results) >= 10:
                    break
                    
            except PlacesApiError:
                # Let it bubble up to endpoint
                raise
            except Exception as e:
                logger.error(f"[Emergency] Pass {idx} failed: {e}")
                continue
        
        # FILTRO: remover lugares fora do raio solicitado
        all_results = [p for p in all_results if p.distance_meters and p.distance_meters <= radius]
        
        # Rank by: open_now desc > emergency_score desc > distance asc > rating desc
        all_results.sort(
            key=lambda p: (
                0 if p.open_now is True else 1,  # Open first
                -getattr(p, "_emergency_score", 0),  # Higher score first
                p.distance_meters or 999999,  # Closer first
                -(p.rating or 0),  # Higher rating first
            )
        )

        # Enrich ALL emergency places with phone/website details
        if all_results:
            logger.info(f"[Emergency] Fetching details for {len(all_results)} places...")
            details = await asyncio.gather(
                *(self.get_place_details(p.place_id) for p in all_results),
                return_exceptions=True,
            )
            for place, detail in zip(all_results, details):
                if isinstance(detail, ServicePlace):
                    if detail.open_now is not None and place.open_now is None:
                        place.open_now = detail.open_now
                    if detail.phone:
                        place.phone = detail.phone
                    if detail.website:
                        place.website = detail.website
        
        # Split into open and nearby
        if open_now:
            open_places = [p for p in all_results if p.open_now is True]
            nearby_places = [p for p in all_results if p.open_now is not True][:10]
        else:
            open_places = []
            nearby_places = all_results[:20]
        
        return {
            "open_place": open_places[0] if open_places else None,
            "open_places": open_places,
            "nearby_places": nearby_places,
            "has_open": len(open_places) > 0,
        }


# Singleton
services_provider = ServicesProvider()


# ===== Helper functions for API routes =====

async def search_nearby_places(
    lat: float,
    lng: float,
    category: ServiceCategory,
    radius_meters: int = 2000,
    limit: int = 10,
    locale: str = "pt-BR",
    country: str = "BR",
    open_now: bool = False,
    quality_mode: str = "eco",
) -> List[ServicePlace]:
    """
    Helper function to search nearby places.
    Wraps ServicesProvider.search_nearby com cache 30 min e control de quality_mode.
    """
    # Killswitch
    if not is_places_enabled():
        logger.info("[Places] Desativado por PLACES_ENABLED=false")
        return []

    # Limite diário
    if not check_and_increment_call_counter():
        logger.warning("[Places] Limite diário de chamadas atingido")
        return []

    # Chave de cache: lat/lng com 3 casas decimais (~111m de precisão)
    lat_r = round(lat, 3)
    lng_r = round(lng, 3)
    cache_key = f"{category.value}:{lat_r}:{lng_r}:{radius_meters}:{locale}:{country}:{open_now}:{quality_mode}"

    cached = _nearby_cache.get(cache_key)
    if cached and cached["expires_at"] > time.time():
        logger.info(f"[nearby_cache] HIT {cache_key}")
        return cached["data"]

    logger.info(f"[nearby_cache] MISS {cache_key}")

    places = await services_provider.search_nearby(
        lat=lat,
        lng=lng,
        category=category,
        radius=radius_meters,
        limit=limit,
        locale=locale,
        country=country,
        open_now=open_now,
        quality_mode=quality_mode,
    )

    if open_now:
        places = [p for p in places if p.open_now is True]

    # Salvar no cache
    _nearby_cache[cache_key] = {"data": places, "expires_at": time.time() + _NEARBY_CACHE_TTL}
    return places
