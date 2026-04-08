/**
 * Intelligence Events - Tracks user behavior for ML without PII
 * NO server calls, NO external API, pure local learning
 */

export interface QueryEvent {
  query: string;
  country: string;
  locale: string;
  timestamp: number;
}

export interface SuggestionClickEvent {
  suggestion: string;
  rank: number; // Position in list
  country: string;
  locale: string;
  timestamp: number;
}

// NO PII: only query patterns, no user IDs, no IP, no location beyond country
export function sanitizeQuery(query: string): string {
  return query.trim().toLowerCase().slice(0, 100);
}
