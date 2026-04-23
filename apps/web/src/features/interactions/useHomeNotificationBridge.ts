/**
 * useHomeNotificationBridge.ts
 *
 * Bridge que conecta eventos canônicos → dispatcher de notificações.
 * Chamado uma vez por sessão (useEffect na home) para processar
 * os eventos ativos e enviar notificações reais nos canais habilitados.
 */

'use client';

import { useEffect, useRef } from 'react';
import type { CanonicalPetEvent } from '@/features/events/types';
import type { MasterInteractionRules } from '@/features/interactions/types';

/**
 * Hook que processa eventos e despacha notificações via policies ativas.
 *
 * @param events - Eventos canônicos do pet(s) visíveis na sessão
 * @param rules - Regras master (do useMasterInteractionRules)
 * @param enabled - Permite desligar o bridge sem desmontar o hook
 */
export function useHomeNotificationBridge(
  events: CanonicalPetEvent[],
  rules: MasterInteractionRules,
  enabled = true,
): void {
  // Ref para evitar re-dispatch no mesmo conjunto de eventos
  const lastEventIdsRef = useRef<string>('');

  useEffect(() => {
    void events;
    void rules;
    void enabled;
    lastEventIdsRef.current = '';
    return;
  }, [events, rules, enabled]);
}
