/**
 * Event Candidate Scoring
 * 
 * Anti-false-positive scoring system
 */

import { EventCandidate, PlaceCategory } from './types';

interface ScoringConfig {
  dwell: {
    min: number; // seconds
    target: number; // seconds for max score
    weight: number;
  };
  accuracy: {
    excellent: number; // meters
    acceptable: number; // meters
    weight: number;
  };
  velocity: {
    stationary: number; // m/s
    slow: number; // m/s
    weight: number;
  };
  anchor_match: {
    weight: number;
  };
}

const DEFAULT_SCORING: ScoringConfig = {
  dwell: {
    min: 90,
    target: 300, // 5 minutes
    weight: 0.4,
  },
  accuracy: {
    excellent: 30,
    acceptable: 100,
    weight: 0.2,
  },
  velocity: {
    stationary: 0.5,
    slow: 2.0,
    weight: 0.2,
  },
  anchor_match: {
    weight: 0.2,
  },
};

export function calculateConfidenceScore(
  candidate: EventCandidate,
  isAnchorMatch: boolean,
  config: ScoringConfig = DEFAULT_SCORING
): number {
  const scores = {
    dwell: calculateDwellScore(candidate.dwell_seconds, config.dwell),
    accuracy: calculateAccuracyScore(candidate.accuracy_meters, config.accuracy),
    velocity: calculateVelocityScore(candidate.velocity_mps, config.velocity),
    anchor: isAnchorMatch ? 100 : 0,
  };

  const totalScore =
    scores.dwell * config.dwell.weight +
    scores.accuracy * config.accuracy.weight +
    scores.velocity * config.velocity.weight +
    scores.anchor * config.anchor_match.weight;

  return Math.min(100, Math.max(0, totalScore));
}

function calculateDwellScore(dwellSeconds: number, config: typeof DEFAULT_SCORING.dwell): number {
  if (dwellSeconds < config.min) return 0;
  if (dwellSeconds >= config.target) return 100;
  
  // Linear interpolation between min and target
  const progress = (dwellSeconds - config.min) / (config.target - config.min);
  return progress * 100;
}

function calculateAccuracyScore(
  accuracyMeters: number | undefined,
  config: typeof DEFAULT_SCORING.accuracy
): number {
  if (!accuracyMeters) return 50; // neutral if no accuracy data
  
  if (accuracyMeters <= config.excellent) return 100;
  if (accuracyMeters >= config.acceptable) return 30;
  
  // Linear interpolation
  const range = config.acceptable - config.excellent;
  const distance = accuracyMeters - config.excellent;
  return 100 - (distance / range) * 70;
}

function calculateVelocityScore(
  velocityMps: number | undefined,
  config: typeof DEFAULT_SCORING.velocity
): number {
  if (!velocityMps) return 50; // neutral if no velocity data
  
  if (velocityMps <= config.stationary) return 100;
  if (velocityMps >= config.slow) return 30;
  
  // Linear interpolation
  const range = config.slow - config.stationary;
  const speed = velocityMps - config.stationary;
  return 100 - (speed / range) * 70;
}

export function shouldAskUser(candidate: EventCandidate, minScore: number = 60): boolean {
  return (
    candidate.state === 'ready_to_ask' &&
    candidate.confidence_score >= minScore
  );
}

export function categorizePlace(types: string[]): PlaceCategory {
  // Google Places types -> our categories
  if (types.includes('veterinary_care')) return 'veterinary_care';
  if (types.includes('pet_store')) return 'pet_store';
  if (types.includes('pet_grooming') || types.includes('beauty_salon')) return 'pet_grooming';
  if (types.includes('dog_park') || types.includes('park')) return 'dog_park';
  if (types.includes('pet_boarding') || types.includes('lodging')) return 'pet_boarding';
  
  return 'other';
}
