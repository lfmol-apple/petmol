/**
 * React Query Hooks - Offline-First
 * Hooks para gerenciar vacinas com sincronização automática
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PetHealthProfile as PetProfile, VaccineRecord } from './petHealth';
import { 
  VaccineRecordWithSync, 
  syncVaccines, 
  markPendingChange,
  getSyncMetadata,
  isOnline,
  SyncMetadata,
} from './syncManager';

let healthRecordsMemory: Record<string, PetProfile> = {};

// Helper: Obtém todos os health records
function getAllHealthRecords(): Record<string, PetProfile> {
  return healthRecordsMemory;
}

// Helper: Atualiza health records
function updateHealthRecords(petId: string, profile: PetProfile): void {
  const records = getAllHealthRecords();
  records[petId] = profile;
  healthRecordsMemory = records;
}

// Query Keys
export const QUERY_KEYS = {
  pets: ['pets'] as const,
  pet: (id: string) => ['pets', id] as const,
  vaccines: (petId: string) => ['vaccines', petId] as const,
  syncMetadata: ['syncMetadata'] as const,
};

/**
 * Hook para obter vacinas de um pet
 * Offline-first: sempre lê da memória primeiro
 */
export function useVaccines(petId: string | null) {
  return useQuery({
    queryKey: petId ? QUERY_KEYS.vaccines(petId) : ['vaccines', 'none'],
    queryFn: async () => {
      if (!petId) return [];
      
      const records = getAllHealthRecords();
      const pet = records[petId];
      
      if (!pet?.vaccines) return [];
      
      // Retorna apenas vacinas não deletadas (UI)
      // Nota: Para sync, usar lista completa (getAllHealthRecords diretamente)
      const vaccinesWithSync: VaccineRecordWithSync[] = pet.vaccines
        .filter((v: VaccineRecordWithSync) => !v._deleted) // Filtra tombstones
        .map((v: VaccineRecordWithSync) => ({
          ...v,
          _last_modified: v._last_modified || new Date().toISOString(),
          _synced: v._synced || false,
        }));
      
      return vaccinesWithSync;
    },
    enabled: !!petId,
    staleTime: Infinity, // Dados locais nunca ficam stale
  });
}

/**
 * Hook para adicionar vacina
 * Salva localmente e marca para sync
 */
