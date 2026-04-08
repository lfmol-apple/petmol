/**
 * Event Engine Types
 * 
 * Sistema proativo de detecção de eventos (visitas a estabelecimentos)
 * Fluxo: candidate -> confirmation -> event
 */

export type EventType = 'vet_visit' | 'service_visit' | 'walk' | 'custom';
export type PlaceCategory = 'veterinary_care' | 'pet_store' | 'pet_grooming' | 'dog_park' | 'pet_boarding' | 'other';

export interface EventCandidate {
  id: string;
  place_id: string;
  place_name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  radius: number; // meters
  
  // Detection metadata
  entered_at: string; // ISO timestamp
  last_update: string;
  dwell_seconds: number;
  accuracy_meters?: number;
  velocity_mps?: number; // meters per second
  
  // Scoring
  confidence_score: number; // 0-100
  scoring_factors: {
    dwell_score: number;
    accuracy_score: number;
    velocity_score: number;
    anchor_match: boolean;
  };
  
  // State
  state: 'monitoring' | 'ready_to_ask' | 'asked' | 'confirmed' | 'ignored' | 'expired';
  asked_at?: string;
  resolved_at?: string;
}

export interface EventConfirmation {
  candidate_id: string;
  confirmed: boolean;
  event_type?: EventType;
  pet_ids: string[]; // Multi-pet support
  notes?: string;
  attachments?: string[]; // File paths/URIs
  confirmed_at: string;
}

export interface PlaceAnchor {
  place_id: string;
  name: string;
  types: string[];
  category: PlaceCategory;
  lat: number;
  lng: number;
  radius: number; // detection radius in meters
  
  // Tracking
  first_seen_at: string;
  last_seen_at: string;
  last_action_at?: string; // click/call/directions
  visit_count: number;
  
  // Settings
  ignored: boolean;
  cooldown_until?: string; // ISO timestamp
}

export interface IgnoreRule {
  place_id?: string; // specific place
  category?: PlaceCategory; // entire category
  created_at: string;
  expires_at?: string; // optional expiration
}

export interface QuietHours {
  enabled: boolean;
  start_hour: number; // 0-23
  end_hour: number; // 0-23
  timezone: string;
}

export interface EventEngineConfig {
  // Detection thresholds
  min_dwell_seconds: number; // default: 90
  min_confidence_score: number; // default: 60
  exit_confirm_delay_ms: number; // delay after exit before asking, default: 3000
  
  // Spam prevention
  place_cooldown_days: number; // default: 7
  global_pause_hours: number; // when user clicks "pause", default: 24
  
  // Quiet hours
  quiet_hours: QuietHours;
  
  // Multi-pet
  default_pet_id?: string; // if not specified, ask user
  
  // Anchors
  anchor_refresh_interval_ms: number; // default: 15 * 60 * 1000 (15 min)
  nearby_anchors_radius_m: number; // default: 5000
}

export interface DetectionSession {
  session_id: string;
  started_at: string;
  last_update: string;
  active_candidates: EventCandidate[];
}
