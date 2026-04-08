/**
 * Health Sync - IndexedDB + Supabase
 * 
 * Sincronização de dados de saúde com cursor-based pagination
 * - Offline-first com IndexedDB
 * - Sync incremental com Supabase
 * - Offline queue com retry
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Types
export interface PetHealthProfile {
  pet_id: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  birth_date?: string;
  weight_history: WeightRecord[];
  medical_history: MedicalRecord[];
  vaccinations: VaccinationRecord[];
  medications: MedicationRecord[];
  
  // Sync metadata
  created_at: string;
  updated_at: string;
  synced_at?: string;
  sync_cursor?: string; // Para cursor-based sync
}

export interface WeightRecord {
  id: string;
  weight: number;
  weight_unit: 'kg' | 'lb';
  measured_at: string;
  notes?: string;
  
  // Sync
  created_at: string;
  synced_at?: string;
}

export interface MedicalRecord {
  id: string;
  type: 'exam' | 'diagnosis' | 'procedure' | 'visit' | 'other';
  title: string;
  description?: string;
  date: string;
  attachments: string[]; // S3 keys
  tags: string[];
  
  // Link to place/vet
  place_id?: string;
  place_name?: string;
  vet_name?: string;
  
  // Sync
  created_at: string;
  updated_at: string;
  synced_at?: string;
}

export interface VaccinationRecord {
  id: string;
  vaccine_name: string;
  date: string;
  next_dose?: string;
  batch_number?: string;
  vet_name?: string;
  place_id?: string;
  
  // Sync
  created_at: string;
  synced_at?: string;
}

export interface MedicationRecord {
  id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  start_date: string;
  end_date?: string;
  notes?: string;
  
  // Sync
  created_at: string;
  updated_at: string;
  synced_at?: string;
}

export interface OfflineAction {
  id: string;
  action_type: 'create' | 'update' | 'delete';
  entity_type: 'health_profile' | 'weight_record' | 'medical_record' | 'vaccination' | 'medication';
  entity_id: string;
  payload: unknown;
  created_at: string;
  retry_count: number;
  last_error?: string;
}

// IndexedDB Schema
interface HealthSyncDB extends DBSchema {
  health_profiles: {
    key: string; // pet_id
    value: PetHealthProfile;
    indexes: { 'by-updated': string };
  };
  offline_queue: {
    key: string; // action id
    value: OfflineAction;
    indexes: { 'by-created': string };
  };
  sync_metadata: {
    key: 'health_sync_metadata';
    value: {
      last_full_sync?: string;
      last_cursor?: string;
      last_error?: string;
      pending_uploads: number;
    };
  };
}

const DB_NAME = 'petmol_health_sync';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<HealthSyncDB> | null = null;

async function getDB(): Promise<IDBPDatabase<HealthSyncDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<HealthSyncDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Health profiles
      if (!db.objectStoreNames.contains('health_profiles')) {
        const profileStore = db.createObjectStore('health_profiles', { keyPath: 'pet_id' });
        profileStore.createIndex('by-updated', 'updated_at');
      }

      // Offline queue
      if (!db.objectStoreNames.contains('offline_queue')) {
        const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
        queueStore.createIndex('by-created', 'created_at');
      }

      // Sync metadata
      if (!db.objectStoreNames.contains('sync_metadata')) {
        db.createObjectStore('sync_metadata');
      }
    },
  });

  return dbInstance;
}

// ========================================
// Health Profile Operations (Local)
// ========================================

export async function createHealthProfile(
  petId: string,
  name: string,
  species: 'dog' | 'cat' | 'other',
  additionalData?: Partial<PetHealthProfile>
): Promise<PetHealthProfile> {
  const now = new Date().toISOString();
  
  const profile: PetHealthProfile = {
    pet_id: petId,
    name,
    species,
    weight_history: [],
    medical_history: [],
    vaccinations: [],
    medications: [],
    created_at: now,
    updated_at: now,
    ...additionalData,
  };

  const db = await getDB();
  await db.put('health_profiles', profile);

  // Queue for sync
  await queueAction('create', 'health_profile', petId, profile);

  return profile;
}

export async function getHealthProfile(petId: string): Promise<PetHealthProfile | undefined> {
  const db = await getDB();
  return db.get('health_profiles', petId);
}

export async function getAllHealthProfiles(): Promise<PetHealthProfile[]> {
  const db = await getDB();
  return db.getAll('health_profiles');
}

export async function updateHealthProfile(
  petId: string,
  updates: Partial<PetHealthProfile>
): Promise<void> {
  const db = await getDB();
  const profile = await db.get('health_profiles', petId);
  
  if (!profile) throw new Error(`Health profile not found: ${petId}`);

  const updated: PetHealthProfile = {
    ...profile,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  await db.put('health_profiles', updated);

  // Queue for sync
  await queueAction('update', 'health_profile', petId, updated);
}

export async function deleteHealthProfile(petId: string): Promise<void> {
  const db = await getDB();
  await db.delete('health_profiles', petId);

  // Queue for sync
  await queueAction('delete', 'health_profile', petId, { pet_id: petId });
}

// ========================================
// Weight Records
// ========================================

export async function addWeightRecord(
  petId: string,
  weight: number,
  weightUnit: 'kg' | 'lb',
  measuredAt?: string,
  notes?: string
): Promise<WeightRecord> {
  const profile = await getHealthProfile(petId);
  if (!profile) throw new Error(`Health profile not found: ${petId}`);

  const record: WeightRecord = {
    id: `weight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    weight,
    weight_unit: weightUnit,
    measured_at: measuredAt || new Date().toISOString(),
    notes,
    created_at: new Date().toISOString(),
  };

  profile.weight_history.push(record);
  profile.updated_at = new Date().toISOString();

  const db = await getDB();
  await db.put('health_profiles', profile);

  // Queue for sync
  await queueAction('create', 'weight_record', record.id, { pet_id: petId, ...record });

  return record;
}

// ========================================
// Medical Records
// ========================================

export async function addMedicalRecord(
  petId: string,
  record: Omit<MedicalRecord, 'id' | 'created_at' | 'updated_at' | 'synced_at'>
): Promise<MedicalRecord> {
  const profile = await getHealthProfile(petId);
  if (!profile) throw new Error(`Health profile not found: ${petId}`);

  const now = new Date().toISOString();
  const fullRecord: MedicalRecord = {
    ...record,
    id: `medical_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    created_at: now,
    updated_at: now,
  };

  profile.medical_history.push(fullRecord);
  profile.updated_at = now;

  const db = await getDB();
  await db.put('health_profiles', profile);

  // Queue for sync
  await queueAction('create', 'medical_record', fullRecord.id, { pet_id: petId, ...fullRecord });

  return fullRecord;
}

// ========================================
// Offline Queue
// ========================================

async function queueAction(
  actionType: OfflineAction['action_type'],
  entityType: OfflineAction['entity_type'],
  entityId: string,
  payload: unknown
): Promise<void> {
  const action: OfflineAction = {
    id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };

  const db = await getDB();
  await db.put('offline_queue', action);
  
  // Update pending count
  const metadata = await db.get('sync_metadata', 'health_sync_metadata') || {
    pending_uploads: 0,
  };
  metadata.pending_uploads = (await db.count('offline_queue'));
  await db.put('sync_metadata', metadata, 'health_sync_metadata');
}

export async function getOfflineQueue(): Promise<OfflineAction[]> {
  const db = await getDB();
  return db.getAllFromIndex('offline_queue', 'by-created');
}

export async function removeFromQueue(actionId: string): Promise<void> {
  const db = await getDB();
  await db.delete('offline_queue', actionId);
  
  // Update pending count
  const metadata = await db.get('sync_metadata', 'health_sync_metadata') || {
    pending_uploads: 0,
  };
  metadata.pending_uploads = (await db.count('offline_queue'));
  await db.put('sync_metadata', metadata, 'health_sync_metadata');
}

export async function markActionFailed(actionId: string, error: string): Promise<void> {
  const db = await getDB();
  const action = await db.get('offline_queue', actionId);
  
  if (action) {
    action.retry_count++;
    action.last_error = error;
    await db.put('offline_queue', action);
  }
}

// ========================================
// Sync Metadata
// ========================================

export async function getSyncMetadata() {
  const db = await getDB();
  return db.get('sync_metadata', 'health_sync_metadata') || {
    pending_uploads: 0,
  };
}

export async function updateSyncMetadata(updates: {
  last_full_sync?: string;
  last_cursor?: string;
  last_error?: string;
  pending_uploads?: number;
}): Promise<void> {
  const db = await getDB();
  const current = await getSyncMetadata() || { pending_uploads: 0 };
  await db.put('sync_metadata', { ...current, ...updates }, 'health_sync_metadata');
}
