/**
 * Pet Intent Guard - Validates queries are pet-related
 * Blocks non-pet searches before hitting backend
 */

import { BLOCKED_TERMS, PET_SIGNALS, ProductCategory, PetSpecies } from './petTaxonomy';

export interface PetIntent {
  isPet: boolean;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason?: string;
  blockedTerm?: string;
}

/**
 * Check if query has pet intent - STRICT MODE
 * Requires species to be selected ALWAYS
 */
export function checkPetIntent(
  query: string,
  locale: string = 'pt-BR',
  category?: ProductCategory,
  species?: PetSpecies
): PetIntent {
  const q = query.toLowerCase().trim();
  
  // STRICT: Must have species selected
  if (!species) {
    return { 
      isPet: false, 
      confidence: 'none', 
      reason: 'no_species'
    };
  }
  
  // If species selected, it's pet-related
  return { 
    isPet: true, 
    confidence: 'high', 
    reason: 'species_selected' 
  };
}

/**
 * Build final Google Shopping query with pet context
 */
export function buildShoppingQuery(params: {
  query: string;
  species?: PetSpecies;
  locale: string;
}): { finalQuery: string; reasonBlocked?: string } {
  const { query, species, locale } = params;
  
  // Check pet intent first
  const intent = checkPetIntent(query, locale, undefined, species);
  
  if (!intent.isPet) {
    return {
      finalQuery: '',
      reasonBlocked: intent.reason || 'non_pet_query',
    };
  }

  // Build contextual query: SPECIES + USER_QUERY (simple and professional)
  let parts: string[] = [];

  // Add species context FIRST (localized)
  if (species && species !== 'other') {
    const speciesTerms: Record<PetSpecies, Record<string, string>> = {
      dog: { 'pt-BR': 'cachorro', en: 'dog', es: 'perro', fr: 'chien', it: 'cane' },
      cat: { 'pt-BR': 'gato', en: 'cat', es: 'gato', fr: 'chat', it: 'gatto' },
      bird: { 'pt-BR': 'pássaro', en: 'bird', es: 'pájaro', fr: 'oiseau', it: 'uccello' },
      fish: { 'pt-BR': 'peixe', en: 'fish', es: 'pez', fr: 'poisson', it: 'pesce' },
      rabbit: { 'pt-BR': 'coelho', en: 'rabbit', es: 'conejo', fr: 'lapin', it: 'coniglio' },
      hamster: { 'pt-BR': 'hamster', en: 'hamster', es: 'hámster', fr: 'hamster', it: 'criceto' },
      other: { 'pt-BR': '', en: '', es: '', fr: '', it: '' },
    };
    
    const speciesTerm = speciesTerms[species]?.[locale] || speciesTerms[species]?.['en'] || species;
    if (speciesTerm) {
      parts.push(speciesTerm);
    }
  }

  // Add user query LAST (most natural order)
  parts.push(query.trim());

  return {
    finalQuery: parts.join(' '),
  };
}
