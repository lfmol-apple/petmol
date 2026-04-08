import { getPetCareCollections } from '@/features/pets/healthCollections';
import type { PetWithHealth } from '@/features/pets/types';
import type { VaccineRecord } from '@/lib/petHealth';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';
import { latestVaccinePerGroup } from '@/lib/vaccineUtils';

export interface ArrivalCareInsights {
  freshCurrentPet: PetWithHealth | null;
  overdueVaccines: Array<VaccineRecord & { daysOverdue: number }>;
  overdueParasites: Array<ParasiteControl & { daysOverdue: number }>;
  overdueGrooming: Array<GroomingRecord & { calculated_next_date: Date; daysOverdue: number }>;
  totalOverdue: number;
  mostRecentVaccine: (VaccineRecord & { daysOverdue: number }) | null;
  mostRecentParasite: (ParasiteControl & { daysOverdue: number }) | null;
}

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function buildArrivalCareInsights(
  pets: PetWithHealth[],
  selectedPetId: string | null,
  referenceDate: Date = new Date(),
): ArrivalCareInsights {
  const freshCurrentPet = pets.find((pet) => pet.pet_id === selectedPetId) || pets[0] || null;
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  if (!freshCurrentPet) {
    return {
      freshCurrentPet: null,
      overdueVaccines: [],
      overdueParasites: [],
      overdueGrooming: [],
      totalOverdue: 0,
      mostRecentVaccine: null,
      mostRecentParasite: null,
    };
  }

  const { vaccines, parasiteControls, groomingRecords } = getPetCareCollections(freshCurrentPet);
  const currentVaccines = Array.from(latestVaccinePerGroup(vaccines).values());

  const overdueVaccines = currentVaccines
    .filter((vaccine) => {
      if (!vaccine.next_dose_date) return false;
      const nextDose = createLocalDate(vaccine.next_dose_date);
      return nextDose.getTime() < today.getTime();
    })
    .map((vaccine) => ({
      ...vaccine,
      daysOverdue: Math.ceil((today.getTime() - createLocalDate(vaccine.next_dose_date!).getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .sort((left, right) => left.daysOverdue - right.daysOverdue);

  const latestParasiteByType: Record<string, ParasiteControl> = {};
  for (const control of parasiteControls) {
    const key = String(control.type || '').toLowerCase();
    if (!key) continue;
    const previous = latestParasiteByType[key];
    if (!previous) {
      latestParasiteByType[key] = control;
      continue;
    }

    const currentDate = createLocalDate(control.date_applied).getTime();
    const previousDate = createLocalDate(previous.date_applied).getTime();
    if (!Number.isNaN(currentDate) && (Number.isNaN(previousDate) || currentDate > previousDate)) {
      latestParasiteByType[key] = control;
    }
  }

  const overdueParasites = Object.values(latestParasiteByType)
    .filter((control) => {
      if (!control.next_due_date) return false;
      const nextDate = createLocalDate(control.next_due_date);
      return nextDate.getTime() < today.getTime();
    })
    .map((control) => ({
      ...control,
      daysOverdue: Math.ceil((today.getTime() - createLocalDate(control.next_due_date!).getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .sort((left, right) => left.daysOverdue - right.daysOverdue);

  const latestGroomingByType: Record<string, GroomingRecord | null> = { bath: null, grooming: null, bath_grooming: null };
  groomingRecords.forEach((record) => {
    const recordType = record.type;
    if (!latestGroomingByType[recordType] || createLocalDate(record.date) > createLocalDate(latestGroomingByType[recordType].date)) {
      latestGroomingByType[recordType] = record;
    }
  });

  const overdueGrooming = Object.values(latestGroomingByType)
    .filter((record): record is GroomingRecord => {
      if (!record) return false;

      let nextDate: Date;
      if (record.next_recommended_date) {
        nextDate = createLocalDate(record.next_recommended_date);
      } else if (record.date && record.frequency_days) {
        const lastDate = createLocalDate(record.date);
        nextDate = new Date(lastDate);
        nextDate.setDate(nextDate.getDate() + record.frequency_days);
      } else {
        return false;
      }

      return nextDate.getTime() < today.getTime();
    })
    .map((record) => {
      const nextDate = record.next_recommended_date
        ? createLocalDate(record.next_recommended_date)
        : (() => {
            const lastDate = createLocalDate(record.date);
            const resolvedDate = new Date(lastDate);
            resolvedDate.setDate(resolvedDate.getDate() + (record.frequency_days ?? 0));
            return resolvedDate;
          })();

      return {
        ...record,
        calculated_next_date: nextDate,
        daysOverdue: Math.ceil((today.getTime() - nextDate.getTime()) / (24 * 60 * 60 * 1000)),
      };
    })
    .sort((left, right) => left.daysOverdue - right.daysOverdue);

  return {
    freshCurrentPet,
    overdueVaccines,
    overdueParasites,
    overdueGrooming,
    totalOverdue: overdueVaccines.length + overdueParasites.length + overdueGrooming.length,
    mostRecentVaccine: overdueVaccines[0] ?? null,
    mostRecentParasite: overdueParasites[0] ?? null,
  };
}