/**
 * Low-level analytics transport.
 *
 * PETMOL V1 product metrics should go through '@/lib/v1Metrics'.
 * This file remains a thin storage/transport layer.
 */

type EventName =
  | 'view_emergency'
  | 'search_emergency'
  | 'click_call'
  | 'click_whatsapp'
  | 'click_directions'
  | 'view_services'
  | 'search_services'
  | 'click_pet_service'
  | 'view_buy'
  | 'search_buy'
  | 'open_offer'
  | 'view_rg'
  | 'generate_rg'
  | 'download_rg'
  | 'share_rg'
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

interface TrackEvent {
  name: EventName;
  properties: Record<string, unknown>;
  timestamp: number;
}

const EVENTS_KEY = 'petmol_events';
const MAX_EVENTS = 1000;

// Track event
export function track(name: EventName, properties: Record<string, unknown> = {}): void {
  try {
    const event: TrackEvent = {
      name,
      properties,
      timestamp: Date.now(),
    };

    // Store in localStorage
    const stored = localStorage.getItem(EVENTS_KEY);
    const events: TrackEvent[] = stored ? JSON.parse(stored) : [];
    events.push(event);

    // Keep only last MAX_EVENTS
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }

    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Track]', name, properties);
    }

    // Send critical revenue events with sendBeacon
    const revenueEvents: EventName[] = ['open_offer', 'click_call', 'click_directions', 'partner_clicked'];
    if (revenueEvents.includes(name) && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(event)], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/track', blob);
    }
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}

// Get all events
export function getEvents(): TrackEvent[] {
  try {
    const stored = localStorage.getItem(EVENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Clear events
export function clearEvents(): void {
  try {
    localStorage.removeItem(EVENTS_KEY);
  } catch (error) {
    console.error('Failed to clear events:', error);
  }
}

// Initialize global track function
if (typeof window !== 'undefined') {
  (window as { track: typeof track }).track = track;
}
