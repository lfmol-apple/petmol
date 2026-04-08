"""
Internationalization (i18n) support for PETMOL.

Supports: pt-BR, en, es, fr, it, de-DE, ja-JP, zh-CN, ru-RU, tr-TR
Auto-detection order:
1. User preference (cookie/header)
2. Geolocation country (if permitted)
3. Accept-Language header
4. IP-based country (if available)
5. Default: en
"""
from typing import Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum


class Locale(str, Enum):
    """Supported locales."""
    PT_BR = "pt-BR"
    EN = "en"
    ES = "es"
    FR = "fr"
    IT = "it"
    DE_DE = "de-DE"
    JA_JP = "ja-JP"
    ZH_CN = "zh-CN"
    RU_RU = "ru-RU"
    TR_TR = "tr-TR"


class Country(str, Enum):
    """Supported countries for features."""
    BR = "BR"
    AR = "AR"
    MX = "MX"
    CO = "CO"
    CL = "CL"
    US = "US"
    GB = "GB"
    DE = "DE"
    FR = "FR"
    IT = "IT"
    JP = "JP"
    CN = "CN"
    RU = "RU"
    TR = "TR"
    # More countries as we expand


class UnitSystem(str, Enum):
    """Unit system for measurements."""
    METRIC = "metric"
    IMPERIAL = "imperial"


# Country to default locale mapping
COUNTRY_LOCALE_MAP: Dict[str, Locale] = {
    # Portuguese
    "BR": Locale.PT_BR,
    "PT": Locale.PT_BR,
    # Spanish
    "AR": Locale.ES,
    "MX": Locale.ES,
    "CO": Locale.ES,
    "CL": Locale.ES,
    "ES": Locale.ES,
    "PE": Locale.ES,
    "VE": Locale.ES,
    # English
    "US": Locale.EN,
    "GB": Locale.EN,
    "CA": Locale.EN,
    "AU": Locale.EN,
    # French
    "FR": Locale.FR,
    "BE": Locale.FR,
    # Italian
    "IT": Locale.IT,
    # German
    "DE": Locale.DE_DE,
    "AT": Locale.DE_DE,
    "CH": Locale.DE_DE,
    # Japanese
    "JP": Locale.JA_JP,
    # Chinese
    "CN": Locale.ZH_CN,
    "TW": Locale.ZH_CN,
    "HK": Locale.ZH_CN,
    # Russian
    "RU": Locale.RU_RU,
    # Turkish
    "TR": Locale.TR_TR,
}

# Country to unit system mapping
COUNTRY_UNITS_MAP: Dict[str, UnitSystem] = {
    "US": UnitSystem.IMPERIAL,
    "LR": UnitSystem.IMPERIAL,
    "MM": UnitSystem.IMPERIAL,
}

# Countries with price comparison enabled
PRICES_ENABLED_COUNTRIES = {"BR", "AR", "MX", "CO", "CL"}


@dataclass
class GeoContext:
    """
    Geographic context for a request.
    Single source of truth for country, locale, and units.
    """
    country: str  # ISO 3166-1 alpha-2
    locale: Locale
    units: UnitSystem
    prices_enabled: bool
    timezone: Optional[str] = None
    
    @classmethod
    def from_country(cls, country: str) -> "GeoContext":
        """Create GeoContext from country code."""
        country = country.upper()
        locale = COUNTRY_LOCALE_MAP.get(country, Locale.EN)
        units = COUNTRY_UNITS_MAP.get(country, UnitSystem.METRIC)
        prices_enabled = country in PRICES_ENABLED_COUNTRIES
        
        return cls(
            country=country,
            locale=locale,
            units=units,
            prices_enabled=prices_enabled,
        )
    
    @classmethod
    def default(cls) -> "GeoContext":
        """Default context (English, US)."""
        return cls(
            country="US",
            locale=Locale.EN,
            units=UnitSystem.IMPERIAL,
            prices_enabled=False,
        )
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "country": self.country,
            "locale": self.locale.value,
            "units": self.units.value,
            "prices_enabled": self.prices_enabled,
            "timezone": self.timezone,
        }


# =============================
# Translations
# =============================

