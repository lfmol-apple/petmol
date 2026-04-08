import type { PetWithHealth } from '@/features/pets/types';
import type { VaccineRecord } from '@/lib/petHealth';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';

export interface PetCareCollections {
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[];
  groomingRecords: GroomingRecord[];
}

const EMPTY_COLLECTIONS: PetCareCollections = {
  vaccines: [],
  parasiteControls: [],
  groomingRecords: [],
};

export function getPetCareCollections(pet: PetWithHealth | null | undefined): PetCareCollections {
  if (!pet) return EMPTY_COLLECTIONS;

  return {
    vaccines: pet.vaccines ?? pet.health_data?.vaccines ?? [],
    parasiteControls: pet.parasite_controls ?? pet.health_data?.parasite_controls ?? [],
    groomingRecords: pet.grooming_records ?? pet.health_data?.grooming_records ?? [],
  };
}