export function useAddVaccine(petId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (vaccine: Omit<VaccineRecord, 'id'>) => {
      const records = getAllHealthRecords();
      const pet = records[petId];
      
      if (!pet) {
        throw new Error('Pet não encontrado');
      }
      
      const newVaccine: VaccineRecordWithSync = {
        ...vaccine,
        id: `vac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        _last_modified: new Date().toISOString(),
        _synced: false,
        _deleted: false,
      };
      
      const updatedVaccines = [...(pet.vaccines || []), newVaccine];
      
      updateHealthRecords(petId, {
        ...pet,
        vaccines: updatedVaccines,
      });
      
      // Marca para sincronização
      markPendingChange(petId, 'add', newVaccine);
      
      return newVaccine;
    },
    onSuccess: () => {
      // Invalida cache para refetch
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vaccines(petId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncMetadata });
      
      // Tenta sincronizar se online
      if (isOnline()) {
        syncVaccinesInBackground(petId, queryClient);
      }
    },
  });
}

/**
 * Hook para atualizar vacina
 */
export function useUpdateVaccine(petId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ vaccineId, updates }: { vaccineId: string; updates: Partial<VaccineRecord> }) => {
      const records = getAllHealthRecords();
      const pet = records[petId];
      
      if (!pet?.vaccines) {
        throw new Error('Pet não encontrado');
      }
      
      const updatedVaccines = pet.vaccines.map(v => 
        v.id === vaccineId 
          ? { 
              ...v, 
              ...updates, 
              _last_modified: new Date().toISOString(),
              _synced: false,
            }
          : v
      );
      
      updateHealthRecords(petId, {
        ...pet,
        vaccines: updatedVaccines,
      });
      
      const updatedVaccine = updatedVaccines.find(v => v.id === vaccineId);
      if (updatedVaccine) {
        markPendingChange(petId, 'update', updatedVaccine);
      }
      
      return updatedVaccine;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vaccines(petId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncMetadata });
      
      if (isOnline()) {
        syncVaccinesInBackground(petId, queryClient);
      }
    },
  });
}

/**
 * Hook para deletar vacina
 */
export function useDeleteVaccine(petId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (vaccineId: string) => {
      const records = getAllHealthRecords();
      const pet = records[petId];
      
      if (!pet?.vaccines) {
        throw new Error('Pet não encontrado');
      }
      
      // Tombstone: marca como deletado ao invés de remover
      const now = new Date().toISOString();
      const updatedVaccines = pet.vaccines.map(v => 
        v.id === vaccineId 
          ? {
              ...v,
              _deleted: true,
              _last_modified: now,
              _synced: false,
            }
          : v
      );
      
      updateHealthRecords(petId, {
        ...pet,
        vaccines: updatedVaccines,
      });
      
      markPendingChange(petId, 'delete', { 
        id: vaccineId, 
        _deleted: true,
        _last_modified: now,
      });
      
      return vaccineId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vaccines(petId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncMetadata });
      
      if (isOnline()) {
        syncVaccinesInBackground(petId, queryClient);
      }
    },
  });
}

/**
 * Hook para deletar todas vacinas
 */
export function useDeleteAllVaccines(petId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const records = getAllHealthRecords();
      const pet = records[petId];
      
      if (!pet) {
        throw new Error('Pet não encontrado');
      }
      
      // Tombstone: marca todas como deletadas ao invés de limpar array
      const now = new Date().toISOString();
      const updatedVaccines = (pet.vaccines || []).map((v: VaccineRecordWithSync) => ({
        ...v,
        _deleted: true,
        _last_modified: now,
        _synced: false,
      }));
      
      updateHealthRecords(petId, {
        ...pet,
        vaccines: updatedVaccines,
      });
      
      markPendingChange(petId, 'delete', { 
        deleteAll: true, 
        _last_modified: now,
      });
      
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vaccines(petId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncMetadata });
      
      if (isOnline()) {
        syncVaccinesInBackground(petId, queryClient);
      }
    },
  });
}

/**
 * Hook para sincronizar manualmente
 */
export function useSyncVaccines(petId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      // IMPORTANTE: Buscar TODOS os registros (incluindo _deleted) para sync
      const records = getAllHealthRecords();
      const pet = records[petId];
      const allVaccines = (pet?.vaccines || []) as VaccineRecordWithSync[];
      
      const result = await syncVaccines(petId, allVaccines);
      
      if (result.success) {
        // Atualiza memória com dados merged
        updateHealthRecords(petId, {
          ...pet,
          vaccines: result.merged.map(v => ({ ...v, _synced: true })),
        });
      }
      
      return result;
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vaccines(petId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncMetadata });
      }
    },
  });
}

/**
 * Hook para obter metadados de sync
 */
export function useSyncMetadata() {
  return useQuery({
    queryKey: QUERY_KEYS.syncMetadata,
    queryFn: () => getSyncMetadata(),
    refetchInterval: 5000, // Atualiza a cada 5 segundos
  });
}

/**
 * Sincroniza em background sem bloquear UI
 */
async function syncVaccinesInBackground(petId: string, queryClient: { invalidateQueries: (opts: { queryKey: readonly string[] }) => void }): Promise<void> {
  try {
    // IMPORTANTE: Buscar TODOS os registros (incluindo _deleted) para sync
    const records = getAllHealthRecords();
    const pet = records[petId];
    const allVaccines = (pet?.vaccines || []) as VaccineRecordWithSync[];
    
    const result = await syncVaccines(petId, allVaccines);
    
    if (result.success) {
      updateHealthRecords(petId, {
        ...pet,
        vaccines: result.merged.map(v => ({ ...v, _synced: true })),
      });
      
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.vaccines(petId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.syncMetadata });
    }
  } catch (error) {
    console.error('Background sync error:', error);
    // Não propaga erro para não quebrar UX
  }
}
