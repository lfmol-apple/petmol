/**
 * useSuggest – debounced canonical suggestion hook
 *
 * Chama GET /api/suggest?domain=X&q=Y (debounce 400ms).
 * Retorna { suggestion, loading, clear }.
 *
 * Uso:
 * ```tsx
 * const { suggestion } = useSuggest(value, 'vaccine', { species: 'dog' });
 * ```
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api';

export type SuggestDomain = 'vaccine' | 'food' | 'provider';

export interface SuggestionCandidate {
  canonical: string;
  code: string | null;
  confidence: number;
  method: string;
  matched_alias: string;
}

export interface SuggestionResult {
  raw: string;
  canonical: string | null;
  code: string | null;
  confidence: number;
  method: string;
  auto_apply: boolean;
  candidates: SuggestionCandidate[];
}

interface Options {
  species?: 'dog' | 'cat';
  country?: string;
  /** Debounce delay in ms. Default: 400 */
  debounce?: number;
  /** Minimum query length to trigger. Default: 2 */
  minLength?: number;
  /** Whether to skip the suggestion call. Default: false */
  disabled?: boolean;
}

interface UseSuggestReturn {
  suggestion: SuggestionResult | null;
  loading: boolean;
  clear: () => void;
}

export function useSuggest(
  rawText: string,
  domain: SuggestDomain,
  options: Options = {}
): UseSuggestReturn {
  const {
    species,
    country,
    debounce = 400,
    minLength = 2,
    disabled = false,
  } = options;

  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (disabled || !rawText || rawText.trim().length < minLength) {
      setSuggestion(null);
      setLoading(false);
      return;
    }

    // Debounce
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      // Cancel previous request
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      try {
        const params = new URLSearchParams({ q: rawText.trim(), domain });
        if (species) params.set('species', species);
        if (country) params.set('country', country);

        const res = await fetch(`${API_BASE_URL}/suggest?${params}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error('suggest failed');
        const data: SuggestionResult = await res.json();
        // Only show if there's an actual suggestion
        setSuggestion(data.canonical ? data : null);
      } catch (e: unknown) {
        if ((e as Error)?.name !== 'AbortError') {
          setSuggestion(null);
        }
      } finally {
        setLoading(false);
      }
    }, debounce);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawText, domain, species, country, debounce, minLength, disabled]);

  const clear = () => {
    setSuggestion(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
  };

  return { suggestion, loading, clear };
}
