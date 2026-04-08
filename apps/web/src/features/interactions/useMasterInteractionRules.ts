'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MASTER_INTERACTION_RULES,
  getDefaultCarePolicy,
  loadMasterInteractionRules,
  saveMasterInteractionRules,
} from './preferences';
import type { CareInteractionPolicy, MasterInteractionRules } from './types';

/**
 * Hook de GOVERNANÇA MASTER (camada 1)
 *
 * - Escopo global (não depende de scopeId/localStorage por pet)
 * - Controla quais domínios podem gerar interação
 * - Controla se canais externos (ex.: browser notifications) podem ser usados
 */
export function useMasterInteractionRules() {
  const [rules, setRules] = useState<MasterInteractionRules>(DEFAULT_MASTER_INTERACTION_RULES);

  useEffect(() => {
    const nextRules = loadMasterInteractionRules();
    setRules(nextRules);
  }, []);

  const updateRules = (next: MasterInteractionRules) => {
    setRules(next);
    saveMasterInteractionRules(next);
  };

  const getCarePolicy = (careKey: string): CareInteractionPolicy | null => {
    const current = rules.carePolicies[careKey];
    const fallback = getDefaultCarePolicy(careKey);
    if (!current) return fallback;

    return {
      ...(fallback ?? {}),
      ...current,
      primary: {
        ...(fallback?.primary ?? {
          label: 'Ver detalhes',
          destination: 'open-central',
          allowContextualPurchase: false,
        }),
        ...current.primary,
      },
      secondary: current.secondary ?? fallback?.secondary,
    } as CareInteractionPolicy;
  };

  return useMemo(
    () => ({ rules, updateRules, getCarePolicy }),
    [rules],
  );
}
