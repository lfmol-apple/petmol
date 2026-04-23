/**
 * notificationDispatcher.ts
 *
 * Dispatcher central do PETMOL.
 * Transforma: evento + policy → notificação real nos canais habilitados.
 *
 * Fluxo:
 *   1. Verificar se policy está ativa
 *   2. Verificar timing (antecedência)
 *   3. Decidir canais (home, central) — push é gerenciado inteiramente pelo backend
 *   4. Montar objeto NotificationPayload
 *   5. Despachar para cada canal
 */

import type { CanonicalPetEvent } from '@/features/events/types';
import type { CareInteractionPolicy, MasterInteractionRules } from '@/features/interactions/types';
import { loadMasterInteractionRules } from '@/features/interactions/preferences';
import { resolveCarePolicyKeyFromEvent, getCarePolicyForEvent } from '@/features/interactions/interactionEngine';
import { localTodayISO } from '@/lib/localDate';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type NotificationDestination =
  | 'purchase'
  | 'register'
  | 'edit'
  | 'history'
  | 'central'
  | 'detail';

export interface NotificationPayload {
  id: string;
  /** Chave do domínio de cuidado (ex: 'food', 'vaccines') */
  type: string;
  petId: string;
  petName: string;
  title: string;
  message: string;
  ctaPrimary: string;
  ctaSecondary?: string;
  destination: NotificationDestination;
  /** Destino do CTA secundário, se existir */
  destinationSecondary?: NotificationDestination;
  timestamp: string;
  /** Prioridade numérica para ordenação na central */
  priority: number;
  /** Canais em que esta notificação foi despachada */
  channels: ('home' | 'central' | 'push')[];
}

// ---------------------------------------------------------------------------
// Mapeamento de destination
// ---------------------------------------------------------------------------

function resolveDestination(policy: CareInteractionPolicy): NotificationDestination {
  const dest = policy.primary.destination;
  if (dest === 'open-shopping' || dest.startsWith('health/') && policy.primary.allowContextualPurchase) return 'purchase';
  if (dest === 'open-register') return 'register';
  if (dest === 'open-edit') return 'edit';
  if (dest === 'open-history') return 'history';
  if (dest === 'open-central') return 'central';
  // Destinos de saúde diretos (health/vaccines etc.) → detail
  return 'detail';
}

function resolveSecondaryDestination(policy: CareInteractionPolicy): NotificationDestination | undefined {
  if (!policy.secondary) return undefined;
  const dest = policy.secondary.destination;
  if (dest === 'open-shopping') return 'purchase';
  if (dest === 'open-register') return 'register';
  if (dest === 'open-edit') return 'edit';
  if (dest === 'open-history') return 'history';
  if (dest === 'open-central') return 'central';
  if (dest === 'none') return undefined;
  return 'detail';
}

// ---------------------------------------------------------------------------
// Construção do payload
// ---------------------------------------------------------------------------

function buildTitle(event: CanonicalPetEvent, policy: CareInteractionPolicy): string {
  // Usa pushTitle se disponível, senão constrói a partir do pet + label
  if (policy.pushTitle) return policy.pushTitle;
  return `${event.pet_name} — ${policy.label ?? event.label}`;
}

function buildMessage(event: CanonicalPetEvent, policy: CareInteractionPolicy): string {
  if (policy.pushBody) return policy.pushBody;
  if (event.status === 'overdue') {
    const days = Math.abs(event.diff);
    return `${policy.label ?? event.label} está em atraso há ${days} ${days === 1 ? 'dia' : 'dias'}.`;
  }
  if (event.status === 'today') {
    return `${policy.label ?? event.label} precisa de atenção hoje.`;
  }
  const days = event.diff;
  return `${policy.label ?? event.label} vence em ${days} ${days === 1 ? 'dia' : 'dias'}.`;
}

function buildPriority(policy: CareInteractionPolicy): number {
  if (typeof policy.priority === 'number') return policy.priority;
  return { low: 25, medium: 50, high: 75, critical: 100 }[policy.priority] ?? 50;
}

// ---------------------------------------------------------------------------
// Dispatcher principal
// ---------------------------------------------------------------------------

/**
 * Despacha notificação real para os canais habilitados pela policy.
 *
 * Retorna o payload gerado, ou null se o evento foi filtrado.
 */
export function dispatchNotification(
  event: CanonicalPetEvent,
  policy?: CareInteractionPolicy | null,
  rules?: MasterInteractionRules,
): NotificationPayload | null {
  const masterRules = rules ?? loadMasterInteractionRules();

  // Resolver policy se não fornecida
  const resolvedPolicy = policy ?? getCarePolicyForEvent(event, masterRules);
  if (!resolvedPolicy) return null;

  // 1. Policy ativa?
  if (!resolvedPolicy.enabled) return null;
  if (!masterRules.enabled) return null;

  // 2. Timing — verificar antecedência
  if (event.status === 'upcoming') {
    const advance = resolvedPolicy.advance_days ?? masterRules.advance_days ?? 7;
    if (event.diff > advance) return null;
  }

  // 3. Decidir canais — push é exclusivo do backend
  const channels: NotificationPayload['channels'] = [];

  const homeActive = masterRules.channels.homePanel.enabled && resolvedPolicy.showOnHome !== false;
  const centralActive = masterRules.channels.internalCenter.enabled && resolvedPolicy.showInCenter !== false;

  if (homeActive) channels.push('home');
  if (centralActive) channels.push('central');

  // Se nenhum canal ativo, não despachar
  if (channels.length === 0) return null;

  // 5. Montar payload
  const destination = resolveDestination(resolvedPolicy);
  const destinationSecondary = resolveSecondaryDestination(resolvedPolicy);

  const payload: NotificationPayload = {
    id: `notif:${event.id}:${localTodayISO()}`,
    type: resolveCarePolicyKeyFromEvent(event),
    petId: event.pet_id,
    petName: event.pet_name,
    title: buildTitle(event, resolvedPolicy),
    message: buildMessage(event, resolvedPolicy),
    ctaPrimary: resolvedPolicy.primaryCtaLabel ?? resolvedPolicy.primary.label ?? 'Ver detalhes',
    ctaSecondary: resolvedPolicy.secondaryCtaLabel ?? resolvedPolicy.secondary?.label,
    destination,
    destinationSecondary,
    timestamp: new Date().toISOString(),
    priority: buildPriority(resolvedPolicy),
    channels,
  };

  return payload;
}

// ---------------------------------------------------------------------------
// Batch helper — despacha uma lista de eventos de uma vez
// ---------------------------------------------------------------------------

/**
 * Despacha notificações para múltiplos eventos.
 * Retorna apenas os payloads que foram efetivamente enviados.
 */
export function dispatchNotifications(
  events: CanonicalPetEvent[],
  rules?: MasterInteractionRules,
): NotificationPayload[] {
  const masterRules = rules ?? loadMasterInteractionRules();
  const results: NotificationPayload[] = [];

  for (const event of events) {
    const payload = dispatchNotification(event, null, masterRules);
    if (payload) results.push(payload);
  }

  return results;
}
