/**
 * ML-lite Autocomplete - Local learning from user behavior
 * Persists in localStorage, NO server calls, NO PII
 */

import { sanitizeQuery } from './events';
import { seedDictionary } from './queryBuilder';

const STORAGE_VERSION = 'v1';
const STORAGE_KEYS = {
  QUERIES: `petmol_ac_queries_${STORAGE_VERSION}`,
  TOKENS: `petmol_ac_tokens_${STORAGE_VERSION}`,
  BIGRAMS: `petmol_ac_bigrams_${STORAGE_VERSION}`,
};

interface QueryRecord {
  count: number;
  lastUsedAt: number;
}

interface StorageData {
  queries: Record<string, QueryRecord>;
  tokens: Record<string, number>;
  bigrams: Record<string, number>;
}

// Ranking weights (ML-lite scoring)
const WEIGHTS = {
  PREFIX_MATCH: 10,
  FREQUENCY: 2,
  RECENCY: 5,
  FROM_REORDER: 8,
  LOCALE_BOOST: 3,
};

// Load from localStorage
function loadStorage(): StorageData {
  if (typeof window === 'undefined') {
    return { queries: {}, tokens: {}, bigrams: {} };
  }

  try {
    const queries = JSON.parse(localStorage.getItem(STORAGE_KEYS.QUERIES) || '{}');
    const tokens = JSON.parse(localStorage.getItem(STORAGE_KEYS.TOKENS) || '{}');
    const bigrams = JSON.parse(localStorage.getItem(STORAGE_KEYS.BIGRAMS) || '{}');
    return { queries, tokens, bigrams };
  } catch {
    return { queries: {}, tokens: {}, bigrams: {} };
  }
}

// Save to localStorage
function saveStorage(data: StorageData): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEYS.QUERIES, JSON.stringify(data.queries));
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(data.tokens));
    localStorage.setItem(STORAGE_KEYS.BIGRAMS, JSON.stringify(data.bigrams));
  } catch (e) {
    console.warn('[Autocomplete] Storage failed:', e);
  }
}

// Record a completed query
export function recordQuery(query: string, geo: { country: string; locale: string }): void {
  const sanitized = sanitizeQuery(query);
  if (sanitized.length < 2) return;

  const data = loadStorage();
  
  // Update query record
  if (!data.queries[sanitized]) {
    data.queries[sanitized] = { count: 0, lastUsedAt: 0 };
  }
  data.queries[sanitized].count += 1;
  data.queries[sanitized].lastUsedAt = Date.now();

  // Update tokens (unigrams)
  const tokens = sanitized.split(/\s+/);
  tokens.forEach(token => {
    data.tokens[token] = (data.tokens[token] || 0) + 1;
  });

  // Update bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    data.bigrams[bigram] = (data.bigrams[bigram] || 0) + 1;
  }

  saveStorage(data);
}

// Record a suggestion click
export function recordSuggestionClick(
  suggestion: string,
  rank: number,
  geo: { country: string; locale: string }
): void {
  // Boost clicked suggestions
  recordQuery(suggestion, geo);
}

// Generate suggestions for a prefix
export function suggest(
  prefix: string,
  geo: { country: string; locale: string }
): string[] {
  const sanitized = sanitizeQuery(prefix);
  if (sanitized.length < 2) return [];

  const data = loadStorage();
  const now = Date.now();
  const candidates: Array<{ query: string; score: number }> = [];

  // Get seed dictionary for locale
  const seeds = seedDictionary(geo.locale);

  // Score all queries (learned + seeds)
  const allQueries = { ...data.queries };
  
  // Add seeds with low default scores (cold start)
  seeds.forEach(seed => {
    if (!allQueries[seed.toLowerCase()]) {
      allQueries[seed.toLowerCase()] = { count: 1, lastUsedAt: 0 };
    }
  });

  Object.entries(allQueries).forEach(([query, record]) => {
    if (!query.startsWith(sanitized)) return;

    let score = 0;

    // Prefix match (exact match wins)
    if (query === sanitized) {
      score += WEIGHTS.PREFIX_MATCH * 2;
    } else {
      score += WEIGHTS.PREFIX_MATCH;
    }

    // Frequency
    score += Math.min(record.count, 10) * WEIGHTS.FREQUENCY;

    // Recency (decay after 7 days)
    const ageInDays = (now - record.lastUsedAt) / (1000 * 60 * 60 * 24);
    if (ageInDays < 7) {
      score += (7 - ageInDays) * WEIGHTS.RECENCY;
    }

    // Locale boost for seed terms
    if (seeds.includes(query)) {
      score += WEIGHTS.LOCALE_BOOST;
    }

    candidates.push({ query, score });
  });

  // Sort by score and return top 8
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(c => c.query);
}

// Clear all data (for privacy/reset)
export function clearAutocompleteData(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(STORAGE_KEYS.QUERIES);
  localStorage.removeItem(STORAGE_KEYS.TOKENS);
  localStorage.removeItem(STORAGE_KEYS.BIGRAMS);
}
