export type CanonicalEventDomain =
  | 'vaccine'
  | 'parasite'
  | 'grooming'
  | 'food'
  | 'medication'
  | 'event';

export type CanonicalEventStatus = 'overdue' | 'today' | 'upcoming';

export type CanonicalEventSeverity = 'critical' | 'warning' | 'info';

export type CanonicalEventActionTarget =
  | 'health/vaccines'
  | 'health/parasites/dewormer'
  | 'health/parasites/flea_tick'
  | 'health/parasites/collar'
  | 'health/parasites'
  | 'health/medication'
  | 'health/grooming'
  | 'health/food'
  | 'health/eventos';

export interface CanonicalPetEvent {
  id: string;
  key: string;
  pet_id: string;
  pet_name: string;
  domain: CanonicalEventDomain;
  label: string;
  sublabel?: string;
  icon: string;
  due_date: string;
  diff: number;
  status: CanonicalEventStatus;
  severity: CanonicalEventSeverity;
  action_target: CanonicalEventActionTarget;
  source: 'pet-care-domain';
  source_record_id?: string;
  is_derived: boolean;
}