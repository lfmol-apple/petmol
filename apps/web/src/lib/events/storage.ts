/**
 * Event Engine Storage
 * 
 * Local cache (IndexedDB) para candidatos e sessões
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { EventCandidate, DetectionSession, IgnoreRule, EventEngineConfig } from './types';

interface EventEngineDB extends DBSchema {
  candidates: {
    key: string;
    value: EventCandidate;
    indexes: { 'by-state': string; 'by-place': string };
  };
  sessions: {
    key: string;
    value: DetectionSession;
  };
  ignore_rules: {
    key: string;
    value: IgnoreRule;
    indexes: { 'by-place': string; 'by-category': string };
  };
  config: {
    key: 'event_engine_config';
    value: EventEngineConfig;
  };
}

const DB_NAME = 'petmol_event_engine';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<EventEngineDB> | null = null;

async function getDB(): Promise<IDBPDatabase<EventEngineDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<EventEngineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Candidates store
      if (!db.objectStoreNames.contains('candidates')) {
        const candidateStore = db.createObjectStore('candidates', { keyPath: 'id' });
        candidateStore.createIndex('by-state', 'state');
        candidateStore.createIndex('by-place', 'place_id');
      }

      // Sessions store
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'session_id' });
      }

      // Ignore rules store
      if (!db.objectStoreNames.contains('ignore_rules')) {
        const ignoreStore = db.createObjectStore('ignore_rules', { keyPath: 'place_id' });
        ignoreStore.createIndex('by-place', 'place_id');
        ignoreStore.createIndex('by-category', 'category');
      }

      // Config store
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config');
      }
    },
  });

  return dbInstance;
}

// Candidates
export async function saveCandidate(candidate: EventCandidate): Promise<void> {
  const db = await getDB();
  await db.put('candidates', candidate);
}

export async function getCandidate(id: string): Promise<EventCandidate | undefined> {
  const db = await getDB();
  return db.get('candidates', id);
}

export async function getCandidatesByState(state: EventCandidate['state']): Promise<EventCandidate[]> {
  const db = await getDB();
  return db.getAllFromIndex('candidates', 'by-state', state);
}

export async function getCandidateByPlace(place_id: string): Promise<EventCandidate | undefined> {
  const db = await getDB();
  const candidates = await db.getAllFromIndex('candidates', 'by-place', place_id);
  return candidates.find(c => c.state !== 'expired' && c.state !== 'confirmed' && c.state !== 'ignored');
}

export async function deleteCandidate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('candidates', id);
}

export async function getAllActiveCandidates(): Promise<EventCandidate[]> {
  const db = await getDB();
  const all = await db.getAll('candidates');
  return all.filter(c => c.state !== 'expired' && c.state !== 'confirmed' && c.state !== 'ignored');
}

// Sessions
export async function saveSession(session: DetectionSession): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function getCurrentSession(): Promise<DetectionSession | undefined> {
  const db = await getDB();
  const sessions = await db.getAll('sessions');
  return sessions.sort((a, b) => 
    new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )[0];
}

// Ignore rules
export async function addIgnoreRule(rule: IgnoreRule): Promise<void> {
  const db = await getDB();
  const key = rule.place_id || `category_${rule.category}_${Date.now()}`;
  await db.put('ignore_rules', { ...rule, place_id: key });
}

export async function isPlaceIgnored(place_id: string): Promise<boolean> {
  const db = await getDB();
  const rule = await db.get('ignore_rules', place_id);
  if (!rule) return false;
  
  // Check expiration
  if (rule.expires_at && new Date(rule.expires_at) < new Date()) {
    await db.delete('ignore_rules', place_id);
    return false;
  }
  
  return true;
}

export async function removeIgnoreRule(place_id: string): Promise<void> {
  const db = await getDB();
  await db.delete('ignore_rules', place_id);
}

// Config
export async function getConfig(): Promise<EventEngineConfig> {
  const db = await getDB();
  const config = await db.get('config', 'event_engine_config');
  
  if (config) return config;
  
  // Default config
  const defaultConfig: EventEngineConfig = {
    min_dwell_seconds: 90,
    min_confidence_score: 60,
    exit_confirm_delay_ms: 3000,
    place_cooldown_days: 7,
    global_pause_hours: 24,
    quiet_hours: {
      enabled: false,
      start_hour: 22,
      end_hour: 8,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    anchor_refresh_interval_ms: 15 * 60 * 1000,
    nearby_anchors_radius_m: 5000,
  };
  
  await db.put('config', defaultConfig, 'event_engine_config');
  return defaultConfig;
}

export async function updateConfig(config: Partial<EventEngineConfig>): Promise<void> {
  const db = await getDB();
  const current = await getConfig();
  await db.put('config', { ...current, ...config }, 'event_engine_config');
}

// Cleanup expired candidates
export async function cleanupExpired(): Promise<void> {
  const db = await getDB();
  const all = await db.getAll('candidates');
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  for (const candidate of all) {
    const age = now.getTime() - new Date(candidate.entered_at).getTime();
    
    // Remove candidates older than 7 days
    if (age > 7 * DAY_MS) {
      await db.delete('candidates', candidate.id);
    }
  }
}
