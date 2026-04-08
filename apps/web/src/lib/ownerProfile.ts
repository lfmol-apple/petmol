/**
 * Owner Profile Management
 * Stores owner information
 */

export interface OwnerProfile {
  owner_id: string;
  name: string;
  phone: string;
  whatsapp?: boolean;
  email?: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  emergency_contact?: {
    name: string;
    phone: string;
    relationship?: string;
  };
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = 'petmol_owner_profile';

export function getOwnerProfile(): OwnerProfile | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch (err) {
    console.error('Failed to get owner profile:', err);
    return null;
  }
}

export function saveOwnerProfile(profile: OwnerProfile): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save owner profile:', err);
  }
}

export function updateOwnerProfile(updates: Partial<OwnerProfile>): void {
  const current = getOwnerProfile();
  if (!current) return;
  
  const updated = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  
  saveOwnerProfile(updated);
}

export function hasCompletedOnboarding(): boolean {
  return getOwnerProfile() !== null;
}