TRANSLATIONS: Dict[str, Dict[str, str]] = {
    # General
    "app.name": {
        "pt-BR": "PETMOL",
        "en": "PETMOL",
        "es": "PETMOL",
    },
    "app.tagline": {
        "pt-BR": "Compare preços de rações e produtos para seu pet",
        "en": "Compare prices on pet food and products",
        "es": "Compara precios de alimentos y productos para tu mascota",
    },
    
    # Search
    "search.placeholder": {
        "pt-BR": "Buscar ração... (ex: Royal Canin, Golden)",
        "en": "Search pet food... (e.g., Royal Canin, Purina)",
        "es": "Buscar alimento... (ej: Royal Canin, Purina)",
    },
    "search.button": {
        "pt-BR": "Buscar",
        "en": "Search",
        "es": "Buscar",
    },
    
    # Home actions
    "home.reorder": {
        "pt-BR": "Recompra",
        "en": "Reorder",
        "es": "Recompra",
    },
    "home.reorder.desc": {
        "pt-BR": "Pra não faltar",
        "en": "Never run out",
        "es": "Para no quedarte sin",
    },
    "home.emergency": {
        "pt-BR": "🚨 Socorro Agora",
        "en": "🚨 Emergency Now",
        "es": "🚨 Urgencia Ahora",
    },
    "home.emergency.desc": {
        "pt-BR": "Veterinário 24h aberto",
        "en": "24h vet open now",
        "es": "Veterinario 24h abierto",
    },
    "home.services": {
        "pt-BR": "Serviços",
        "en": "Services",
        "es": "Servicios",
    },
    "home.services.desc": {
        "pt-BR": "Petshops, clínicas, banho...",
        "en": "Pet shops, clinics, grooming...",
        "es": "Tiendas, clínicas, baño...",
    },
    "home.tips": {
        "pt-BR": "Dúvidas rápidas",
        "en": "Quick tips",
        "es": "Consejos rápidos",
    },
    "home.tips.desc": {
        "pt-BR": "Comportamento e cuidados",
        "en": "Behavior and care",
        "es": "Comportamiento y cuidados",
    },
    "home.favorites": {
        "pt-BR": "Favoritos",
        "en": "Favorites",
        "es": "Favoritos",
    },
    "home.favorites.desc": {
        "pt-BR": "Seus produtos e locais",
        "en": "Your products and places",
        "es": "Tus productos y lugares",
    },
    
    # Services categories
    "services.petshops": {
        "pt-BR": "Petshops",
        "en": "Pet Shops",
        "es": "Tiendas de Mascotas",
    },
    "services.clinics": {
        "pt-BR": "Clínicas Veterinárias",
        "en": "Veterinary Clinics",
        "es": "Clínicas Veterinarias",
    },
    "services.grooming": {
        "pt-BR": "Banho & Tosa",
        "en": "Grooming",
        "es": "Peluquería",
    },
    "services.hotel": {
        "pt-BR": "Hotel / Creche",
        "en": "Pet Hotel / Daycare",
        "es": "Hotel / Guardería",
    },
    "services.trainer": {
        "pt-BR": "Adestrador",
        "en": "Dog Trainer",
        "es": "Adiestrador",
    },
    
    # Emergency
    "emergency.title": {
        "pt-BR": "Emergência Veterinária",
        "en": "Veterinary Emergency",
        "es": "Emergencia Veterinaria",
    },
    "emergency.finding": {
        "pt-BR": "Buscando veterinário 24h mais próximo...",
        "en": "Finding nearest 24h vet...",
        "es": "Buscando veterinario 24h más cercano...",
    },
    "emergency.none_open": {
        "pt-BR": "Não encontramos veterinário 24h aberto agora",
        "en": "No 24h vet found open right now",
        "es": "No encontramos veterinario 24h abierto ahora",
    },
    "emergency.see_nearby": {
        "pt-BR": "Ver mais próximos (horário a confirmar)",
        "en": "See nearby (confirm hours)",
        "es": "Ver cercanos (confirmar horario)",
    },
    "emergency.call_nearest": {
        "pt-BR": "Ligar para o mais próximo",
        "en": "Call the nearest",
        "es": "Llamar al más cercano",
    },
    "emergency.change_location": {
        "pt-BR": "Trocar cidade/bairro",
        "en": "Change location",
        "es": "Cambiar ubicación",
        "fr": "Changer de lieu",
        "it": "Cambia posizione",
        "de-DE": "Standort ändern",
        "ja-JP": "場所を変更",
        "zh-CN": "更改位置",
        "ru-RU": "Изменить местоположение",
        "tr-TR": "Konumu değiştir",
    },
    
    # Handoff messages
    "handoff.whatsapp": {
        "pt-BR": "Olá! Encontrei vocês pelo PETMOL. Quero informações sobre {service}. Código: {lead_id}",
        "en": "Hi! I found you on PETMOL. I'd like info about {service}. Code: {lead_id}",
        "es": "¡Hola! Los encontré en PETMOL. Quiero información sobre {service}. Código: {lead_id}",
        "fr": "Bonjour! Je vous ai trouvé sur PETMOL. Je voudrais des infos sur {service}. Code: {lead_id}",
        "it": "Ciao! Vi ho trovati su PETMOL. Vorrei info su {service}. Codice: {lead_id}",
        "de-DE": "Hallo! Ich habe Sie bei PETMOL gefunden. Ich möchte Infos über {service}. Code: {lead_id}",
        "ja-JP": "こんにちは！PETMOLで見つけました。{service}について情報が欲しいです。コード: {lead_id}",
        "zh-CN": "你好！我在PETMOL上找到你们。我想了解{service}的信息。代码: {lead_id}",
        "ru-RU": "Привет! Нашёл вас на PETMOL. Хочу узнать о {service}. Код: {lead_id}",
        "tr-TR": "Merhaba! Sizi PETMOL'da buldum. {service} hakkında bilgi almak istiyorum. Kod: {lead_id}",
    },
    
    # Prices
    "prices.not_available": {
        "pt-BR": "Comparação de preços ainda não disponível no seu país",
        "en": "Price comparison not yet available in your country",
        "es": "Comparación de precios aún no disponible en tu país",
    },
    "prices.updated_ago": {
        "pt-BR": "Atualizado há {minutes} min",
        "en": "Updated {minutes} min ago",
        "es": "Actualizado hace {minutes} min",
    },
    "prices.refresh": {
        "pt-BR": "Atualizar agora",
        "en": "Refresh now",
        "es": "Actualizar ahora",
    },
    
    # Common
    "common.open_now": {
        "pt-BR": "Aberto agora",
        "en": "Open now",
        "es": "Abierto ahora",
    },
    "common.closed": {
        "pt-BR": "Fechado",
        "en": "Closed",
        "es": "Cerrado",
    },
    "common.go": {
        "pt-BR": "Ir",
        "en": "Go",
        "es": "Ir",
    },
    "common.call": {
        "pt-BR": "Ligar",
        "en": "Call",
        "es": "Llamar",
    },
    "common.message": {
        "pt-BR": "Mensagem",
        "en": "Message",
        "es": "Mensaje",
    },
    "common.reviews": {
        "pt-BR": "avaliações",
        "en": "reviews",
        "es": "reseñas",
    },
    
    # Handoff messages
    "handoff.whatsapp": {
        "pt-BR": "Olá! Vim pelo PETMOL ({lead_id}). Gostaria de saber sobre {service}.",
        "en": "Hello! I came from PETMOL ({lead_id}). I'd like to know about {service}.",
        "es": "¡Hola! Vengo de PETMOL ({lead_id}). Me gustaría saber sobre {service}.",
        "fr": "Bonjour! Je viens de PETMOL ({lead_id}). Je voudrais savoir sur {service}.",
        "it": "Ciao! Vengo da PETMOL ({lead_id}). Vorrei sapere di {service}.",
    },
    
    # Attribution
    "attribution.google": {
        "pt-BR": "Dados de locais por Google",
        "en": "Location data by Google",
        "es": "Datos de ubicación por Google",
    },
}


