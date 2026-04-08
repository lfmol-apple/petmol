"""
PETMOL – Text Normalization Utilities
======================================
Lightweight normalization helpers that work with **no external ML dependencies**.
Uses only stdlib (unicodedata, re, math) so the service starts instantly.

Functions
---------
normalize_basic(s)   → lowercase, accent-stripped, whitespace-collapsed
normalize_units(s)   → standardize weight/volume units (kg, g, ml, l)
similarity(a, b)     → float 0-1 (Jaro-Winkler with prefix bonus)
"""

from __future__ import annotations

import math
import re
import unicodedata


# ---------------------------------------------------------------------------
# Basic normalizer
# ---------------------------------------------------------------------------

def normalize_basic(s: str) -> str:
    """Lowercase, remove accents, collapse whitespace, strip.

    Examples
    --------
    >>> normalize_basic("Clínica São Bento")
    'clinica sao bento'
    >>> normalize_basic("  NOBIVAC  DHPPI ")
    'nobivac dhppi'
    """
    if not s:
        return ""
    # NFD decompose → drop combining marks
    nfd = unicodedata.normalize("NFD", s.lower().strip())
    no_accents = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    # collapse internal whitespace
    return re.sub(r"\s+", " ", no_accents).strip()


# ---------------------------------------------------------------------------
# Unit normalizer
# ---------------------------------------------------------------------------

_UNIT_MAP: dict[str, str] = {
    # weight
    r"\bkgs?\b":        "kg",
    r"\bquilos?\b":     "kg",
    r"\bkilos?\b":      "kg",
    r"\bkilograms?\b":  "kg",
    r"\bgramas?\b":     "g",
    r"\bgrams?\b":      "g",
    r"\bgrs?\b":        "g",
    # volume
    r"\bml\b":          "ml",
    r"\bmls\b":         "ml",
    r"\bmililitros?\b": "ml",
    r"\blitros?\b":     "l",
    r"\bliters?\b":     "l",
    r"\bls?\b":         "l",   # only when isolated
}

def normalize_units(s: str) -> str:
    """Standardise weight/volume units within a string.

    Examples
    --------
    >>> normalize_units("Formula Natural 7 Kgs")
    'Formula Natural 7 kg'
    >>> normalize_units("castração 500 Gramas")
    'castração 500 g'
    """
    if not s:
        return s
    result = s
    for pattern, replacement in _UNIT_MAP.items():
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


# ---------------------------------------------------------------------------
# Jaro-Winkler similarity
# ---------------------------------------------------------------------------

def _jaro(a: str, b: str) -> float:
    """Classic Jaro similarity."""
    if a == b:
        return 1.0
    len_a, len_b = len(a), len(b)
    if len_a == 0 or len_b == 0:
        return 0.0

    match_dist = max(len_a, len_b) // 2 - 1
    match_dist = max(0, match_dist)

    a_matches = [False] * len_a
    b_matches = [False] * len_b
    matches = 0
    transpositions = 0

    for i in range(len_a):
        start = max(0, i - match_dist)
        end = min(i + match_dist + 1, len_b)
        for j in range(start, end):
            if b_matches[j] or a[i] != b[j]:
                continue
            a_matches[i] = True
            b_matches[j] = True
            matches += 1
            break

    if matches == 0:
        return 0.0

    k = 0
    for i in range(len_a):
        if not a_matches[i]:
            continue
        while not b_matches[k]:
            k += 1
        if a[i] != b[k]:
            transpositions += 1
        k += 1

    t = transpositions / 2
    return (matches / len_a + matches / len_b + (matches - t) / matches) / 3


def similarity(a: str, b: str, prefix_weight: float = 0.1) -> float:
    """Jaro-Winkler similarity between two strings (already normalized).

    Returns float in [0.0, 1.0].
    prefix_weight: bonus per matching leading char (max 4 chars, default 0.1).

    Examples
    --------
    >>> round(similarity("vet sao bento", "vet sao bento"), 2)
    1.0
    >>> round(similarity("clinica sao bento", "clinica sao binto"), 2) > 0.90
    True
    >>> round(similarity("v10", "antirrabica"), 2) < 0.6
    True
    """
    if not a or not b:
        return 0.0
    jaro = _jaro(a, b)
    # Jaro-Winkler prefix bonus
    prefix = 0
    for ca, cb in zip(a[:4], b[:4]):
        if ca == cb:
            prefix += 1
        else:
            break
    return jaro + prefix * prefix_weight * (1 - jaro)
