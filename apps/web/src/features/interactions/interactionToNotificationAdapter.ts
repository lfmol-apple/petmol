import type { InteractionDecision } from './types';
import type { CanonicalEventActionTarget } from '@/features/events/types';
import { resolveCanonicalActionTargetModal } from './homeModalRouting';

export interface InteractionNotificationPayload {
  tag: string;
  title: string;
  body: string;
  icon: string;
  badge: string;
  category: InteractionDecision['category'];
  severity: InteractionDecision['severity'];
  pet_id: string;
  pet_name: string;
  action_target: CanonicalEventActionTarget;
  url: string;
  dedup_key?: string;
  requireInteraction?: boolean;
  autoCloseMs?: number;
}

function buildDeepLink(decision: InteractionDecision): string {
  const modal = resolveCanonicalActionTargetModal(decision.action_target);
  const params = new URLSearchParams({ modal, petId: decision.pet_id });
  return `/home?${params.toString()}`;
}


export function interactionDecisionsToNotifications(decisions: InteractionDecision[]): InteractionNotificationPayload[] {
  return decisions
    .filter((decision) => decision.channel === 'in-app-notification')
    .map((decision) => ({
      tag: `petmol-${decision.pet_id}-${decision.category}-${decision.dedup_key ?? decision.source_key}`,
      title: decision.title,
      body: decision.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      category: decision.category,
      severity: decision.severity,
      pet_id: decision.pet_id,
      pet_name: decision.pet_name,
      action_target: decision.action_target,
      url: buildDeepLink(decision),
      dedup_key: decision.dedup_key,
      requireInteraction: decision.requireInteraction,
      autoCloseMs: decision.autoCloseMs,
    }));
}
