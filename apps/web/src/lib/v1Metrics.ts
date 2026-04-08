import { track } from '@/lib/analytics';

// Primary analytics facade for PETMOL V1.
// Use this module for product metrics in the current V1 experience.

export type V1MetricEvent =
  | 'pet_created'
  | 'pet_profile_completed'
  | 'medication_created'
  | 'medication_taken'
  | 'worm_control_created'
  | 'worm_control_applied'
  | 'flea_control_created'
  | 'flea_control_applied'
  | 'collar_created'
  | 'collar_replaced'
  | 'vaccine_record_created'
  | 'food_cycle_created'
  | 'food_restock_confirmed'
  | 'push_opened'
  | 'reminder_action_completed'
  | 'partner_clicked'
  | 'document_uploaded';

export function trackV1Metric(name: V1MetricEvent, properties: Record<string, unknown> = {}): void {
  track(name, properties);
}

export function trackReminderActionCompleted(properties: Record<string, unknown> = {}): void {
  trackV1Metric('reminder_action_completed', properties);
}

export function trackPartnerClicked(properties: Record<string, unknown> = {}): void {
  trackV1Metric('partner_clicked', properties);
}

export interface PetProfileMetricShape {
  name?: string | null;
  species?: string | null;
  breed?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  weight?: number | string | null;
  photo?: string | null;
}

export function isPetProfileCompleted(profile: PetProfileMetricShape): boolean {
  return Boolean(
    profile.name &&
    profile.species &&
    profile.breed &&
    profile.birth_date &&
    profile.sex &&
    profile.weight
  );
}