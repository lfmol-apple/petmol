import { useMemo } from 'react';
import type { PetWithHealth } from '@/features/pets/types';
import type { CanonicalPetEvent } from '@/features/events/types';
import { buildCanonicalEventsForPets } from '@/features/events/canonicalEventEngine';
import type { PetEventRecord } from '@/lib/petEvents';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { PetInteractionItem } from './types';
import { loadMasterInteractionRules } from './preferences';
import { canonicalEventsToPetInteractions } from './interactionEngine';

interface UseMultipetInteractionsContext {
  feedingPlanByPet?: Record<string, FeedingPlanEntry | null | undefined>;
  petEventsByPet?: Record<string, PetEventRecord[] | undefined>;
}

export interface UseMultipetInteractionsResult {
  canonicalEvents: CanonicalPetEvent[];
  interactions: PetInteractionItem[];
  interactionsForPet: (petId: string) => PetInteractionItem[];
}

export function useMultipetInteractions(
  pets: PetWithHealth[],
  context: UseMultipetInteractionsContext = {},
): UseMultipetInteractionsResult {
  return useMemo((): UseMultipetInteractionsResult => {
    if (!pets?.length) {
      return {
        canonicalEvents: [],
        interactions: [],
        interactionsForPet: () => [],
      };
    }

    const canonicalEvents = buildCanonicalEventsForPets(
      pets.map((pet) => ({
        pet,
        feedingPlan: context.feedingPlanByPet?.[pet.pet_id] ?? null,
        petEvents: context.petEventsByPet?.[pet.pet_id] ?? [],
      })),
    );

    const rules = loadMasterInteractionRules();
    const rawInteractions = canonicalEventsToPetInteractions(canonicalEvents, rules);

    const sortedInteractions = [...rawInteractions].sort((left, right) => {
      const priorityDelta = (right.priority ?? 0) - (left.priority ?? 0);
      if (priorityDelta !== 0) return priorityDelta;

      const leftOverdue = left.days_overdue ?? (left.status === 'today' ? 0 : -1);
      const rightOverdue = right.days_overdue ?? (right.status === 'today' ? 0 : -1);
      return rightOverdue - leftOverdue;
    });

    const interactions = (() => {
      if (rules.multipet.multiplePendingBehavior === 'stack') {
        return sortedInteractions;
      }

      const byPet = new Map<string, PetInteractionItem[]>();
      sortedInteractions.forEach((interaction) => {
        const current = byPet.get(interaction.pet_id) ?? [];
        current.push(interaction);
        byPet.set(interaction.pet_id, current);
      });

      return Array.from(byPet.values()).flatMap((petItems) => {
        if (rules.multipet.multiplePendingBehavior === 'highest-only') {
          return petItems.slice(0, 1);
        }

        return petItems.slice(0, Math.max(1, rules.multipet.maxItemsPerPet));
      });
    })();

    const interactionsForPet = (petId: string) => interactions.filter((interaction) => interaction.pet_id === petId);

    return {
      canonicalEvents,
      interactions,
      interactionsForPet,
    };
  }, [pets, context]);
}
