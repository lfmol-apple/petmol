/**
 * Sync Manager - Sincronização Offline-First
 * Gerencia sincronização entre memória e backend
 * Estratégia: Last-Write-Wins com timestamps
 */

import { API_BASE_URL } from './api';
import { getToken } from './auth-token';
import { VaccineRecord } from './petHealth';

export interface SyncMetadata {
  lastSyncAt: string; // ISO timestamp
  pendingChanges: number;
  conflictsResolved: number;
}

export interface VaccineRecordWithSync extends VaccineRecord {
  _last_modified?: string; // ISO timestamp do cliente
  _server_modified?: string; // ISO timestamp do servidor (autoritativo)
  _synced?: boolean;
  _deleted?: boolean; // Tombstone para soft delete
}

let syncMetadataMemory: SyncMetadata = {
  lastSyncAt: '',
  pendingChanges: 0,
  conflictsResolved: 0,
};

const SYNC_METADATA_KEY = 'petmol_sync_metadata_v1';
const PENDING_CHANGES_KEY = 'petmol_pending_changes_v1';

interface PendingChangeEntry {
  type: 'add' | 'update' | 'delete';
  data: unknown;
  timestamp: string;
}

let pendingChangesMemory: Record<string, PendingChangeEntry[]> = {};

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage exhaustion and private mode failures
  }
}

function hydrateSyncState(): void {
  syncMetadataMemory = readStorage<SyncMetadata>(SYNC_METADATA_KEY, syncMetadataMemory);
  pendingChangesMemory = readStorage<Record<string, PendingChangeEntry[]>>(PENDING_CHANGES_KEY, pendingChangesMemory);
}

hydrateSyncState();

/**
 * Obtém metadados de sincronização
 */
export function getSyncMetadata(): SyncMetadata {
  hydrateSyncState();
  return { ...syncMetadataMemory };
}

/**
 * Atualiza metadados de sincronização
 */
export function updateSyncMetadata(metadata: Partial<SyncMetadata>): void {
  const current = getSyncMetadata();
  syncMetadataMemory = { ...current, ...metadata };
  writeStorage(SYNC_METADATA_KEY, syncMetadataMemory);
}

/**
 * Marca mudança pendente para sincronização
 */
export function markPendingChange(petId: string, changeType: 'add' | 'update' | 'delete', data: unknown): void {
  hydrateSyncState();
  const pending = pendingChangesMemory;
  
  if (!pending[petId]) {
    pending[petId] = [];
  }
  
  pending[petId].push({
    type: changeType,
    data,
    timestamp: new Date().toISOString(),
  });
  
  pendingChangesMemory = pending;
  writeStorage(PENDING_CHANGES_KEY, pendingChangesMemory);
  
  // Atualiza contador
  const metadata = getSyncMetadata();
  metadata.pendingChanges = Object.values(pending).flat().length;
  updateSyncMetadata(metadata);
}

/**
 * Limpa mudanças pendentes de um pet
 */
export function clearPendingChanges(petId: string): void {
  hydrateSyncState();
  const pending = pendingChangesMemory;
  delete pending[petId];
  pendingChangesMemory = pending;
  writeStorage(PENDING_CHANGES_KEY, pendingChangesMemory);
  
  // Atualiza contador
  const metadata = getSyncMetadata();
  metadata.pendingChanges = Object.values(pending).flat().length;
  updateSyncMetadata(metadata);
}

/**
 * Obtém todas mudanças pendentes
 */
export function getPendingChanges(): Record<string, PendingChangeEntry[]> {
  hydrateSyncState();
  return pendingChangesMemory;
}

/**
 * Sincroniza vacinas de um pet com o backend
 * Last-Write-Wins: timestamp mais recente vence
 */
