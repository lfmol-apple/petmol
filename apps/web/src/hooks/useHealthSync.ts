/**
 * useHealthSync Hook
 * 
 * React hook para gerenciar sincronização de dados de saúde
 */

import { useState, useEffect, useCallback } from 'react';
import {
  createHealthProfile,
  getHealthProfile,
  getAllHealthProfiles,
  updateHealthProfile,
  addWeightRecord,
  addMedicalRecord,
  getSyncMetadata,
  PetHealthProfile,
  WeightRecord,
  MedicalRecord,
} from '@/lib/health/syncStorage';
import {
  fullSync,
  getSyncStatus,
  startAutoSync,
  stopAutoSync,
} from '@/lib/health/syncService';

export function useHealthSync() {
  const [profiles, setProfiles] = useState<PetHealthProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    isOnline: boolean;
    pendingUploads: number;
    lastSync?: string;
    lastError?: string;
  }>({
    isOnline: navigator.onLine,
    pendingUploads: 0,
  });

  // Load profiles from IndexedDB
  const loadProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllHealthProfiles();
      setProfiles(data);
    } catch (error) {
      console.error('[useHealthSync] Load failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh sync status
  const refreshStatus = useCallback(async () => {
    const status = await getSyncStatus();
    setSyncStatus(status);
  }, []);

  // Manual sync
  const sync = useCallback(async () => {
    try {
      setSyncing(true);
      await fullSync();
      await loadProfiles();
      await refreshStatus();
    } catch (error) {
      console.error('[useHealthSync] Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  }, [loadProfiles, refreshStatus]);

  // Create profile
  const createProfile = useCallback(async (
    petId: string,
    name: string,
    species: 'dog' | 'cat' | 'other',
    additionalData?: Partial<PetHealthProfile>
  ) => {
    const profile = await createHealthProfile(petId, name, species, additionalData);
    await loadProfiles();
    await refreshStatus();
    return profile;
  }, [loadProfiles, refreshStatus]);

  // Update profile
  const updateProfile = useCallback(async (
    petId: string,
    updates: Partial<PetHealthProfile>
  ) => {
    await updateHealthProfile(petId, updates);
    await loadProfiles();
    await refreshStatus();
  }, [loadProfiles, refreshStatus]);

  // Add weight record
  const addWeight = useCallback(async (
    petId: string,
    weight: number,
    weightUnit: 'kg' | 'lb',
    measuredAt?: string,
    notes?: string
  ) => {
    const record = await addWeightRecord(petId, weight, weightUnit, measuredAt, notes);
    await loadProfiles();
    await refreshStatus();
    return record;
  }, [loadProfiles, refreshStatus]);

  // Add medical record
  const addMedical = useCallback(async (
    petId: string,
    record: Omit<MedicalRecord, 'id' | 'created_at' | 'updated_at' | 'synced_at'>
  ) => {
    const fullRecord = await addMedicalRecord(petId, record);
    await loadProfiles();
    await refreshStatus();
    return fullRecord;
  }, [loadProfiles, refreshStatus]);

  // Get single profile
  const getProfile = useCallback(async (petId: string) => {
    return getHealthProfile(petId);
  }, []);

  // Initialize
  useEffect(() => {
    loadProfiles();
    refreshStatus();

    // Start auto-sync (every 15 minutes)
    startAutoSync(15);

    // Listen for online/offline events
    const handleOnline = () => {
      console.log('[useHealthSync] Online - triggering sync');
      fullSync().then(() => {
        loadProfiles();
        refreshStatus();
      });
    };

    const handleOffline = () => {
      console.log('[useHealthSync] Offline');
      refreshStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      stopAutoSync();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadProfiles, refreshStatus]);

  return {
    // Data
    profiles,
    loading,
    syncing,
    syncStatus,
    
    // Actions
    createProfile,
    updateProfile,
    addWeight,
    addMedical,
    getProfile,
    sync,
    refreshStatus,
  };
}
