"""
PET GUARD - Pet-only query validation and rewriting

Ensures PETMOL only processes pet-related searches.
Blocks non-pet terms and suggests pet alternatives.
"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional
from enum import Enum

# Load terms from shared JSON
TERMS_FILE = Path(__file__).parent.parent.parent.parent / "shared" / "pet_guard_terms.json"

class PetGuardAction(str, Enum):
    """Action to take for a query."""
    ALLOW = "allow"      # Query is clearly pet-related
    REWRITE = "rewrite"  # Query needs pet context added
    BLOCK = "block"      # Query is not pet-related


class PetGuardResult:
    """Result of pet guard validation."""
    def __init__(
        self,
        action: PetGuardAction,
        q_final: str,
        reason: Optional[str] = None,
        suggestions: Optional[List[str]] = None,
        confidence: float = 0.0
    ):
        self.action = action
        self.q_final = q_final
        self.reason = reason
        self.suggestions = suggestions or []
        self.confidence = confidence
    
    def to_dict(self) -> dict:
        return {
            "action": self.action.value,
            "q_final": self.q_final,
            "reason": self.reason,
            "suggestions": self.suggestions,
            "confidence": self.confidence
        }


class PetGuard:
    """Pet-only query validator and rewriter."""
    
    def __init__(self):
        self.terms = self._load_terms()
        self.whitelist = self.terms.get("whitelist", {})
        self.blacklist = self.terms.get("blacklist", [])
        self.synonyms = self.terms.get("synonyms", {})
        self.species_hints = self.terms.get("species_hints", {})
    
    def _load_terms(self) -> dict:
        """Load pet terms from shared JSON."""
        try:
            with open(TERMS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[PetGuard] Failed to load terms: {e}")
            return {"whitelist": {}, "blacklist": [], "synonyms": {}, "species_hints": {}}
    
    def _normalize(self, text: str) -> str:
        """Normalize text for comparison."""
        # Remove accents manually (simple approach)
        text = text.lower().strip()
        # Remove extra spaces
        text = re.sub(r'\s+', ' ', text)
        return text
    
    def _check_blacklist(self, query: str) -> bool:
        """Check if query contains blacklisted terms."""
        q_norm = self._normalize(query)
        for term in self.blacklist:
            term_norm = self._normalize(term)
            # Exact word match or as part of phrase
            if term_norm in q_norm.split() or term_norm in q_norm:
                return True
        return False
    
    def _check_whitelist(self, query: str, locale: str) -> int:
        """Count whitelist matches. Returns match count."""
        q_norm = self._normalize(query)
        
        # Get locale or fallback
        lang = locale.split('-')[0] if '-' in locale else locale
        terms = self.whitelist.get(locale, self.whitelist.get(lang, self.whitelist.get('en', [])))
        
        matches = 0
        for term in terms:
            term_norm = self._normalize(term)
            if term_norm in q_norm.split() or term_norm in q_norm:
                matches += 1
        
        return matches
    
    def _get_suggestions(self, locale: str, count: int = 6) -> List[str]:
        """Get pet suggestions for locale."""
        lang = locale.split('-')[0] if '-' in locale else locale
        terms = self.whitelist.get(locale, self.whitelist.get(lang, self.whitelist.get('en', [])))
        
        # Return diverse suggestions
        suggestions = []
        if len(terms) > 0:
            # Pick diverse items
            step = max(1, len(terms) // count)
            suggestions = [terms[i] for i in range(0, min(len(terms), count * step), step)][:count]
        
        # Fallback
        if not suggestions:
            suggestions = ["dog food", "cat litter", "pet toy", "dog collar", "cat treats", "pet bed"]
        
        return suggestions
    
    def _apply_synonym(self, query: str, locale: str) -> str:
        """Apply synonym rewrite if applicable."""
        q_norm = self._normalize(query)
        
        lang = locale.split('-')[0] if '-' in locale else locale
        syn_dict = self.synonyms.get(locale, self.synonyms.get(lang, {}))
        
        for key, value in syn_dict.items():
            key_norm = self._normalize(key)
            if q_norm == key_norm or q_norm.startswith(key_norm + ' ') or q_norm.endswith(' ' + key_norm):
                return value
        
        return query
    
    def validate(self, query: str, locale: str = 'pt-BR') -> PetGuardResult:
        """
        Validate query and determine action.
        
        Returns:
            PetGuardResult with action, q_final, reason, suggestions
        """
        if not query or len(query.strip()) < 2:
            return PetGuardResult(
                action=PetGuardAction.BLOCK,
                q_final=query,
                reason="query_too_short",
                suggestions=self._get_suggestions(locale),
                confidence=0.0
            )
        
        # 1. Check blacklist first (high confidence block)
        if self._check_blacklist(query):
            return PetGuardResult(
                action=PetGuardAction.BLOCK,
                q_final=query,
                reason="blacklisted_term",
                suggestions=self._get_suggestions(locale),
                confidence=0.95
            )
        
        # 2. Check whitelist matches
        matches = self._check_whitelist(query, locale)
        
        if matches >= 2:
            # Strong pet signal - allow as-is
            return PetGuardResult(
                action=PetGuardAction.ALLOW,
                q_final=query,
                reason="strong_pet_signal",
                confidence=0.9
            )
        
        if matches == 1:
            # Medium pet signal - allow but maybe enhance
            q_enhanced = self._apply_synonym(query, locale)
            if q_enhanced != query:
                return PetGuardResult(
                    action=PetGuardAction.REWRITE,
                    q_final=q_enhanced,
                    reason="synonym_applied",
                    confidence=0.8
                )
            else:
                return PetGuardResult(
                    action=PetGuardAction.ALLOW,
                    q_final=query,
                    reason="medium_pet_signal",
                    confidence=0.7
                )
        
        # 3. No matches - try synonym first
        q_enhanced = self._apply_synonym(query, locale)
        if q_enhanced != query:
            # Synonym rewrote it to something pet-related
            return PetGuardResult(
                action=PetGuardAction.REWRITE,
                q_final=q_enhanced,
                reason="synonym_applied",
                confidence=0.6
            )
        
        # 4. No pet signal - add context
        lang = locale.split('-')[0] if '-' in locale else locale
        context_words = {
            'pt': 'para cachorro gato',
            'en': 'for dogs cats',
            'es': 'para perro gato',
            'fr': 'pour chien chat',
            'it': 'per cane gatto'
        }
        context = context_words.get(lang, 'for dogs cats')
        
        q_with_context = f"{query} {context}"
        
        return PetGuardResult(
            action=PetGuardAction.REWRITE,
            q_final=q_with_context,
            reason="context_added",
            suggestions=self._get_suggestions(locale),
            confidence=0.4
        )


# Global instance
_pet_guard = None

def get_pet_guard() -> PetGuard:
    """Get singleton pet guard instance."""
    global _pet_guard
    if _pet_guard is None:
        _pet_guard = PetGuard()
    return _pet_guard


def pet_guard(query: str, locale: str = 'pt-BR') -> dict:
    """
    Validate query for pet-only content.
    
    Returns:
        {
            "action": "allow"|"rewrite"|"block",
            "q_final": str,
            "reason": str,
            "suggestions": [str],
            "confidence": float
        }
    """
    guard = get_pet_guard()
    result = guard.validate(query, locale)
    return result.to_dict()
