import { useMemo } from 'react';
import type { CanonicalPetEvent } from '@/features/events/types';
import type { PetInteractionItem } from './types';
import { loadMasterInteractionRules } from './preferences';
import { isEventVisibleOnHome } from './interactionEngine';

type CardTone = 'neutral' | 'ok' | 'warning' | 'critical';

interface HomeInteractionCenterResult {
  topAttentionAlerts: PetInteractionItem[];
  topAttentionPetCount: number;
  selectedPetActiveAlerts: PetInteractionItem[];
  selectedPetAllAlerts: PetInteractionItem[];
  selectedPetCardAlerts: {
    vacinas: boolean;
    vermifugo: boolean;
    antipulgas: boolean;
    coleira: boolean;
    grooming: boolean;
    food: boolean;
  };
  selectedPetCardColors: {
    vacinas: CardTone;
    vermifugo: CardTone;
    antipulgas: CardTone;
    coleira: CardTone;
    grooming: CardTone;
    food: CardTone;
  };
}

function resolveTone(events: CanonicalPetEvent[]): CardTone {
  if (events.some((event) => event.status === 'overdue' || event.status === 'today')) return 'critical';
  if (events.some((event) => event.diff <= 7)) return 'warning';
  if (events.length > 0) return 'ok';
  return 'neutral';
}

function shouldAlert(events: CanonicalPetEvent[]): boolean {
  const tone = resolveTone(events);
  return tone === 'warning' || tone === 'critical';
}

export function useHomeInteractionCenter(
  interactions: PetInteractionItem[],
  canonicalEvents: CanonicalPetEvent[],
  selectedPetId: string | null,
): HomeInteractionCenterResult {
  return useMemo(() => {
    const rules = loadMasterInteractionRules();
    const visibleInteractions = interactions.filter(
      (interaction) => interaction.show_on_home !== false,
    );

    const topAttentionAlerts = visibleInteractions.filter(
      (interaction) => interaction.status === 'overdue' || interaction.status === 'today',
    );
    const topAttentionPetCount = new Set(topAttentionAlerts.map((alert) => alert.pet_id).filter(Boolean)).size;

    const selectedPetAllAlerts = selectedPetId
      ? visibleInteractions.filter((interaction) => interaction.pet_id === selectedPetId)
      : [];
    const selectedPetActiveAlerts = selectedPetAllAlerts.filter(
      (interaction) => interaction.status === 'overdue' || interaction.status === 'today',
    );

    const selectedPetEvents = selectedPetId
      ? canonicalEvents.filter((event) => event.pet_id === selectedPetId && isEventVisibleOnHome(event, rules))
      : [];

    const vaccineEvents = selectedPetEvents.filter((event) => event.domain === 'vaccine');
    const dewormerEvents = selectedPetEvents.filter((event) => event.action_target === 'health/parasites/dewormer');
    const fleaTickEvents = selectedPetEvents.filter((event) => event.action_target === 'health/parasites/flea_tick');
    const collarEvents = selectedPetEvents.filter((event) => event.action_target === 'health/parasites/collar');
    const groomingEvents = selectedPetEvents.filter((event) => event.domain === 'grooming');
    const foodEvents = selectedPetEvents.filter((event) => event.domain === 'food');

    return {
      topAttentionAlerts,
      topAttentionPetCount,
      selectedPetActiveAlerts,
      selectedPetAllAlerts,
      selectedPetCardAlerts: {
        vacinas: shouldAlert(vaccineEvents),
        vermifugo: shouldAlert(dewormerEvents),
        antipulgas: shouldAlert(fleaTickEvents),
        coleira: shouldAlert(collarEvents),
        grooming: shouldAlert(groomingEvents),
        food: shouldAlert(foodEvents),
      },
      selectedPetCardColors: {
        vacinas: resolveTone(vaccineEvents),
        vermifugo: resolveTone(dewormerEvents),
        antipulgas: resolveTone(fleaTickEvents),
        coleira: resolveTone(collarEvents),
        grooming: resolveTone(groomingEvents),
        food: resolveTone(foodEvents),
      },
    };
  }, [interactions, canonicalEvents, selectedPetId]);
}
