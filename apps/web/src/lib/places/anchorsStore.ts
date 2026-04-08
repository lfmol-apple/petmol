/**
 * Places Anchors System
 * 
 * Armazena lugares visitados/clicados para enriquecer detecção
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PlaceAnchor, PlaceCategory } from '../events/types';

interface AnchorsDB extends DBSchema {
  anchors: {
    key: string;
    value: PlaceAnchor;
    indexes: { 'by-category': PlaceCategory };
  };
}

const DB_NAME = 'petmol_place_anchors';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<AnchorsDB> | null = null;

async function getDB(): Promise<IDBPDatabase<AnchorsDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AnchorsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('anchors')) {
        const anchorStore = db.createObjectStore('anchors', { keyPath: 'place_id' });
        anchorStore.createIndex('by-category', 'category');
      }
    },
  });

  return dbInstance;
}

export async function addAnchor(anchor: Omit<PlaceAnchor, 'visit_count' | 'first_seen_at' | 'last_seen_at'>): Promise<void> {
  const db = await getDB();
  
  const existing = await db.get('anchors', anchor.place_id);
  
  if (existing) {
    // Update existing anchor
    await db.put('anchors', {
      ...existing,
      last_seen_at: new Date().toISOString(),
      last_action_at: anchor.last_action_at || existing.last_action_at,
      visit_count: existing.visit_count + 1,
    });
  } else {
    // Create new anchor
    await db.put('anchors', {
      ...anchor,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      visit_count: 1,
    } as PlaceAnchor);
  }
}

export async function getAnchor(place_id: string): Promise<PlaceAnchor | undefined> {
  const db = await getDB();
  return db.get('anchors', place_id);
}

export async function getAllAnchors(): Promise<PlaceAnchor[]> {
  const db = await getDB();
  return db.getAll('anchors');
}

export async function getAnchorsByCategory(category: PlaceCategory): Promise<PlaceAnchor[]> {
  const db = await getDB();
  return db.getAllFromIndex('anchors', 'by-category', category);
}

export async function getNearbyAnchors(lat: number, lng: number, radiusMeters: number): Promise<PlaceAnchor[]> {
  const allAnchors = await getAllAnchors();
  
  return allAnchors.filter(anchor => {
    const distance = calculateDistance(lat, lng, anchor.lat, anchor.lng);
    return distance <= radiusMeters && !anchor.ignored;
  });
}

export async function updateAnchorAction(place_id: string): Promise<void> {
  const db = await getDB();
  const anchor = await db.get('anchors', place_id);
  
  if (anchor) {
    await db.put('anchors', {
      ...anchor,
      last_action_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
  }
}

export async function ignoreAnchor(place_id: string, cooldownUntil?: string): Promise<void> {
  const db = await getDB();
  const anchor = await db.get('anchors', place_id);
  
  if (anchor) {
    await db.put('anchors', {
      ...anchor,
      ignored: true,
      cooldown_until: cooldownUntil,
    });
  }
}

export async function unignoreAnchor(place_id: string): Promise<void> {
  const db = await getDB();
  const anchor = await db.get('anchors', place_id);
  
  if (anchor) {
    await db.put('anchors', {
      ...anchor,
      ignored: false,
      cooldown_until: undefined,
    });
  }
}

export async function isAnchorAvailable(place_id: string): Promise<boolean> {
  const anchor = await getAnchor(place_id);
  if (!anchor || anchor.ignored) return false;
  
  if (anchor.cooldown_until) {
    const now = new Date();
    const cooldownEnd = new Date(anchor.cooldown_until);
    if (now < cooldownEnd) return false;
    
    // Cooldown expired, unignore
    await unignoreAnchor(place_id);
  }
  
  return true;
}

// Haversine distance formula
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export { calculateDistance };
