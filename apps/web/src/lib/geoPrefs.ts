/**
 * Geographic Preferences - Radius and Unit (KM/MI)
 * Automatic detection based on country + manual override
 * 
 * Storage keys:
 * - petmol_unit: "km" | "mi"
 * - petmol_radius_emergency: number
 * - petmol_radius_services: number
 */

export type DistanceUnit = 'km' | 'mi';

export interface RadiusPrefs {
  emergency: number; // in selected unit
  services: number;  // in selected unit
}

// Countries that use miles
const MILE_COUNTRIES = new Set(['US', 'LR', 'MM']);

// Default radius values
const DEFAULTS = {
  km: {
    emergency: 5,
    services: 10,
  },
  mi: {
    emergency: 3,
    services: 6,
  },
};

/**
 * Get default unit based on country
 */
export function getDefaultUnit(country: string): DistanceUnit {
  return MILE_COUNTRIES.has(country.toUpperCase()) ? 'mi' : 'km';
}

/**
 * Get current unit (with fallback to country-based default)
 */
export function getCurrentUnit(country: string): DistanceUnit {
  if (typeof window === 'undefined') return getDefaultUnit(country);

  try {
    const stored = localStorage.getItem('petmol_unit');
    if (stored && (stored === 'km' || stored === 'mi')) {
      return stored;
    }
  } catch (e) {
    console.error('Failed to get unit:', e);
  }

  return getDefaultUnit(country);
}

/**
 * Set unit preference
 */
export function setUnit(unit: DistanceUnit): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('petmol_unit', unit);
  } catch (e) {
    console.error('Failed to set unit:', e);
  }
}

/**
 * Get radius preferences
 */
export function getRadiusPrefs(country: string): RadiusPrefs {
  if (typeof window === 'undefined') {
    const unit = getDefaultUnit(country);
    return DEFAULTS[unit];
  }

  try {
    const unit = getCurrentUnit(country);
    const defaults = DEFAULTS[unit];

    const emergencyStored = localStorage.getItem('petmol_radius_emergency');
    const servicesStored = localStorage.getItem('petmol_radius_services');

    return {
      emergency: emergencyStored ? parseFloat(emergencyStored) : defaults.emergency,
      services: servicesStored ? parseFloat(servicesStored) : defaults.services,
    };
  } catch (e) {
    console.error('Failed to get radius prefs:', e);
    const unit = getDefaultUnit(country);
    return DEFAULTS[unit];
  }
}

/**
 * Set radius for a context
 */
export function setRadius(context: 'emergency' | 'services', value: number): void {
  if (typeof window === 'undefined') return;

  try {
    const key = context === 'emergency' ? 'petmol_radius_emergency' : 'petmol_radius_services';
    localStorage.setItem(key, String(value));
  } catch (e) {
    console.error('Failed to set radius:', e);
  }
}

/**
 * Convert between units
 */
export function convertDistance(value: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return value;
  
  if (from === 'km' && to === 'mi') {
    return value * 0.621371; // km to miles
  }
  
  if (from === 'mi' && to === 'km') {
    return value * 1.60934; // miles to km
  }
  
  return value;
}

/**
 * Convert radius to meters (always for API calls)
 */
export function radiusToMeters(value: number, unit: DistanceUnit): number {
  if (unit === 'km') {
    return Math.round(value * 1000);
  } else {
    return Math.round(value * 1609.34); // miles to meters
  }
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (unit === 'km') {
    const km = meters / 1000;
    if (km < 1) {
      return `${Math.round(meters)}m`;
    }
    return `${km.toFixed(1)} km`;
  } else {
    const miles = meters / 1609.34;
    if (miles < 0.1) {
      const feet = Math.round(meters * 3.28084);
      return `${feet} ft`;
    }
    return `${miles.toFixed(1)} mi`;
  }
}

/**
 * Get preset radius options for slider
 */
export function getRadiusPresets(context: 'emergency' | 'services', unit: DistanceUnit): number[] {
  if (context === 'emergency') {
    return unit === 'km' ? [3, 5, 10] : [2, 3, 6];
  } else {
    return unit === 'km' ? [5, 10, 20] : [3, 6, 12];
  }
}

/**
 * Get label for radius preset
 */
export function getRadiusLabel(value: number, unit: DistanceUnit): string {
  return `${value} ${unit}`;
}
