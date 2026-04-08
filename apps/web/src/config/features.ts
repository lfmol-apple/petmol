/**
 * Feature Flags for PETMOL
 * 
 * Controls which features are enabled/disabled in the app.
 * Allows gradual rollout and hiding incomplete features.
 */

export const FEATURES = {
  /**
   * WALKS/PASSEIO feature
   * 
   * When false: Hides all walk-related UI (cards, menu items, routes)
   * Status: OFF for MVP - focusing on Health + Services + Emergency
   */
  WALKS: false,

  /**
   * PRICE COMPARISON feature
   * 
   * When false: Hides price comparison and shopping features
   * Status: ON - core feature for Brasil and select countries
   */
  PRICES: true,

  /**
   * HEALTH RECORDS feature
   * 
   * When false: Hides health timeline, medical records
   * Status: ON - core MVP feature
   */
  HEALTH: true,

  /**
   * SERVICES SEARCH feature
   * 
   * When false: Hides nearby services (petshops, vets, groomers, etc)
   * Status: ON - core MVP feature
   */
  SERVICES: true,

  /**
   * EMERGENCY 24h VET feature
   * 
   * When false: Hides emergency vet finder
   * Status: ON - core MVP feature
   */
  EMERGENCY: true,
} as const;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature];
}

/**
 * Get all enabled features
 */
export function getEnabledFeatures(): (keyof typeof FEATURES)[] {
  return (Object.keys(FEATURES) as (keyof typeof FEATURES)[]).filter(
    (key) => FEATURES[key]
  );
}
