"""
PETMOL Vaccine Catalog
======================
Minimal multi-country vaccine catalog for Brazil (BR), United States (US),
and European Union (EU).

Structure
---------
- VACCINE_CATALOG: dict[vaccine_code] → VaccineEntry
  Each entry contains:
    - species:        which animals it applies to
    - category:       "core" | "non_core" | "lifestyle"
    - interval_days:  default booster interval (used when caller has no next_due_on)
    - display_name:   dict[country_code] → human-readable name
    - aliases:        dict[country_code] → list[lowercase strings for fuzzy matching]

- COUNTRY_CONFIG: dict[country_code] → country metadata

- lookup_vaccine_code(display_name, country_code, species) → vaccine_code | None
  (pure function, no DB dependency)

Design principles
-----------------
- All aliases are stored lowercase; callers normalise before comparison.
- interval_days = None means "follow manufacturer – do not auto-calculate".
- Adding a new country only requires extending existing entries + COUNTRY_CONFIG.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class VaccineEntry:
    species: List[str]           # ["dog"], ["cat"], ["dog","cat"]
    category: str                # core | non_core | lifestyle
    interval_days: Optional[int] # None = do not auto-calculate
    display_name: Dict[str, str] # country_code → display label
    aliases: Dict[str, List[str]]# country_code → list of lowercase alias strings


# ---------------------------------------------------------------------------
# Core catalog
# ---------------------------------------------------------------------------

VACCINE_CATALOG: Dict[str, VaccineEntry] = {

    # -----------------------------------------------------------------------
    # Dogs – core
    # -----------------------------------------------------------------------
    "DOG_POLYVALENT_V8": VaccineEntry(
        species=["dog"],
        category="core",
        interval_days=365,
        display_name={
            "BR": "Polivalente V8/V10",
            "US": "DA2PP (Distemper, Adenovirus, Parvovirus, Parainfluenza)",
            "EU": "DHPPi (Distemper, Hepatite, Parvovírus, Parainfluenza)",
        },
        aliases={
            "BR": [
                "v8", "v10", "polivalente", "dhppi", "hexavalente",
                "8 em 1", "10 em 1", "multipla", "múltipla",
                "distemper", "cinomose", "parvo", "parvovirus", "parvovírus",
                "adenovirus", "adenovírus", "hepatite canina",
                "parainfluenza",
                "nobivac dhppi", "vanguard", "defensor", "duramune",
                "recombitek", "eurican", "biocan", "primodog",
            ],
            "US": [
                "da2pp", "dhpp", "dhppc", "distemper", "parvovirus", "parvo",
                "adenovirus", "parainfluenza", "hepatitis", "5-way", "4-way",
                "core vaccine", "vanguard plus", "recombitek", "duramune",
            ],
            "EU": [
                "dhppi", "dhlppi", "distemper", "hepatitis", "parvovirus",
                "parainfluenza", "hexadog", "nobivac dhppi", "eurican",
                "biocan", "pneumodog",
            ],
        },
    ),

    "DOG_RABIES": VaccineEntry(
        species=["dog"],
        category="core",
        interval_days=365,   # first booster at 1 yr; subsequent may be 3 yr – kept at 365 for safety
        display_name={
            "BR": "Antirrábica Canina",
            "US": "Rabies (Dog)",
            "EU": "Raiva Canina",
        },
        aliases={
            "BR": [
                "raiva", "antirrábica", "antirabica", "rábica", "raivosa",
                "nobivac rabies", "defensor", "imrab", "rabisin", "nobivac",
            ],
            "US": [
                "rabies", "rabies 1-year", "rabies 3-year",
                "imrab", "defensor", "nobivac rabies", "purevax",
            ],
            "EU": [
                "raiva", "rabies", "rabisin", "nobivac rabies",
                "versican", "rabdomun",
            ],
        },
    ),

    "DOG_LEPTO": VaccineEntry(
        species=["dog"],
        category="non_core",
        interval_days=365,
        display_name={
            "BR": "Leptospirose Canina",
            "US": "Leptospirosis (Dog)",
            "EU": "Leptospirose Canina",
        },
        aliases={
            "BR": [
                "leptospirose", "lepto", "leptospira",
                "l4", "l2", "nobivac l4", "biocan l",
            ],
            "US": [
                "leptospirosis", "lepto", "leptospira",
                "l2", "l4", "vanguard l", "recombitek lepto",
            ],
            "EU": [
                "leptospirose", "lepto", "leptospira",
                "l4", "nobivac lepto", "biocan l",
            ],
        },
    ),

    "DOG_BORDETELLA": VaccineEntry(
        species=["dog"],
        category="non_core",
        interval_days=365,
        display_name={
            "BR": "Tosse dos Canis (Bordetella)",
            "US": "Bordetella / Kennel Cough",
            "EU": "Bordetella / Tosse do Canil",
        },
        aliases={
            "BR": [
                "bordetella", "tosse dos canis", "tosse do canil",
                "bronquiseptica", "bronchiseptica",
            ],
            "US": [
                "bordetella", "kennel cough", "bronchiseptica",
                "bravecto intranasal", "nobivac bb",
            ],
            "EU": [
                "bordetella", "kennel cough", "tosse do canil",
                "bronquiseptica",
            ],
        },
    ),

    "DOG_INFLUENZA": VaccineEntry(
        species=["dog"],
        category="lifestyle",
        interval_days=365,
        display_name={
            "BR": "Gripe Canina (Influenza)",
            "US": "Canine Influenza",
            "EU": "Gripe Canina",
        },
        aliases={
            "BR": ["gripe canina", "influenza canina", "h3n8", "h3n2"],
            "US": ["canine influenza", "dog flu", "h3n8", "h3n2", "vanguard ci"],
            "EU": ["influenza canina", "gripe canina", "h3n8"],
        },
    ),

    # -----------------------------------------------------------------------
    # Cats – core
    # -----------------------------------------------------------------------
    "CAT_POLYVALENT": VaccineEntry(
        species=["cat"],
        category="core",
        interval_days=365,
        display_name={
            "BR": "Tríplice/Quádrupla Felina (FHV, FCV, FPV)",
            "US": "FVRCP (Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia)",
            "EU": "Tríplice Felina (FHV, FCV, FPV)",
        },
        aliases={
            "BR": [
                "triplice felina", "tríplice felina", "quadrupla felina",
                "quádrupla felina", "pentavalente felina",
                "fhv", "fcv", "fpv", "herpesvirus", "calicivirus", "panleucopenia",
                "parvovirus felino", "rinotraqueíte", "rinotraqueite",
                "purevax rcpch", "felocell", "nobivac tricat trio",
            ],
            "US": [
                "fvrcp", "feline core", "rhinotracheitis", "calicivirus",
                "panleukopenia", "herpesvirus", "fhv", "fcv", "fpv",
                "purevax", "felocell", "nobivac",
            ],
            "EU": [
                "triplice felina", "fhv", "fcv", "fpv",
                "herpesvirus", "calicivirus", "panleucopenia",
                "felocell", "nobivac tricat",
            ],
        },
    ),

    "CAT_RABIES": VaccineEntry(
        species=["cat"],
        category="core",
        interval_days=365,
        display_name={
            "BR": "Antirrábica Felina",
            "US": "Rabies (Cat)",
            "EU": "Raiva Felina",
        },
        aliases={
            "BR": [
                "raiva felina", "antirrábica felina", "antirabica felina",
                "rábica felina", "imrab", "purevax rabies",
            ],
            "US": [
                "rabies cat", "rabies (cat)", "feline rabies", "purevax rabies",
                "imrab", "rabvac",
            ],
            "EU": [
                "raiva felina", "rabies cat", "purevax rabies",
                "rabisin felina",
            ],
        },
    ),

    "CAT_FELV": VaccineEntry(
        species=["cat"],
        category="non_core",
        interval_days=365,
        display_name={
            "BR": "Leucemia Felina (FeLV)",
            "US": "Feline Leukemia (FeLV)",
            "EU": "Leucemia Felina (FeLV)",
        },
        aliases={
            "BR": [
                "leucemia felina", "felv", "leukemia",
                "purevax felv", "leucofeligen", "evofelis",
            ],
            "US": [
                "felv", "feline leukemia", "leukemia",
                "purevax felv", "leucofeligen",
            ],
            "EU": [
                "leucemia felina", "felv", "feline leukemia",
                "purevax felv", "evofelis",
            ],
        },
    ),

    "CAT_FIV": VaccineEntry(
        species=["cat"],
        category="non_core",
        interval_days=365,
        display_name={
            "BR": "Imunodeficiência Felina (FIV / AIDS Felina)",
            "US": "Feline Immunodeficiency Virus (FIV)",
            "EU": "Imunodeficiência Felina (FIV)",
        },
        aliases={
            "BR": [
                "fiv", "aids felina", "imunodeficiencia felina",
                "imunodeficiência felina",
            ],
            "US": [
                "fiv", "feline immunodeficiency", "feline aids",
                "fel-o-vax fiv",
            ],
            "EU": [
                "fiv", "imunodeficiência felina",
            ],
        },
    ),
}


# ---------------------------------------------------------------------------
# Country configuration
# ---------------------------------------------------------------------------

COUNTRY_CONFIG: Dict[str, Dict] = {
    "BR": {
        "label": "Brasil",
        "name_pt": "Brasil",
        "locale": "pt-BR",
        "supported": True,
        "coverage_level": "GLOBAL",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "US": {
        "label": "United States",
        "name_pt": "Estados Unidos",
        "locale": "en-US",
        "supported": True,
        "coverage_level": "GLOBAL",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "EU": {
        "label": "European Union",
        "name_pt": "União Europeia",
        "locale": "en-EU",
        "supported": True,
        "coverage_level": "BETA",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "CA": {
        "label": "Canada",
        "name_pt": "Canadá",
        "locale": "en-CA",
        "supported": True,
        "coverage_level": "BETA",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "PT": {
        "label": "Portugal",
        "name_pt": "Portugal",
        "locale": "pt-PT",
        "supported": True,
        "coverage_level": "BETA",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "ES": {
        "label": "España",
        "name_pt": "Espanha",
        "locale": "es-ES",
        "supported": True,
        "coverage_level": "BETA",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "FR": {
        "label": "France",
        "name_pt": "França",
        "locale": "fr-FR",
        "supported": True,
        "coverage_level": "BETA",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
    "DE": {
        "label": "Deutschland",
        "name_pt": "Alemanha",
        "locale": "de-DE",
        "supported": True,
        "coverage_level": "BETA",
        "core_species": {
            "dog": ["DOG_POLYVALENT_V8", "DOG_RABIES"],
            "cat": ["CAT_POLYVALENT", "CAT_RABIES"],
        },
    },
}


# ---------------------------------------------------------------------------
# Lookup function
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lowercase + strip accents naively (no external deps)."""
    import unicodedata
    nfd = unicodedata.normalize("NFD", text.lower().strip())
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


