'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_INTERACTION_PREFERENCES, loadTutorInteractionPreferences, saveTutorInteractionPreferences } from './preferences';
import type { InteractionPreferences } from './types';

export function useTutorInteractionPreferences(scopeId?: string) {
  const [preferences, setPreferences] = useState<InteractionPreferences>(DEFAULT_INTERACTION_PREFERENCES);

  useEffect(() => {
    if (!scopeId) {
      setPreferences(DEFAULT_INTERACTION_PREFERENCES);
      return;
    }

    setPreferences(loadTutorInteractionPreferences(scopeId));
  }, [scopeId]);

  const updatePreferences = (next: InteractionPreferences) => {
    setPreferences(next);
    if (scopeId) {
      saveTutorInteractionPreferences(scopeId, next);
    }
  };

  return useMemo(() => ({
    preferences,
    updatePreferences,
  }), [preferences]);
}