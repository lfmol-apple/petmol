'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/I18nContext';
import {
  getAllSmartSuggestions,
  notifyHighPrioritySuggestions,
  type SmartSuggestion,
} from '@/lib/smartSuggestions';

export function SmartSuggestionsWidget() {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load suggestions
    const loadSuggestions = () => {
      if (typeof window === 'undefined') return;
      const all = getAllSmartSuggestions();
      // Filter out dismissed
      const dismissedStr = localStorage.getItem('dismissed_suggestions');
      const dismissedSet: Set<string> = dismissedStr ? new Set(JSON.parse(dismissedStr)) : new Set();
      setDismissed(dismissedSet);
      
      const active = all.filter(s => !dismissedSet.has(s.id));
      setSuggestions(active);
    };

    loadSuggestions();

    // Notify high priority
    notifyHighPrioritySuggestions();

    // Refresh every minute
    const interval = setInterval(loadSuggestions, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleDismiss = (suggestionId: string) => {
    const newDismissed = new Set(dismissed);
    newDismissed.add(suggestionId);
    setDismissed(newDismissed);
    localStorage.setItem('dismissed_suggestions', JSON.stringify(Array.from(newDismissed)));
    setSuggestions(suggestions.filter(s => s.id !== suggestionId));
  };

  const handleAction = (suggestion: SmartSuggestion) => {
    if (suggestion.action_callback) {
      suggestion.action_callback();
    } else if (suggestion.action_url) {
      window.location.href = suggestion.action_url;
    }
  };

  if (suggestions.length === 0) return null;

  const highPriority = suggestions.filter(s => s.priority === 'high');
  const mediumPriority = suggestions.filter(s => s.priority === 'medium');
  const lowPriority = suggestions.filter(s => s.priority === 'low');

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Collapsed button */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-gradient-to-r from-purple-600 to-[#0056D2] text-white rounded-full shadow-2xl p-4 hover:scale-110 transition-transform animate-pulse"
        >
          <div className="flex items-center gap-2">
            <span className="text-2xl">✨</span>
            {highPriority.length > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                {suggestions.length}
              </div>
            )}
          </div>
        </button>
      )}

      {/* Expanded widget */}
      {isExpanded && (
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-96 max-h-[600px] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-[#0056D2] text-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✨</span>
                <div>
                  <h3 className="font-bold">{t('smart_suggestions.title')}</h3>
                  <p className="text-xs text-purple-100">
                    {t('smart_suggestions.summary', { count: suggestions.length })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Suggestions list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {highPriority.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onDismiss={handleDismiss}
                onAction={handleAction}
              />
            ))}
            {mediumPriority.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onDismiss={handleDismiss}
                onAction={handleAction}
              />
            ))}
            {lowPriority.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onDismiss={handleDismiss}
                onAction={handleAction}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onDismiss,
  onAction,
}: {
  suggestion: SmartSuggestion;
  onDismiss: (id: string) => void;
  onAction: (suggestion: SmartSuggestion) => void;
}) {
  const bgColor = {
    high: 'bg-red-50 border-red-200',
    medium: 'bg-yellow-50 border-yellow-200',
    low: 'bg-blue-50 border-blue-200',
  }[suggestion.priority];

  const textColor = {
    high: 'text-red-900',
    medium: 'text-yellow-900',
    low: 'text-blue-900',
  }[suggestion.priority];

  return (
    <div className={`${bgColor} border-2 rounded-2xl p-4`}>
      <div className="flex items-start justify-between mb-2">
        <h4 className={`font-semibold ${textColor}`}>{suggestion.title}</h4>
        <button
          onClick={() => onDismiss(suggestion.id)}
          className="text-slate-400 hover:text-slate-600 text-sm"
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-slate-700 mb-3">{suggestion.message}</p>
      <button
        onClick={() => onAction(suggestion)}
        className="w-full py-2 bg-gradient-to-r from-purple-600 to-[#0056D2] text-white rounded-xl font-semibold text-sm hover:shadow-lg transition"
      >
        {suggestion.action_label} →
      </button>
    </div>
  );
}
