"""
Keyword Packs for Google Places search - MUNDIAL support.

Provides localized and international keywords for each service category.
Enables finding pet services globally with multi-language support.
"""
from typing import List, Dict
from .services_old import ServiceCategory


# Keyword packs by category and locale
# Structure: {category: {locale: [keywords...]}}
KEYWORD_PACKS: Dict[ServiceCategory, Dict[str, List[str]]] = {
    ServiceCategory.PETSHOP: {
        'pt-BR': ['pet shop', 'petshop', 'loja de animais', 'casa de ração'],
        'pt': ['pet shop', 'petshop', 'loja de animais'],
        'en': ['pet store', 'pet shop', 'pet supply', 'animal store'],
        'es': ['tienda de mascotas', 'tienda de animales', 'veterinaria tienda'],
        'fr': ['animalerie', 'magasin pour animaux', 'boutique animaux'],
        'it': ['negozio di animali', 'pet shop', 'negozio per animali'],
    },
    
    ServiceCategory.VET_CLINIC: {
        'pt-BR': ['veterinário', 'clínica veterinária', 'veterinaria', 'hospital veterinário'],
        'pt': ['veterinário', 'clínica veterinária', 'veterinaria'],
        'en': ['veterinary', 'vet clinic', 'animal hospital', 'veterinarian'],
        'es': ['veterinario', 'clínica veterinaria', 'hospital veterinario'],
        'fr': ['vétérinaire', 'clinique vétérinaire', 'hôpital vétérinaire'],
        'it': ['veterinario', 'clinica veterinaria', 'ospedale veterinario'],
    },
    
    ServiceCategory.VET_EMERGENCY: {
        'pt-BR': ['veterinário 24 horas', 'emergência veterinária', 'pronto socorro veterinário', 'veterinário urgência'],
        'pt': ['veterinário 24 horas', 'emergência veterinária', 'urgência veterinária'],
        'en': ['24 hour vet', 'emergency vet', 'veterinary emergency', 'animal emergency'],
        'es': ['veterinario 24 horas', 'emergencia veterinaria', 'urgencias veterinarias'],
        'fr': ['vétérinaire 24h', 'urgence vétérinaire', 'clinique urgence animaux'],
        'it': ['veterinario 24 ore', 'emergenza veterinaria', 'pronto soccorso veterinario'],
    },
    
    ServiceCategory.GROOMING: {
        'pt-BR': ['banho e tosa', 'pet grooming', 'tosa', 'banho pet', 'estética animal'],
        'pt': ['banho e tosa', 'pet grooming', 'tosa'],
        'en': ['pet grooming', 'dog grooming', 'pet salon', 'dog wash', 'cat grooming'],
        'es': ['peluquería canina', 'peluquería para perros', 'estética canina', 'baño perros'],
        'fr': ['toilettage', 'toilettage chien', 'toilettage chat', 'salon toilettage'],
        'it': ['toelettatura', 'toelettatura cani', 'toelettatura gatti', 'salone toelettatura'],
    },
    
    ServiceCategory.HOTEL: {
        'pt-BR': ['hotel para cachorro', 'hotelzinho', 'creche canina', 'day care pet', 'hospedagem cachorro', 'pensão para cães'],
        'pt': ['hotel para cães', 'creche canina', 'hospedagem cachorro'],
        'en': ['pet hotel', 'dog boarding', 'pet boarding', 'dog daycare', 'pet daycare', 'kennel', 'dog kennel', 'pet care boarding'],
        'es': ['hotel para perros', 'guardería canina', 'pensión canina', 'guardería de perros', 'residencia canina'],
        'fr': ['hôtel pour chiens', 'garderie canine', 'pension canine', 'garderie pour chiens', 'chenil'],
        'it': ['hotel per cani', 'pensione per cani', 'asilo per cani', 'dog hotel', 'canile'],
    },
    
    ServiceCategory.TRAINER: {
        'pt-BR': ['adestrador', 'adestramento de cães', 'treinador de cães', 'comportamento canino'],
        'pt': ['adestrador', 'treinador de cães', 'comportamento canino'],
        'en': ['dog trainer', 'dog training', 'pet trainer', 'obedience training', 'dog behavior'],
        'es': ['adiestrador', 'entrenador de perros', 'adiestramiento canino', 'educador canino'],
        'fr': ['éducateur canin', 'dresseur de chiens', 'éducation canine', 'comportementaliste'],
        'it': ['addestratore', 'addestramento cani', 'educatore cinofilo', 'comportamento canino'],
    },
}


# English fallback keywords (always included when locale != en)
FALLBACK_KEYWORDS_EN: Dict[ServiceCategory, List[str]] = {
    ServiceCategory.PETSHOP: ['pet store', 'pet shop'],
    ServiceCategory.VET_CLINIC: ['veterinary', 'vet clinic'],
    ServiceCategory.VET_EMERGENCY: ['emergency vet', '24 hour vet'],
    ServiceCategory.GROOMING: ['pet grooming', 'dog grooming'],
    ServiceCategory.HOTEL: ['pet hotel', 'dog boarding', 'dog daycare', 'kennel'],
    ServiceCategory.TRAINER: ['dog trainer', 'dog training'],
}


def get_keywords(category: ServiceCategory, locale: str = 'en') -> List[str]:
    """
    Get keywords for a category and locale with smart fallback.
    
    Fallback chain:
    1. exact locale (e.g., 'pt-BR')
    2. language only (e.g., 'pt' from 'pt-BR')
    3. English fallback (always included unless locale is 'en')
    
    Args:
        category: Service category
        locale: BCP-47 locale (e.g., 'pt-BR', 'en-US', 'es')
    
    Returns:
        List of keywords in priority order (local first, then fallback)
    """
    if category not in KEYWORD_PACKS:
        # Unknown category - return empty
        return []
    
    packs = KEYWORD_PACKS[category]
    keywords = []
    
    # Try exact locale match
    if locale in packs:
        keywords.extend(packs[locale])
    else:
        # Try language part only (e.g., 'pt' from 'pt-BR')
        lang = locale.split('-')[0].lower()
        if lang in packs:
            keywords.extend(packs[lang])
    
    # Add English fallback if not already English
    if not locale.startswith('en') and category in FALLBACK_KEYWORDS_EN:
        keywords.extend(FALLBACK_KEYWORDS_EN[category])
    
    # If still empty, use English
    if not keywords and 'en' in packs:
        keywords.extend(packs['en'])
    
    # Remove duplicates while preserving order
    seen = set()
    unique_keywords = []
    for kw in keywords:
        kw_lower = kw.lower()
        if kw_lower not in seen:
            seen.add(kw_lower)
            unique_keywords.append(kw)
    
    return unique_keywords


def get_primary_keyword(category: ServiceCategory, locale: str = 'en') -> str:
    """Get the primary (first) keyword for a category and locale."""
    keywords = get_keywords(category, locale)
    return keywords[0] if keywords else ''


def get_all_keywords(category: ServiceCategory) -> List[str]:
    """Get all keywords for a category across all locales (for broad matching)."""
    if category not in KEYWORD_PACKS:
        return []
    
    all_kw = []
    for locale_keywords in KEYWORD_PACKS[category].values():
        all_kw.extend(locale_keywords)
    
    # Remove duplicates
    return list(set(all_kw))