def lookup_vaccine_code(
    display_name: str,
    country_code: str,
    species: str,
) -> Optional[str]:
    """
    Map a free-text vaccine name to a canonical vaccine_code.

    Parameters
    ----------
    display_name : str
        Raw name from OCR / manual input (any case).
    country_code : str
        ISO 2-letter country code: "BR" | "US" | "EU".
    species : str
        "dog" | "cat".

    Returns
    -------
    vaccine_code (str) or None if no confident match found.

    Algorithm
    ---------
    1. Normalise both display_name and each alias (NFD + lowercase).
    2. Exact match first.
    3. Substring match (alias contained in display_name, or vice versa).
    4. Return first match that also matches the species filter.
    """
    if not display_name:
        return None

    normalised_input = _normalise(display_name)
    country_upper = country_code.upper()

    for code, entry in VACCINE_CATALOG.items():
        # Filter by species
        if species not in entry.species:
            continue

        # Get aliases for this country; fall back to any country if not found
        country_aliases = entry.aliases.get(country_upper, [])
        if not country_aliases:
            # Aggregate all aliases across countries as fallback
            country_aliases = [a for aliases in entry.aliases.values() for a in aliases]

        for alias in country_aliases:
            normalised_alias = _normalise(alias)
            if normalised_alias == normalised_input:
                return code  # exact match
            if normalised_alias in normalised_input or normalised_input in normalised_alias:
                return code  # substring match

    return None
