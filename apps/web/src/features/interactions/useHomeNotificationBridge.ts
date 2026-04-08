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
import { dispatchNotifications } from '@/features/notifications/notificationDispatcher';

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
    if (!enabled) return;
    if (!events.length) return;

    const eventIds = events.map((e) => e.id).sort().join(',');
    if (eventIds === lastEventIdsRef.current) return; // sem novos eventos
    lastEventIdsRef.current = eventIds;

    // Despacha em microtask para não bloquear o render
    const id = window.requestAnimationFrame(() => {
      dispatchNotifications(events, rules);
    });

    return () => window.cancelAnimationFrame(id);
  }, [events, rules, enabled]);
}
