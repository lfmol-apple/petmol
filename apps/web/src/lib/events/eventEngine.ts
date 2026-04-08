/**
 * Event Engine Core
 * 
 * Sistema proativo de detecção de eventos
 * Fluxo: candidate -> confirmation -> event
 */

import { v4 as uuidv4 } from 'uuid';
import {
  EventCandidate,
  DetectionSession,
  EventEngineConfig,
  EventConfirmation,
  PlaceCategory,
} from './types';
import {
  saveCandidate,
  saveSession,
  getCandidateByPlace,
  getCurrentSession,
  getConfig,
  isPlaceIgnored,
  getAllActiveCandidates,
  cleanupExpired,
} from './storage';
import { calculateConfidenceScore, categorizePlace, shouldAskUser } from './scoring';
import { getNearbyAnchors, isAnchorAvailable } from '../places/anchorsStore';

interface GeolocationData {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number; // m/s
  timestamp: number;
}

class EventEngine {
  private currentSession: DetectionSession | null = null;
  private config: EventEngineConfig | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private listeners: Array<(candidate: EventCandidate) => void> = [];
  
  async init(): Promise<void> {
    this.config = await getConfig();
    this.currentSession = await getCurrentSession() || null;
    
    // Cleanup old candidates
    await cleanupExpired();
    
    // Start monitoring loop
    this.startMonitoring();
  }

  async startSession(): Promise<string> {
    const session: DetectionSession = {
      session_id: uuidv4(),
      started_at: new Date().toISOString(),
      last_update: new Date().toISOString(),
      active_candidates: [],
    };
    
    await saveSession(session);
    this.currentSession = session;
    
    return session.session_id;
  }

  async processLocation(location: GeolocationData, nearbyPlaces: Array<{
    place_id: string;
    name: string;
    types: string[];
    geometry: { location: { lat: number; lng: number } };
  }>): Promise<void> {
    if (!this.currentSession || !this.config) {
      throw new Error('EventEngine not initialized');
    }

    // Filter pet-related places
    const petPlaces = nearbyPlaces.filter(place => 
      place.types.some(t => 
        t.includes('veterinary') ||
        t.includes('pet') ||
        t.includes('dog_park')
      )
    );

    for (const place of petPlaces) {
      await this.processPlace(location, place);
    }

    // Update session
    this.currentSession.last_update = new Date().toISOString();
    await saveSession(this.currentSession);
  }

  private async processPlace(
    location: GeolocationData,
    place: {
      place_id: string;
      name: string;
      types: string[];
      geometry: { location: { lat: number; lng: number } };
    }
  ): Promise<void> {
    if (!this.config) return;

    // Check if place is ignored
    if (await isPlaceIgnored(place.place_id)) return;

    // Check if we're in quiet hours
    if (this.isQuietHours()) return;

    // Get or create candidate
    let candidate = await getCandidateByPlace(place.place_id);
    const now = new Date().toISOString();

    if (!candidate) {
      // Check if place is in anchors
      const isKnownAnchor = await isAnchorAvailable(place.place_id);

      // Create new candidate
      candidate = {
        id: uuidv4(),
        place_id: place.place_id,
        place_name: place.name,
        category: categorizePlace(place.types),
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
        radius: 100, // meters
        entered_at: now,
        last_update: now,
        dwell_seconds: 0,
        accuracy_meters: location.accuracy,
        velocity_mps: location.speed,
        confidence_score: 0,
        scoring_factors: {
          dwell_score: 0,
          accuracy_score: 0,
          velocity_score: 0,
          anchor_match: isKnownAnchor,
        },
        state: 'monitoring',
      };
    } else {
      // Update existing candidate
      const enteredAt = new Date(candidate.entered_at);
      const dwellMs = Date.now() - enteredAt.getTime();
      candidate.dwell_seconds = Math.floor(dwellMs / 1000);
      candidate.last_update = now;
      candidate.accuracy_meters = location.accuracy;
      candidate.velocity_mps = location.speed;

      // Check if place is in anchors (might have been added since candidate creation)
      const isKnownAnchor = await isAnchorAvailable(place.place_id);
      candidate.scoring_factors.anchor_match = isKnownAnchor;

      // Recalculate confidence score
      candidate.confidence_score = calculateConfidenceScore(
        candidate,
        isKnownAnchor
      );

      candidate.scoring_factors.dwell_score = candidate.confidence_score;
      candidate.scoring_factors.accuracy_score = location.accuracy ? 100 - Math.min(100, location.accuracy) : 50;
      candidate.scoring_factors.velocity_score = location.speed ? Math.max(0, 100 - location.speed * 20) : 50;

      // State transitions
      if (candidate.state === 'monitoring') {
        if (candidate.dwell_seconds >= this.config.min_dwell_seconds) {
          if (candidate.confidence_score >= this.config.min_confidence_score) {
            candidate.state = 'ready_to_ask';
            this.notifyListeners(candidate);
          }
        }
      }
    }

    await saveCandidate(candidate);
  }

  async confirmEvent(confirmation: EventConfirmation): Promise<void> {
    const candidate = await getCandidateByPlace(confirmation.candidate_id);
    
    if (!candidate) return;

    if (confirmation.confirmed) {
      candidate.state = 'confirmed';
      candidate.resolved_at = confirmation.confirmed_at;
      
      // TODO: Create actual health event in Supabase
      console.log('Event confirmed:', {
        place: candidate.place_name,
        pets: confirmation.pet_ids,
        type: confirmation.event_type,
      });
    } else {
      candidate.state = 'ignored';
      candidate.resolved_at = confirmation.confirmed_at;
    }

    await saveCandidate(candidate);
  }

  onCandidateReady(callback: (candidate: EventCandidate) => void): void {
    this.listeners.push(callback);
  }

  private notifyListeners(candidate: EventCandidate): void {
    for (const listener of this.listeners) {
      listener(candidate);
    }
  }

  private startMonitoring(): void {
    // Check candidates every 5 seconds
    this.monitoringInterval = setInterval(async () => {
      const candidates = await getAllActiveCandidates();
      
      for (const candidate of candidates) {
        if (shouldAskUser(candidate, this.config?.min_confidence_score)) {
          if (candidate.state !== 'asked') {
            candidate.state = 'asked';
            candidate.asked_at = new Date().toISOString();
            await saveCandidate(candidate);
            this.notifyListeners(candidate);
          }
        }
      }
    }, 5000);
  }

  private isQuietHours(): boolean {
    if (!this.config?.quiet_hours.enabled) return false;

    const now = new Date();
    const hour = now.getHours();
    const { start_hour, end_hour } = this.config.quiet_hours;

    if (start_hour < end_hour) {
      return hour >= start_hour && hour < end_hour;
    } else {
      // Overnight quiet hours (e.g., 22:00 - 08:00)
      return hour >= start_hour || hour < end_hour;
    }
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

// Singleton instance
let engineInstance: EventEngine | null = null;

export function getEventEngine(): EventEngine {
  if (!engineInstance) {
    engineInstance = new EventEngine();
  }
  return engineInstance;
}

export { EventEngine };
