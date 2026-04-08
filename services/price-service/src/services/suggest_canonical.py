"""
PETMOL – Canonical Suggestion Service
========================================
Dado um texto livre, sugere a forma canônica com grau de confiança.

Algoritmo
---------
1. Alias exato (após normalização)   → confidence 0.95, method='dictionary'
2. Jaro-Winkler >= threshold          → confidence = similarity, method='fuzzy'
3. confidence < 0.70                  → não auto-aplica (retorna apenas sugestão)

Domínios suportados
-------------------
- 'vaccine' (species='dog'|'cat')
- 'food'
- 'provider'

Não depende de rede, DB nem ML externo.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from ..utils.normalize_text import normalize_basic, normalize_units, similarity

# ---------------------------------------------------------------------------
# Tipos de retorno
# ---------------------------------------------------------------------------

@dataclass
class Candidate:
    canonical: str
    code: Optional[str]
    confidence: float
    method: str          # 'dictionary' | 'fuzzy'
    matched_alias: str


@dataclass
class SuggestionResult:
    raw: str
    canonical: Optional[str]        # melhor candidato canônico (None se confiança < 0.70)
    code: Optional[str]             # código interno (p/ vacinas)
    confidence: float               # 0.0 – 1.0
    method: str                     # 'dictionary' | 'fuzzy' | 'none'
    auto_apply: bool                # True se confidence >= 0.95
    candidates: List[Candidate]     # top-5


# ---------------------------------------------------------------------------
# Carregamento dos catálogos
# ---------------------------------------------------------------------------

_CATALOGS_DIR = Path(__file__).parent.parent / "catalogs"

def _load_json_catalog(filename: str) -> list:
    path = _CATALOGS_DIR / filename
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f).get("items", [])


def _build_index(items: list) -> list[tuple[str, str, Optional[str], list[str]]]:
    """
    Returns list of (canonical, norm_canonical, code, [norm_alias, ...])
    """
    idx = []
    for item in items:
        canonical = item.get("canonical", "")
        code = item.get("code")  # may be None for food/provider
        raw_aliases = item.get("aliases", [])
        norm_canonical = normalize_basic(canonical)
        norm_aliases = [normalize_basic(a) for a in raw_aliases]
        # canonical itself is also a valid alias
        if norm_canonical not in norm_aliases:
            norm_aliases.insert(0, norm_canonical)
        idx.append((canonical, norm_canonical, code, norm_aliases))
    return idx


# Lazy-loaded indexes
_INDEXES: dict[str, list] = {}


def _get_index(domain: str, species: Optional[str] = None) -> list:
    key = f"{domain}:{species or ''}"
    if key not in _INDEXES:
        if domain == "vaccine":
            sp = (species or "dog").lower()
            items = _load_json_catalog(f"vaccines_{sp}.json")
        elif domain == "food":
            items = _load_json_catalog("food_brands.json")
        elif domain == "provider":
            items = _load_json_catalog("provider_aliases.json")
        else:
            items = []
        _INDEXES[key] = _build_index(items)
    return _INDEXES[key]


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------

FUZZY_THRESHOLD = 0.70
AUTO_APPLY_THRESHOLD = 0.95
TOP_K = 5


def suggest(
    raw_text: str,
    domain: str,
    species: Optional[str] = None,
    country: Optional[str] = None,   # reserved for future country-specific filtering
) -> SuggestionResult:
    """Sugere a forma canônica para `raw_text`.

    Parameters
    ----------
    raw_text : str
        Texto digitado pelo usuário.
    domain : str
        'vaccine' | 'food' | 'provider'
    species : str | None
        'dog' | 'cat' — obrigatório quando domain='vaccine'
    country : str | None
        Código de país (not yet used in filtering, reserved).

    Returns
    -------
    SuggestionResult
    """
    normalized = normalize_basic(normalize_units(raw_text))
    if not normalized:
        return SuggestionResult(
            raw=raw_text, canonical=None, code=None,
            confidence=0.0, method="none", auto_apply=False, candidates=[]
        )

    index = _get_index(domain, species)
    scored: list[tuple[float, Candidate]] = []

    for (canonical, norm_canonical, code, norm_aliases) in index:
        best_score = 0.0
        best_alias = ""
        best_method = "fuzzy"

        for alias in norm_aliases:
            # 1. Exact match
            if alias == normalized:
                best_score = 0.95
                best_alias = alias
                best_method = "dictionary"
                break
            # 2. Substring match (either direction)
            if alias in normalized or normalized in alias:
                sc = 0.90 if alias == norm_canonical else 0.88
                if sc > best_score:
                    best_score = sc
                    best_alias = alias
                    best_method = "dictionary"
            # 3. Jaro-Winkler fuzzy
            sc = similarity(normalized, alias)
            if sc > best_score:
                best_score = sc
                best_alias = alias
                best_method = "fuzzy"

        if best_score >= FUZZY_THRESHOLD:
            scored.append((best_score, Candidate(
                canonical=canonical,
                code=code,
                confidence=round(best_score, 3),
                method=best_method,
                matched_alias=best_alias,
            )))

    # Sort by confidence desc, take top-K
    scored.sort(key=lambda x: x[0], reverse=True)
    candidates = [c for _, c in scored[:TOP_K]]

    if not candidates:
        return SuggestionResult(
            raw=raw_text, canonical=None, code=None,
            confidence=0.0, method="none", auto_apply=False, candidates=[]
        )

    best = candidates[0]
    auto_apply = best.confidence >= AUTO_APPLY_THRESHOLD

    return SuggestionResult(
        raw=raw_text,
        canonical=best.canonical,
        code=best.code,
        confidence=best.confidence,
        method=best.method,
        auto_apply=auto_apply,
        candidates=candidates,
    )


def clear_cache() -> None:
    """Force reload of catalogs (useful in tests or after catalog update)."""
    _INDEXES.clear()
