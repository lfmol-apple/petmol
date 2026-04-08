'use client';

export type HomeFixedControlId = 'documents' | 'shopping' | 'emergency';
export type HomeInactiveEligibleControlId = 'vaccines' | 'dewormer' | 'flea_tick' | 'collar' | 'food' | 'grooming' | 'medication';
export type HomeControlId = HomeFixedControlId | HomeInactiveEligibleControlId;

export const HOME_INACTIVE_ELIGIBLE_CONTROL_IDS: HomeInactiveEligibleControlId[] = [
  'vaccines',
  'dewormer',
  'flea_tick',
  'collar',
  'food',
  'grooming',
  'medication',
];

export const HOME_CONTROL_LABELS: Record<HomeControlId, string> = {
  vaccines: 'Vacinas',
  dewormer: 'Vermífugo',
  flea_tick: 'Antipulgas',
  collar: 'Coleira',
  food: 'Alimentação',
  grooming: 'Banho e tosa',
  medication: 'Medicação',
  documents: 'Documentos',
  shopping: 'Shopping',
  emergency: 'Emergência',
};

type StoredHomeControlPreferences = {
  version: 1;
  inactive: HomeInactiveEligibleControlId[];
};

function sanitizeInactiveControls(value: unknown): HomeInactiveEligibleControlId[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<HomeInactiveEligibleControlId>(HOME_INACTIVE_ELIGIBLE_CONTROL_IDS);
  return value
    .map((item) => String(item) as HomeInactiveEligibleControlId)
    .filter((item, index, arr) => allowed.has(item) && arr.indexOf(item) === index);
}

function makeHomeControlPreferenceKey(viewerId: string, petId: string): string {
  return `petmol_home_controls:${viewerId}:${petId}`;
}

export function loadInactiveHomeControls(viewerId: string, petId: string): HomeInactiveEligibleControlId[] {
  if (typeof window === 'undefined' || !viewerId || !petId) return [];
  try {
    const raw = window.localStorage.getItem(makeHomeControlPreferenceKey(viewerId, petId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoredHomeControlPreferences> | HomeInactiveEligibleControlId[];
    if (Array.isArray(parsed)) return sanitizeInactiveControls(parsed);
    return sanitizeInactiveControls(parsed.inactive);
  } catch {
    return [];
  }
}

export function saveInactiveHomeControls(
  viewerId: string,
  petId: string,
  inactive: HomeInactiveEligibleControlId[],
): void {
  if (typeof window === 'undefined' || !viewerId || !petId) return;
  const payload: StoredHomeControlPreferences = {
    version: 1,
    inactive: sanitizeInactiveControls(inactive),
  };
  window.localStorage.setItem(makeHomeControlPreferenceKey(viewerId, petId), JSON.stringify(payload));
}