export async function syncVaccines(
  petId: string,
  localRecords: VaccineRecordWithSync[],
  backendUrl?: string
): Promise<{
  success: boolean;
  merged: VaccineRecordWithSync[];
  conflicts: number;
  error?: string;
}> {
  const apiBase = backendUrl || API_BASE_URL;
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    // 1. Buscar dados do backend
    const response = await fetch(`${apiBase}/sync/vaccines/${petId}`, {
      method: 'GET',
      headers,
    });
    
    if (!response.ok) {
      // Se não encontrar (404), considera backend vazio
      if (response.status === 404) {
        // Envia todas locais para o backend
        const postResponse = await fetch(`${apiBase}/sync/vaccines/${petId}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ vaccines: localRecords }),
        });
        
        if (!postResponse.ok) {
          throw new Error(`Falha ao enviar vacinas: ${postResponse.status}`);
        }
        
        updateSyncMetadata({ lastSyncAt: new Date().toISOString() });
        clearPendingChanges(petId);
        
        return {
          success: true,
          merged: localRecords,
          conflicts: 0,
        };
      }
      
      // Outros erros (401, 403, 500, etc)
      if (response.status === 401 || response.status === 403) {
        throw new Error('Não autorizado. Faça login novamente.');
      }
      
      throw new Error(`Falha na sincronização: ${response.status}`);
    }
    
    const remoteData = await response.json();
    const remoteRecords: VaccineRecordWithSync[] = remoteData.vaccines || [];
    
    // 2. Merge com Last-Write-Wins
    const merged = mergeRecordsLastWriteWins(localRecords, remoteRecords);
    
    // 3. Enviar versão final para o backend
    const postResponse = await fetch(`${apiBase}/sync/vaccines/${petId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ vaccines: merged.records }),
    });
    
    if (!postResponse.ok) {
      throw new Error(`Falha ao enviar versão final: ${postResponse.status}`);
    }
    
    // 4. Atualizar metadata
    updateSyncMetadata({ 
      lastSyncAt: new Date().toISOString(),
      conflictsResolved: merged.conflicts,
    });
    clearPendingChanges(petId);
    
    return {
      success: true,
      merged: merged.records,
      conflicts: merged.conflicts,
    };
    
  } catch (error) {
    console.error('[SyncManager] Erro na sincronização:', error);
    return {
      success: false,
      merged: localRecords,
      conflicts: 0,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Merge Last-Write-Wins usando ID como chave primária
 * Prioriza _server_modified quando disponível, senão _last_modified
 * Suporta tombstone (_deleted: true)
 */
function mergeRecordsLastWriteWins(
  local: VaccineRecordWithSync[],
  remote: VaccineRecordWithSync[]
): { records: VaccineRecordWithSync[]; conflicts: number } {
  const merged = new Map<string, VaccineRecordWithSync>();
  let conflicts = 0;
  
  /**
   * Extrai timestamp para comparação LWW
   * Prioridade: _server_modified > _last_modified > epoch
   */
  const getTimestamp = (record: VaccineRecordWithSync): number => {
    if (record._server_modified) {
      return new Date(record._server_modified).getTime();
    }
    if (record._last_modified) {
      return new Date(record._last_modified).getTime();
    }
    return new Date('1970-01-01').getTime();
  };
  
  // 1. Adiciona todos locais (usa ID como chave)
  for (const record of local) {
    merged.set(record.id, {
      ...record,
      _synced: false,
    });
  }
  
  // 2. Merge com remotos por ID
  for (const remoteRecord of remote) {
    const localRecord = merged.get(remoteRecord.id);
    
    if (!localRecord) {
      // Só existe remotamente -> adiciona
      merged.set(remoteRecord.id, { ...remoteRecord, _synced: true });
    } else {
      // Existe em ambos -> compara timestamps
      const localTime = getTimestamp(localRecord);
      const remoteTime = getTimestamp(remoteRecord);
      
      if (remoteTime > localTime) {
        // Remoto mais recente -> usa remoto
        merged.set(remoteRecord.id, { ...remoteRecord, _synced: true });
        conflicts++;
      } else if (remoteTime === localTime && !localRecord._synced) {
        // Empate: prefere remoto se local não sincronizado ainda
        merged.set(remoteRecord.id, { ...remoteRecord, _synced: true });
      }
      // Senão: mantém local (já está no map)
    }
  }
  
  return { records: Array.from(merged.values()), conflicts };
}

/**
 * Verifica se está online
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.onLine;
}

/**
 * Setup listeners para eventos de rede
 */
export function setupNetworkListeners(onOnline: () => void, onOffline: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
