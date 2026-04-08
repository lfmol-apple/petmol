import type { CanonicalEventActionTarget } from '@/features/events/types';

export interface ResolvedAlertAction {
  healthModalMode: 'health' | 'grooming' | 'food' | 'full';
  healthActiveTab?: 'vaccines' | 'parasites' | 'medication' | 'eventos';
  openHealthOptionsModal?: boolean;
}

export function resolveAlertAction(target: CanonicalEventActionTarget | string): ResolvedAlertAction {
  switch (target) {
    case 'health/vaccines':
      return { healthModalMode: 'health', healthActiveTab: 'vaccines' };
    case 'health/parasites':
    case 'health/parasites/dewormer':
    case 'health/parasites/flea_tick':
    case 'health/parasites/collar':
      return { healthModalMode: 'health', healthActiveTab: 'parasites' };
    case 'health/medication':
      return { healthModalMode: 'health', healthActiveTab: 'medication' };
    case 'health/eventos':
      return { healthModalMode: 'health', healthActiveTab: 'eventos' };
    case 'health/grooming':
      return { healthModalMode: 'grooming' };
    case 'health/food':
      return { healthModalMode: 'food' };
    default:
      return { healthModalMode: 'full', openHealthOptionsModal: true };
  }
}