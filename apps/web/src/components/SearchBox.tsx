'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { suggest, recordQuery, recordSuggestionClick } from '@/lib/intelligence';
import { isPetQuery, sanitizeAndBuildPetQuery } from '@/lib/petLexicon';

interface SearchState {
  query: string;
  warning: string | null;
  suggestions: string[];
  petSuggestions: string[];
  isFocused: boolean;
  isNonPet: boolean;
  isLoadingSuggestions: boolean;
  isSubmitting: boolean;
}

// Debounce timeout ref
let debounceTimer: NodeJS.Timeout | null = null;

// Client-side cache (60s TTL)
const autocompleteCache = new Map<string, { suggestions: string[], timestamp: number }>();
const CACHE_TTL = 60000; // 60 seconds

export function SearchBox() {
  const { t, geo } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [state, setState] = useState<SearchState>({
    query: '',
    warning: null,
    suggestions: [],
    petSuggestions: [],
    isFocused: false,
    isNonPet: false,
    isLoadingSuggestions: false,
    isSubmitting: false,
  });

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Check pet intent in real-time
    const intent = isPetQuery(value, geo.locale);
    
    // Update state immediately
    setState(prev => ({
      ...prev,
      query: value,
      warning: null,
      isNonPet: !intent.is_pet && value.trim().length >= 2,
      petSuggestions: intent.suggestions || [],
    }));

    // Debounce autocomplete fetch (300ms)
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (value.trim().length >= 2) {
      setState(prev => ({ ...prev, isLoadingSuggestions: true }));
      
      debounceTimer = setTimeout(async () => {
        const trimmedValue = value.trim();
        const cacheKey = `${trimmedValue.toLowerCase()}:${geo.country}:${geo.locale}`;
        
        // Check client cache first
        const cached = autocompleteCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          setState(prev => ({
            ...prev,
            suggestions: cached.suggestions,
            isLoadingSuggestions: false,
          }));
          return;
        }
        
        try {
          // Create new AbortController for this request
          abortControllerRef.current = new AbortController();
          
          // Fetch internet autocomplete from backend
          const response = await fetch(
            `/api/autocomplete?q=${encodeURIComponent(trimmedValue)}&country=${geo.country}&locale=${geo.locale}&limit=8`,
            { 
              signal: abortControllerRef.current.signal,
              headers: { 'Accept': 'application/json' }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            const suggestions = data.suggestions || [];
            
            // Cache the result
            autocompleteCache.set(cacheKey, {
              suggestions,
              timestamp: Date.now()
            });
            
            // Clean old cache entries (keep last 50)
            if (autocompleteCache.size > 50) {
              const firstKey = autocompleteCache.keys().next().value;
              if (firstKey) autocompleteCache.delete(firstKey);
            }
            
            setState(prev => ({
              ...prev,
              suggestions,
              isLoadingSuggestions: false,
            }));
          } else {
            // Silently fallback to local suggestions (no error shown to user)
            const localSuggestions = suggest(trimmedValue, geo);
            setState(prev => ({
              ...prev,
              suggestions: localSuggestions,
              isLoadingSuggestions: false,
            }));
          }
        } catch (err: unknown) {
          // Silently handle errors (abort, timeout, network issues)
          // Don't show error to user - just use local fallback
          if (!(err instanceof Error && err.name === 'AbortError')) {
            const localSuggestions = suggest(trimmedValue, geo);
            setState(prev => ({
              ...prev,
              suggestions: localSuggestions,
              isLoadingSuggestions: false,
            }));
          }
        }
      }, 300); // Increased from 200ms to 300ms
    } else {
      setState(prev => ({ ...prev, suggestions: [], isLoadingSuggestions: false }));
    }
  }, [geo]);

  const saveToReorderHistory = useCallback((finalQuery: string) => {
    try {
      const reorderItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        query: finalQuery,
        timestamp: Date.now(),
      };
      
      const stored = localStorage.getItem('petmol_reorders');
      const history = stored ? JSON.parse(stored) : [];
      history.unshift(reorderItem);
      localStorage.setItem('petmol_reorders', JSON.stringify(history.slice(0, 50)));
    } catch (err) {
      console.error('Failed to save reorder:', err);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    // Previne múltiplas submissões simultâneas
    if (state.isSubmitting) {
      console.log('Submit já em progresso, ignorando...');
      return;
    }

    const q = state.query.trim();
    
    if (q.length < 2) {
      setState(prev => ({
        ...prev,
        warning: t('search.min_chars'),
        isSubmitting: false
      }));
      return;
    }

    // Marca como submitting
    setState(prev => ({ ...prev, isSubmitting: true }));

    // Validate pet intent
    const intent = isPetQuery(q, geo.locale);
    
    if (!intent.is_pet) {
      // Non-pet detected - show warning and suggestions
      setState(prev => ({
        ...prev,
        isNonPet: true,
        petSuggestions: intent.suggestions || [],
        warning: t('search.non_pet_warning'),
        isSubmitting: false
      }));
      return;
    }

    // Build sanitized query with context if needed
    const { final_q } = sanitizeAndBuildPetQuery(q, geo.locale);
    
    if (!final_q) {
      setState(prev => ({
        ...prev,
        warning: t('search.process_failed'),
        isSubmitting: false
      }));
      return;
    }

    recordQuery(q, geo);
    saveToReorderHistory(final_q);
    
    const url = `/api/handoff/shopping?query=${encodeURIComponent(final_q)}&country=${geo.country}&locale=${geo.locale}`;
    window.location.href = url;
  }, [state.query, state.isSubmitting, geo, saveToReorderHistory, t]);

  const handleSuggestionClick = useCallback((suggestion: string, rank: number) => {
    recordSuggestionClick(suggestion, rank, geo);
    setState(prev => ({ 
      ...prev, 
      query: suggestion,
      warning: null,
      isNonPet: false,
      petSuggestions: [],
      isSubmitting: false
    }));
    // Usa setTimeout para garantir que o estado foi atualizado
    setTimeout(() => {
      // Re-valida antes de submeter
      const intent = isPetQuery(suggestion, geo.locale);
      if (intent.is_pet) {
        handleSubmit();
      }
    }, 150);
  }, [geo, handleSubmit]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setState(prev => ({ ...prev, isFocused: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto">
      {/* Direct Search Input */}
      <div className={`relative flex items-center bg-white rounded-2xl border-2 transition-all duration-200 ${
        state.isFocused ? 'border-primary-500 shadow-lg shadow-primary-100' : 'border-slate-200 shadow-md'
      }`}>
        <svg className="absolute left-4 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        
        <input
          type="text"
          value={state.query}
          onChange={handleInputChange}
          onFocus={() => setState(prev => ({ ...prev, isFocused: true }))}
          onKeyDown={(e) => e.key === 'Enter' && state.query.trim().length >= 2 && handleSubmit()}
          placeholder={t('search.placeholder')}
          className="w-full py-4 pl-12 pr-32 text-lg bg-transparent outline-none text-slate-900 placeholder-slate-400"
          autoComplete="off"
          aria-label={t('search.aria_label')}
        />
        
        {state.query && (
          <button 
            onClick={() => setState(prev => ({ 
              ...prev, 
              query: '', 
              suggestions: [],
              warning: null,
              isNonPet: false,
              petSuggestions: [],
              isSubmitting: false
            }))}
            className="absolute right-24 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={t('search.clear_label')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        <button
          onClick={handleSubmit}
          disabled={state.query.trim().length < 2 || state.isSubmitting}
          className="absolute right-2 px-4 py-2 bg-gradient-to-r from-[#0056D2] to-violet-600 text-white rounded-xl font-medium hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
          aria-label={t('search.search_label')}
        >
          {state.isSubmitting ? '⏳' : '🔍'}
        </button>
      </div>

      {/* Warning Message + Pet Suggestions */}
      {state.warning && (
        <div className="mt-3 p-4 bg-amber-50 border border-amber-300 rounded-lg" role="alert">
          <p className="text-sm text-amber-900 mb-3">
            ⚠️ {state.warning}
          </p>
          {state.petSuggestions.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {state.petSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setState(prev => ({ 
                      ...prev, 
                      query: suggestion, 
                      isNonPet: false, 
                      warning: null,
                      isSubmitting: false
                    }));
                    setTimeout(() => {
                      // Re-valida antes de submeter
                      const intent = isPetQuery(suggestion, geo.locale);
                      if (intent.is_pet) {
                        handleSubmit();
                      }
                    }, 150);
                  }}
                  className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm text-slate-700 hover:bg-amber-100 hover:border-amber-400 transition-colors text-left"
                >
                  🐾 {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Autocomplete Suggestions (only if not showing non-pet warning) */}
      {state.isFocused && !state.isNonPet && state.suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <ul className="py-2" role="listbox">
            {state.suggestions.map((suggestion, index) => (
              <li key={`${suggestion}-${index}`} role="option">
                <button 
                  onClick={() => handleSuggestionClick(suggestion, index)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="flex-1 text-slate-900">{suggestion}</span>
                  <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-3 text-xs text-slate-500 text-center">
        {t('search.disclaimer')}
      </p>
    </div>
  );
}
