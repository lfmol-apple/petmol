/**
 * Identity Kit Store - Persistência e geração de códigos
 * 
 * Responsável por:
 * - Gerar docCode único para cada pet
 * - Armazenar tema preferido
 * - Registrar artefatos gerados
 * - Tracking de compartilhamentos
 */

import { openDB, IDBPDatabase } from 'idb';
import { v4 as uuidv4 } from 'uuid';
import type { 
  IdentityKitTheme, 
  PetIdentityData, 
  GeneratedArtifact,
  IdentityKitEvent
} from './types';

const DB_NAME = 'petmol_identity_kit';
const DB_VERSION = 1;

interface IdentityKitDB {
  pet_identity: {
    key: string; // petId
    value: PetIdentityData;
  };
  generated_artifacts: {
    key: string; // artifact ID
    value: GeneratedArtifact;
    indexes: { petId: string; type: string };
  };
}

let dbPromise: Promise<IDBPDatabase<IdentityKitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<IdentityKitDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store de identidade do pet
        if (!db.objectStoreNames.contains('pet_identity')) {
          db.createObjectStore('pet_identity', { keyPath: 'petId' });
        }

        // Store de artefatos gerados
        if (!db.objectStoreNames.contains('generated_artifacts')) {
          const artifactsStore = db.createObjectStore('generated_artifacts', {
            keyPath: 'id',
            autoIncrement: true,
          });
          artifactsStore.createIndex('petId', 'petId', { unique: false });
          artifactsStore.createIndex('type', 'type', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Gera um docCode curto e único (8-10 caracteres)
 * Formato: PET-XXXX-YY (exemplo: PET-7A2F-B3)
 */
export function generateDocCode(): string {
  const uuid = uuidv4().replace(/-/g, '').toUpperCase();
  const segment1 = uuid.substring(0, 4);
  const segment2 = uuid.substring(4, 6);
  return `PET-${segment1}-${segment2}`;
}

/**
 * Gera MRZ fake para o passaporte (entretenimento)
 */
export function generateMRZ(
  name: string,
  species: string,
  breed: string | undefined,
  docCode: string
): { line1: string; line2: string } {
  const sanitize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const safeName = sanitize(name).slice(0, 16) || 'PET';
  const safeSpecies = sanitize(species).slice(0, 10) || 'PET';
  const safeBreed = sanitize(breed || 'X').slice(0, 10);
  const safeDoc = sanitize(docCode);

  const line1 = `P<PETMOL<<${safeName}<<${safeSpecies}`.padEnd(44, '<').slice(0, 44);
  const line2 = `${safeBreed}<<${safeDoc}`.padEnd(44, '<').slice(0, 44);

  return { line1, line2 };
}

/**
 * Salva ou atualiza identidade do pet
 */
export async function savePetIdentity(data: PetIdentityData): Promise<void> {
  const db = await getDB();
  await db.put('pet_identity', data);
}

/**
 * Obtém identidade do pet
 */
export async function getPetIdentity(petId: string): Promise<PetIdentityData | undefined> {
  const db = await getDB();
  return db.get('pet_identity', petId);
}

/**
 * Atualiza tema preferido do pet
 */
export async function updatePreferredTheme(petId: string, theme: IdentityKitTheme): Promise<void> {
  const db = await getDB();
  const identity = await db.get('pet_identity', petId);
  if (identity) {
    identity.preferredTheme = theme;
    await db.put('pet_identity', identity);
  }
}

/**
 * Registra artefato gerado
 */
export async function saveGeneratedArtifact(artifact: Omit<GeneratedArtifact, 'shareCount'>): Promise<void> {
  const db = await getDB();
  await db.add('generated_artifacts', { ...artifact, shareCount: 0 } as GeneratedArtifact);
}

/**
 * Incrementa contador de compartilhamentos
 */
export async function incrementShareCount(artifactId: string): Promise<void> {
  const db = await getDB();
  const artifact = await db.get('generated_artifacts', artifactId);
  if (artifact) {
    artifact.shareCount += 1;
    await db.put('generated_artifacts', artifact);
  }
}

/**
 * Lista artefatos de um pet
 */
export async function getArtifactsByPet(petId: string): Promise<GeneratedArtifact[]> {
  const db = await getDB();
  return db.getAllFromIndex('generated_artifacts', 'petId', petId);
}

/**
 * Tracking de evento do Identity Kit (fire-and-forget)
 */
export async function trackIdentityKitEvent(
  event: IdentityKitEvent,
  apiUrl: string
): Promise<void> {
  try {
    // Fire and forget - não bloquear UI
    fetch(`${apiUrl}/analytics/identity_kit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(err => console.debug('[identity kit tracking]', err));
  } catch (err) {
    console.debug('[identity kit tracking]', err);
  }
}

/**
 * Cria identidade inicial para um pet (se não existir)
 */
export async function ensurePetIdentity(
  petId: string,
  name: string,
  species: 'dog' | 'cat' | 'other',
  breed: string | undefined,
  photoUrl: string
): Promise<PetIdentityData> {
  let identity = await getPetIdentity(petId);
  
  if (!identity) {
    identity = {
      petId,
      name,
      species,
      breed,
      photoUrl,
      docCode: generateDocCode(),
      issuedAt: new Date().toISOString(),
      ownerContactAuthorized: false,
      preferredTheme: 'classic',
    };
    await savePetIdentity(identity);
  }
  
  return identity;
}
