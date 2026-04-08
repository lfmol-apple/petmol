/**
 * Place Usage Tracking - Silent shortcuts system
 * Tracks user interactions with places (WhatsApp, Call, Directions)
 * Creates automatic shortcuts based on most used places
 * 
 * Storage: petmol_place_usage_v1
 * No PII - only place identifiers and interaction counts
 */

export interface PlaceUsageRecord {
  place_id?: string;
  partner_slug?: string;
  name: string;
  category: string;
  lat?: number;
  lng?: number;
  address?: string;
  phone?: string;
  counts: {
    whatsapp: number;
    call: number;
    directions: number;
  };
  last_clicked_at: string; // ISO timestamp
}

export type UsageChannel = 'whatsapp' | 'call' | 'directions';

const STORAGE_KEY = 'petmol_place_usage_v1';

/**
 * Generate unique key for a place
 */
function getPlaceKey(place: Partial<PlaceUsageRecord>): string {
  if (place.place_id) return `place_${place.place_id}`;
  if (place.partner_slug) return `partner_${place.partner_slug}`;
  // Fallback: sanitized name
  const safeName = place.name || 'unknown';
  return `name_${safeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

/**
 * Record a place interaction
 */
export function recordPlaceClick(
  place: Partial<PlaceUsageRecord>,
  channel: UsageChannel
): void {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const usage: Record<string, PlaceUsageRecord> = stored ? JSON.parse(stored) : {};

    const key = getPlaceKey(place);
    
    if (!usage[key]) {
      // New place
      usage[key] = {
        place_id: place.place_id,
        partner_slug: place.partner_slug,
        name: place.name || 'Unknown',
        category: place.category || 'other',
        lat: place.lat,
        lng: place.lng,
        address: place.address,
        phone: place.phone,
        counts: { whatsapp: 0, call: 0, directions: 0 },
        last_clicked_at: new Date().toISOString(),
      };
    }

    // Increment count
    usage[key].counts[channel] += 1;
    usage[key].last_clicked_at = new Date().toISOString();

    // Update coordinates/address if provided
    if (place.lat) usage[key].lat = place.lat;
    if (place.lng) usage[key].lng = place.lng;
    if (place.address) usage[key].address = place.address;
    if (place.phone) usage[key].phone = place.phone;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch (error) {
    console.error('Failed to record place click:', error);
  }
}

/**
 * Calculate place score for ranking
 * Score = whatsapp*3 + call*2 + directions*1 + recency_bonus
 */
function calculateScore(record: PlaceUsageRecord): number {
  const { whatsapp, call, directions } = record.counts;
  let score = whatsapp * 3 + call * 2 + directions * 1;

  // Recency bonus
  const lastClicked = new Date(record.last_clicked_at);
  const daysSince = (Date.now() - lastClicked.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince <= 7) {
    score += 2; // Very recent
  } else if (daysSince <= 30) {
    score += 1; // Recent
  }

  return score;
}

/**
 * Get top shortcuts
 */
export function getTopShortcuts(limit: number = 3): PlaceUsageRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const usage: Record<string, PlaceUsageRecord> = JSON.parse(stored);
    const records = Object.values(usage);

    // Filter: at least 1 interaction
    const active = records.filter(r => 
      r.counts.whatsapp + r.counts.call + r.counts.directions > 0
    );

    // Sort by score descending
    active.sort((a, b) => calculateScore(b) - calculateScore(a));

    return active.slice(0, limit);
  } catch (error) {
    console.error('Failed to get shortcuts:', error);
    return [];
  }
}

/**
 * Migrate from old favorites system (one-time)
 */
export function migrateOldFavoritesIfExists(): void {
  if (typeof window === 'undefined') return;

  try {
    // Check if already migrated
    const migrated = localStorage.getItem('petmol_favorites_migrated');
    if (migrated) return;

    // Get old favorites
    const oldFavorites = localStorage.getItem('petmol_favorite_places');
    if (!oldFavorites) {
      localStorage.setItem('petmol_favorites_migrated', 'true');
      return;
    }

    const favorites: Array<{
      place_id: string;
      partner_slug?: string;
      name: string;
      category?: string;
      lat: number;
      lng: number;
      address: string;
      phone?: string;
      saved_at?: string;
    }> = JSON.parse(oldFavorites);
    const usage: Record<string, PlaceUsageRecord> = {};

    // Convert each favorite to usage record with initial score
    favorites.forEach((fav) => {
      const key = getPlaceKey(fav);
      usage[key] = {
        place_id: fav.place_id,
        partner_slug: fav.partner_slug,
        name: fav.name,
        category: fav.category || 'other',
        lat: fav.lat,
        lng: fav.lng,
        address: fav.address,
        phone: fav.phone,
        counts: { whatsapp: 1, call: 0, directions: 0 }, // Give it initial count
        last_clicked_at: fav.saved_at || new Date().toISOString(),
      };
    });

    // Save migrated data
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
    localStorage.setItem('petmol_favorites_migrated', 'true');

    console.log(`✅ Migrated ${favorites.length} favorites to shortcuts`);
  } catch (error) {
    console.error('Failed to migrate favorites:', error);
  }
}

/**
 * Clear all usage data (for debugging)
 */
export function clearPlaceUsage(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get total usage stats
 */
export function getUsageStats(): {
  total_places: number;
  total_interactions: number;
  by_channel: Record<UsageChannel, number>;
} {
  if (typeof window === 'undefined') {
    return { total_places: 0, total_interactions: 0, by_channel: { whatsapp: 0, call: 0, directions: 0 } };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { total_places: 0, total_interactions: 0, by_channel: { whatsapp: 0, call: 0, directions: 0 } };
    }

    const usage: Record<string, PlaceUsageRecord> = JSON.parse(stored);
    const records = Object.values(usage);

    const stats = {
      total_places: records.length,
      total_interactions: 0,
      by_channel: { whatsapp: 0, call: 0, directions: 0 } as Record<UsageChannel, number>,
    };

    records.forEach(r => {
      stats.by_channel.whatsapp += r.counts.whatsapp;
      stats.by_channel.call += r.counts.call;
      stats.by_channel.directions += r.counts.directions;
      stats.total_interactions += r.counts.whatsapp + r.counts.call + r.counts.directions;
    });

    return stats;
  } catch (error) {
    console.error('Failed to get stats:', error);
    return { total_places: 0, total_interactions: 0, by_channel: { whatsapp: 0, call: 0, directions: 0 } };
  }
}