def t(key: str, locale: str = "en", **kwargs) -> str:
    """
    Get translation for a key.
    
    Args:
        key: Translation key (e.g., "search.placeholder")
        locale: Locale code (e.g., "pt-BR", "en", "es")
        **kwargs: Format arguments
    
    Returns:
        Translated string, or key if not found.
    """
    translations = TRANSLATIONS.get(key, {})
    
    # Try exact locale
    text = translations.get(locale)
    
    # Try language only (e.g., "pt" from "pt-BR")
    if not text and "-" in locale:
        lang = locale.split("-")[0]
        for loc, val in translations.items():
            if loc.startswith(lang):
                text = val
                break
    
    # Fall back to English
    if not text:
        text = translations.get("en", key)
    
    # Format with kwargs
    if kwargs:
        try:
            text = text.format(**kwargs)
        except KeyError:
            pass
    
    return text


def parse_accept_language(header: str) -> Optional[str]:
    """
    Parse Accept-Language header and return best match.
    
    Example: "pt-BR,pt;q=0.9,en;q=0.8" -> "pt-BR"
    """
    if not header:
        return None
    
    locales = []
    for part in header.split(","):
        part = part.strip()
        if ";q=" in part:
            locale, q = part.split(";q=")
            try:
                locales.append((locale.strip(), float(q)))
            except ValueError:
                locales.append((locale.strip(), 0.5))
        else:
            locales.append((part, 1.0))
    
    # Sort by quality
    locales.sort(key=lambda x: x[1], reverse=True)
    
    # Find first supported
    for locale, _ in locales:
        locale_upper = locale.upper()
        if locale in [l.value for l in Locale]:
            return locale
        # Try partial match
        for supported in Locale:
            if supported.value.upper().startswith(locale_upper.split("-")[0]):
                return supported.value
    
    return None
