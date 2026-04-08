"""
Handoff service for lead tracking and attribution.

Every action that sends users to external services (WhatsApp, phone, Maps)
goes through handoff endpoints to:
1. Generate a lead_id for attribution
2. Log the event (without personal data)
3. Redirect with PETMOL-stamped message/URL
"""
import uuid
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class HandoffType(str, Enum):
    """Type of handoff action."""
    WHATSAPP = "whatsapp"
    CALL = "call"
    DIRECTIONS = "directions"
    WEBSITE = "website"
    SHOPPING = "shopping"


class ServiceCategory(str, Enum):
    """Service categories."""
    PETSHOP = "petshop"
    VET_CLINIC = "vet_clinic"
    VET_EMERGENCY = "vet_emergency"
    GROOMING = "grooming"
    HOTEL = "hotel"
    TRAINER = "trainer"
    OTHER = "other"


@dataclass
class HandoffEvent:
    """A single handoff event for logging."""
    lead_id: str
    handoff_type: HandoffType
    service_category: ServiceCategory
    place_id: str
    timestamp: datetime
    country: str
    locale: str
    # No personal data stored
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "lead_id": self.lead_id,
            "handoff_type": self.handoff_type.value,
            "service_category": self.service_category.value,
            "place_id": self.place_id,
            "timestamp": self.timestamp.isoformat(),
            "country": self.country,
            "locale": self.locale,
        }


class HandoffService:
    """
    Service for generating handoff URLs and tracking leads.
    
    Generates unique lead_id for each handoff action.
    Logs events for analytics without storing personal data.
    """
    
    def __init__(self):
        self._events: List[HandoffEvent] = []
        self._max_events = 10000  # In-memory buffer, production would use DB
    
    def generate_lead_id(self) -> str:
        """Generate a unique lead ID like PM-XXXX."""
        # Use UUID but make it shorter and readable
        uid = uuid.uuid4().hex[:8].upper()
        return f"PM-{uid}"
    
    def log_event(self, event: HandoffEvent):
        """Log a handoff event."""
        self._events.append(event)
        if len(self._events) > self._max_events:
            self._events = self._events[-self._max_events:]
        
        logger.info(
            f"[Handoff] {event.handoff_type.value} -> {event.place_id} "
            f"| lead={event.lead_id} | cat={event.service_category.value}"
        )
    
    def get_recent_events(self, limit: int = 100) -> List[HandoffEvent]:
        """Get recent handoff events."""
        return self._events[-limit:]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get handoff statistics."""
        stats: Dict[str, int] = {}
        for event in self._events:
            key = f"{event.handoff_type.value}_{event.service_category.value}"
            stats[key] = stats.get(key, 0) + 1
        
        return {
            "total_events": len(self._events),
            "breakdown": stats,
        }
    
    # =============================
    # URL Generators
    # =============================
    
    def create_whatsapp_url(
        self,
        phone: str,
        message: str,
    ) -> str:
        """
        Create WhatsApp URL with pre-filled message.
        
        Args:
            phone: Phone number (will be cleaned)
            message: Pre-filled message (already translated and formatted)
        
        Returns:
            WhatsApp universal URL
        """
        # Clean phone number (keep only digits and +)
        clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
        if not clean_phone.startswith("+"):
            # Assume Brazil if no country code
            if clean_phone.startswith("55"):
                clean_phone = f"+{clean_phone}"
            else:
                clean_phone = f"+55{clean_phone}"
        
        # URL encode message
        from urllib.parse import quote
        encoded_message = quote(message)
        
        return f"https://wa.me/{clean_phone.lstrip('+')}?text={encoded_message}"
    
    def create_call_url(self, phone: str) -> str:
        """Create tel: URL for calling."""
        clean_phone = "".join(c for c in phone if c.isdigit() or c == "+")
        return f"tel:{clean_phone}"
    
    def create_directions_url(
        self,
        place_id: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        name: Optional[str] = None,
        provider: str = "gmaps",  # waze, gmaps, apple
    ) -> str:
        """
        Create directions URL for multiple providers.
        
        Supports:
        - waze: Deep link waze://?ll=LAT,LNG&navigate=yes (fallback web)
        - gmaps: Google Maps with destination_place_id or coordinates
        - apple: Apple Maps http://maps.apple.com/?daddr=LAT,LNG
        """
        if provider == "waze":
            # Waze prefers coordinates
            if lat and lng:
                # Try app deep link first (will fallback to web if app not installed)
                return f"waze://?ll={lat},{lng}&navigate=yes"
            else:
                # Fallback to search
                from urllib.parse import quote
                query = quote(name) if name else "veterinary"
                return f"https://waze.com/ul?q={query}&navigate=yes"
        
        elif provider == "apple":
            # Apple Maps
            if lat and lng:
                return f"http://maps.apple.com/?daddr={lat},{lng}"
            else:
                from urllib.parse import quote
                query = quote(name) if name else "veterinary"
                return f"http://maps.apple.com/?q={query}"
        
        else:  # gmaps (default)
            # Google Maps
            base = "https://www.google.com/maps/dir/?api=1"
            
            if place_id:
                return f"{base}&destination_place_id={place_id}"
            elif lat and lng:
                destination = f"{lat},{lng}"
                if name:
                    from urllib.parse import quote
                    destination = quote(name)
                return f"{base}&destination={destination}"
            else:
                return base
    
    # =============================
    # Full Handoff Flow
    # =============================
    
    def process_handoff(
        self,
        handoff_type: HandoffType,
        place_id: str,
        service_category: ServiceCategory,
        country: str,
        locale: str,
        phone: Optional[str] = None,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        place_name: Optional[str] = None,
        message_template: Optional[str] = None,
        provider: str = "gmaps",  # For directions: waze/gmaps/apple
    ) -> Dict[str, Any]:
        """
        Process a handoff request.
        
        1. Generate lead_id
        2. Log event
        3. Return redirect URL
        
        Args:
            handoff_type: Type of handoff (whatsapp, call, directions)
            place_id: Google Place ID
            service_category: Category of service
            country: User's country
            locale: User's locale
            phone: Phone number (for whatsapp/call)
            lat/lng: Coordinates (for directions)
            place_name: Place name (for directions)
            message_template: Pre-translated message template
            provider: Direction provider (waze/gmaps/apple)
        
        Returns:
            Dict with lead_id and redirect_url
        """
        lead_id = self.generate_lead_id()
        
        # Log event
        event = HandoffEvent(
            lead_id=lead_id,
            handoff_type=handoff_type,
            service_category=service_category,
            place_id=place_id,
            timestamp=datetime.utcnow(),
            country=country,
            locale=locale,
        )
        self.log_event(event)
        
        # Generate URL
        if handoff_type == HandoffType.WHATSAPP:
            if not phone:
                raise ValueError("Phone required for WhatsApp handoff")
            if not message_template:
                message_template = f"Olá! Encontrei vocês pelo PETMOL. Código: {lead_id}"
            else:
                message_template = message_template.format(lead_id=lead_id)
            url = self.create_whatsapp_url(phone, message_template)
        
        elif handoff_type == HandoffType.CALL:
            if not phone:
                raise ValueError("Phone required for call handoff")
            url = self.create_call_url(phone)
        
        elif handoff_type == HandoffType.DIRECTIONS:
            url = self.create_directions_url(place_id, lat, lng, place_name, provider)
        
        else:
            raise ValueError(f"Unsupported handoff type: {handoff_type}")
        
        return {
            "lead_id": lead_id,
            "redirect_url": url,
            "handoff_type": handoff_type.value,
        }


# Singleton
handoff_service = HandoffService()
