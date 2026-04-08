/**
 * PETMOL - Sistema Híbrido de Dados
 * Offline-first com sincronização opcional
 * 
 * Baseado nos reviews: "Funciona sem internet" + "Nunca reter dados"
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  Pet,
  Vaccine,
  Medication,
  MedicalRecord,
  WeightRecord,
  DocumentAttachment,
  LocalCache,
  PendingAction,
  ExportData,
  UserSettings
} from './types';
import { localTodayISO } from '@/lib/localDate';

// ========================================
// IndexedDB Schema
// ========================================
interface PetMolDB extends DBSchema {
  pets: {
    key: string;
    value: Pet;
    indexes: { 'by-tutor': string };
  };
  vaccines: {
    key: string;
    value: Vaccine;
    indexes: { 'by-pet': string; 'by-next-due': string };
  };
  medications: {
    key: string;
    value: Medication;
    indexes: { 'by-pet': string; 'by-active': string }; // Changed from boolean to string
  };
  medical_records: {
    key: string;
    value: MedicalRecord;
    indexes: { 'by-pet': string; 'by-date': string };
  };
  weight_records: {
    key: string;
    value: WeightRecord;
    indexes: { 'by-pet': string; 'by-date': string };
  };
  documents: {
    key: string;
    value: DocumentAttachment;
  };
  sync_queue: {
    key: string;
    value: PendingAction;
  };
  settings: {
    key: string;
    value: UserSettings;
  };
}

const DB_NAME = 'petmol_hybrid';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<PetMolDB> | null = null;

// ========================================
// Database Setup
// ========================================
async function getDB(): Promise<IDBPDatabase<PetMolDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<PetMolDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Pets
      const petsStore = db.createObjectStore('pets', { keyPath: 'id' });
      petsStore.createIndex('by-tutor', 'tutor_id');

      // Vaccines
      const vaccinesStore = db.createObjectStore('vaccines', { keyPath: 'id' });
      vaccinesStore.createIndex('by-pet', 'pet_id');
      vaccinesStore.createIndex('by-next-due', 'next_due');

      // Medications
      const medsStore = db.createObjectStore('medications', { keyPath: 'id' });
      medsStore.createIndex('by-pet', 'pet_id');
      medsStore.createIndex('by-active', 'active');

      // Medical Records
      const recordsStore = db.createObjectStore('medical_records', { keyPath: 'id' });
      recordsStore.createIndex('by-pet', 'pet_id');
      recordsStore.createIndex('by-date', 'date');

      // Weight Records
      const weightStore = db.createObjectStore('weight_records', { keyPath: 'id' });
      weightStore.createIndex('by-pet', 'pet_id');
      weightStore.createIndex('by-date', 'measured_at');

      // Documents
      db.createObjectStore('documents', { keyPath: 'id' });

      // Sync Queue
      db.createObjectStore('sync_queue', { keyPath: 'id' });

      // Settings
      db.createObjectStore('settings', { keyPath: 'key' });
    },
  });

  return dbInstance;
}

// ========================================
// Utility Functions
// ========================================
function generateId(): string {
  return `petmol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

// ========================================
// Pet Management
// ========================================
export async function createPet(petData: Omit<Pet, 'id' | 'created_at' | 'updated_at'>): Promise<Pet> {
  const db = await getDB();
  const now = getCurrentTimestamp();
  
  const pet: Pet = {
    id: generateId(),
    ...petData,
    created_at: now,
    updated_at: now,
  };

  await db.put('pets', pet);
  await queueAction('create', 'pet', pet.id, pet);

  return pet;
}

export async function getAllPets(tutorId?: string): Promise<Pet[]> {
  const db = await getDB();
  
  if (tutorId) {
    return db.getAllFromIndex('pets', 'by-tutor', tutorId);
  }
  
  return db.getAll('pets');
}

export async function getPet(id: string): Promise<Pet | undefined> {
  const db = await getDB();
  return db.get('pets', id);
}

export async function updatePet(id: string, updates: Partial<Pet>): Promise<void> {
  const db = await getDB();
  const existing = await db.get('pets', id);
  
  if (!existing) throw new Error('Pet not found');
  
  const updated = {
    ...existing,
    ...updates,
    updated_at: getCurrentTimestamp(),
  };

  await db.put('pets', updated);
  await queueAction('update', 'pet', id, updates);
}

export async function deletePet(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pets', id);
  await queueAction('delete', 'pet', id, null);
}

// ========================================
// Vaccine Management
// ========================================
export async function addVaccine(vaccineData: Omit<Vaccine, 'id' | 'created_at' | 'updated_at'>): Promise<Vaccine> {
  const db = await getDB();
  const now = getCurrentTimestamp();
  
  const vaccine: Vaccine = {
    id: generateId(),
    ...vaccineData,
    created_at: now,
    updated_at: now,
  };

  await db.put('vaccines', vaccine);
  await queueAction('create', 'vaccine', vaccine.id, vaccine);

  return vaccine;
}

export async function getVaccinesByPet(petId: string): Promise<Vaccine[]> {
  const db = await getDB();
  return db.getAllFromIndex('vaccines', 'by-pet', petId);
}

export async function getUpcomingVaccines(days: number = 30): Promise<Vaccine[]> {
  const db = await getDB();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  const allVaccines = await db.getAll('vaccines');
  
  return allVaccines.filter(vaccine => {
    if (!vaccine.next_due) return false;
    const dueDate = new Date(vaccine.next_due);
    return dueDate <= futureDate && dueDate >= new Date();
  });
}

// ========================================
// Medication Management (Horários flexíveis)
// ========================================
export async function addMedication(medicationData: Omit<Medication, 'id' | 'created_at' | 'updated_at' | 'administered_doses'>): Promise<Medication> {
  const db = await getDB();
  const now = getCurrentTimestamp();
  
  const medication: Medication = {
    id: generateId(),
    ...medicationData,
    administered_doses: [],
    created_at: now,
    updated_at: now,
  };

  await db.put('medications', medication);
  await queueAction('create', 'medication', medication.id, medication);

  return medication;
}

export async function getMedicationsByPet(petId: string, activeOnly: boolean = false): Promise<Medication[]> {
  const db = await getDB();
  const medications = await db.getAllFromIndex('medications', 'by-pet', petId);
  
  if (activeOnly) {
    return medications.filter(med => med.active);
  }
  
  return medications;
}

export async function markMedicationAdministered(medicationId: string, scheduledTime: string, notes?: string): Promise<void> {
  const db = await getDB();
  const medication = await db.get('medications', medicationId);
  
  if (!medication) throw new Error('Medication not found');
  
  const dose = {
    id: generateId(),
    medication_id: medicationId,
    scheduled_time: scheduledTime,
    administered_time: getCurrentTimestamp(),
    administered: true,
    notes,
  };
  
  await db.put('medications', medication);
  await queueAction('update', 'medication', medicationId, { administered_doses: medication.administered_doses });
}

// ========================================
// Medical Records
// ========================================
export async function addMedicalRecord(recordData: Omit<MedicalRecord, 'id' | 'created_at' | 'updated_at'>): Promise<MedicalRecord> {
  const db = await getDB();
  const now = getCurrentTimestamp();
  
  const record: MedicalRecord = {
    id: generateId(),
    ...recordData,
    created_at: now,
    updated_at: now,
  };

  await db.put('medical_records', record);
  await queueAction('create', 'medical_record', record.id, record);

  return record;
}

export async function getMedicalRecordsByPet(petId: string): Promise<MedicalRecord[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('medical_records', 'by-pet', petId);
  
  // Ordenar por data (mais recente primeiro)
  return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ========================================
// Weight Tracking (Para filhotes)
// ========================================
export async function addWeightRecord(weightData: Omit<WeightRecord, 'id' | 'created_at'>): Promise<WeightRecord> {
  const db = await getDB();
  const now = getCurrentTimestamp();
  
  const weight: WeightRecord = {
    id: generateId(),
    ...weightData,
    created_at: now,
  };

  await db.put('weight_records', weight);
  await queueAction('create', 'weight_record', weight.id, weight);

  return weight;
}

export async function getWeightRecordsByPet(petId: string): Promise<WeightRecord[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('weight_records', 'by-pet', petId);
  
  // Ordenar por data (mais recente primeiro)
  return records.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
}

// ========================================
// Document Management
// ========================================
export async function addDocument(documentData: Omit<DocumentAttachment, 'id' | 'uploaded_at'>): Promise<DocumentAttachment> {
  const db = await getDB();
  const now = getCurrentTimestamp();
  
  const document: DocumentAttachment = {
    id: generateId(),
    ...documentData,
    uploaded_at: now,
  };

  await db.put('documents', document);
  await queueAction('create', 'document', document.id, document);

  return document;
}

// ========================================
// Sync Queue Management
// ========================================
async function queueAction(action: 'create' | 'update' | 'delete', entityType: string, entityId: string, data: unknown): Promise<void> {
  const db = await getDB();
  
  const pendingAction: PendingAction = {
    id: generateId(),
    action,
    entity_type: entityType as PendingAction['entity_type'],
    entity_id: entityId,
    data,
    timestamp: getCurrentTimestamp(),
    retries: 0,
  };

  await db.put('sync_queue', pendingAction);
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await getDB();
  return db.getAll('sync_queue');
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('sync_queue');
}

// ========================================
// Export (Nunca reter dados)
// ========================================
export async function exportAllData(): Promise<ExportData> {
  const db = await getDB();
  
  const [pets, vaccines, medications, medicalRecords, weightRecords, documents] = await Promise.all([
    db.getAll('pets'),
    db.getAll('vaccines'),
    db.getAll('medications'),
    db.getAll('medical_records'),
    db.getAll('weight_records'),
    db.getAll('documents'),
  ]);

  return {
    tutor: { 
      id: 'local-user',
      name: 'Local User',
      email: '',
      created_at: getCurrentTimestamp(),
      updated_at: getCurrentTimestamp()
    },
    pets,
    vaccines,
    medications,
    medical_records: medicalRecords,
    weight_records: weightRecords,
    documents,
    exported_at: getCurrentTimestamp(),
    version: '1.0.0',
  };
}

export function downloadExportAsJSON(data: ExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `petmol-backup-${localTodayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================================
// Migration from Old System
// ========================================
export async function migrateFromOldSystem(): Promise<{ migrated: number; errors: string[] }> {
  const errors: string[] = [];
  let migrated = 0;

  try {
    // Migrar do localStorage antigo
    const oldProfiles = localStorage.getItem('pet_health_profiles');
    
    if (oldProfiles) {
      const profiles = JSON.parse(oldProfiles);
      
      for (const [petId, profile] of Object.entries(profiles as Record<string, Record<string, unknown>>)) {
        try {
          const p = profile as Record<string, unknown>;
          // Converter perfil antigo para novo formato
          const pet: Omit<Pet, 'id' | 'created_at' | 'updated_at'> = {
            tutor_id: 'migrated-user',
            name: (p.pet_name || p.name || 'Pet') as string,
            species: (p.species || 'other') as Pet['species'],
            breed: p.breed as string | undefined,
            birth_date: p.birthdate as string | undefined,
            weight_current: p.weight_kg as number | undefined,
            weight_unit: 'kg',
            microchip: p.microchip as string | undefined,
            gender: p.gender as Pet['gender'],
            sterilized: p.sterilized as boolean | undefined,
          };

          const newPet = await createPet(pet);

          // Migrar vacinas
          const legacyVaccines = Array.isArray(p.vaccines)
            ? (p.vaccines as Array<Record<string, unknown>>)
            : [];
          if (legacyVaccines.length > 0) {
            for (const oldVaccine of legacyVaccines) {
              await addVaccine({
                pet_id: newPet.id,
                type: ((oldVaccine.vaccine_type as Vaccine['type'] | undefined) ?? 'other'),
                name: (oldVaccine.vaccine_name as string) || (oldVaccine.name as string) || 'Vacina',
                date_applied: (oldVaccine.date_administered as string) || (oldVaccine.date as string) || getCurrentTimestamp(),
                next_due: oldVaccine.next_dose_date as string | undefined,
                batch_number: oldVaccine.batch_number as string | undefined,
                veterinarian: oldVaccine.veterinarian as string | undefined,
                clinic_name: (oldVaccine.clinic_name as string) || (oldVaccine.clinic as string),
                reminder_days: 7, // Padrão
                notes: oldVaccine.notes as string | undefined,
                attachments: [],
              });
            }
          }

          migrated++;
        } catch (error) {
          errors.push(`Erro ao migrar pet ${petId}: ${error}`);
        }
      }

      // Marcar migração como concluída
      localStorage.setItem('petmol_migration_completed', 'true');
    }
  } catch (error) {
    errors.push(`Erro geral na migração: ${error}`);
  }

  return { migrated, errors };
}