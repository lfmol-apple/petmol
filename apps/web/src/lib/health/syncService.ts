/**
 * Health Sync Service
 * 
 * Sincronização bidirecional IndexedDB ↔ Supabase
 * - Cursor-based pagination para eficiência
 * - Exponential backoff retry
 * - Conflict resolution (last-write-wins)
 */

import {
  getOfflineQueue,
  removeFromQueue,
  markActionFailed,
  getAllHealthProfiles,
  updateSyncMetadata,
  getSyncMetadata,
  OfflineAction,
  PetHealthProfile,
} from './syncStorage';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // exponential: 1s, 5s, 15s

// ========================================
// Upload Offline Queue to Supabase
// ========================================

export async function syncOfflineQueue(): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  const queue = await getOfflineQueue();
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  console.log(`[Health Sync] Processing ${queue.length} queued actions`);

  for (const action of queue) {
    try {
      // Skip if exceeded retry limit
      if (action.retry_count >= MAX_RETRIES) {
        console.warn(`[Health Sync] Action ${action.id} exceeded max retries, skipping`);
        errors.push(`${action.entity_type}:${action.entity_id} - max retries exceeded`);
        failed++;
        continue;
      }

      // Execute action
      await executeAction(action);
      
      // Success - remove from queue
      await removeFromQueue(action.id);
      success++;
      
    } catch (error: unknown) {
      console.error(`[Health Sync] Action ${action.id} failed:`, error);
      
      // Mark as failed for retry
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      await markActionFailed(action.id, errMsg);
      errors.push(`${action.entity_type}:${action.entity_id} - ${errMsg}`);
      failed++;
      
      // Wait before next retry (exponential backoff)
      const delay = RETRY_DELAYS[Math.min(action.retry_count, RETRY_DELAYS.length - 1)];
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.log(`[Health Sync] Queue processed: ${success} success, ${failed} failed`);

  return { success, failed, errors };
}

async function executeAction(action: OfflineAction): Promise<void> {
  const endpoint = getEndpoint(action.entity_type);
  const method = getMethod(action.action_type);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(action.payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase ${method} failed: ${error}`);
  }
}

function getEndpoint(entityType: OfflineAction['entity_type']): string {
  const map: Record<OfflineAction['entity_type'], string> = {
    'health_profile': 'health_profiles',
    'weight_record': 'weight_records',
    'medical_record': 'medical_records',
    'vaccination': 'vaccinations',
    'medication': 'medications',
  };
  return map[entityType];
}

function getMethod(actionType: OfflineAction['action_type']): string {
  const map: Record<OfflineAction['action_type'], string> = {
    'create': 'POST',
    'update': 'PATCH',
    'delete': 'DELETE',
  };
  return map[actionType];
}

// ========================================
// Download from Supabase (Cursor-based)
// ========================================

export async function syncFromSupabase(cursor?: string): Promise<{
  profiles: PetHealthProfile[];
  nextCursor?: string;
  hasMore: boolean;
}> {
  const BATCH_SIZE = 50;
  
  try {
    // Build cursor-based query
    let url = `${SUPABASE_URL}/rest/v1/health_profiles?order=updated_at.asc&limit=${BATCH_SIZE}`;
    
    if (cursor) {
      url += `&updated_at=gt.${cursor}`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase fetch failed: ${response.statusText}`);
    }

    const profiles: PetHealthProfile[] = await response.json();
    
    // Next cursor is the last updated_at
    const nextCursor = profiles.length > 0 
      ? profiles[profiles.length - 1].updated_at 
      : undefined;
    
    const hasMore = profiles.length === BATCH_SIZE;

    console.log(`[Health Sync] Downloaded ${profiles.length} profiles (cursor: ${cursor || 'initial'})`);

    // Save to IndexedDB (merge with local changes)
    for (const profile of profiles) {
      // TODO: Implement conflict resolution here
      // For now: last-write-wins (Supabase data overwrites local if updated_at > local)
      const db = await import('./syncStorage').then(m => m.getHealthProfile(profile.pet_id));
      
      if (!db || new Date(profile.updated_at) > new Date(db.updated_at)) {
        // Supabase version is newer
        await import('./syncStorage').then(m => m.updateHealthProfile(profile.pet_id, profile));
      }
    }

    // Update sync metadata
    if (nextCursor) {
      await updateSyncMetadata({ 
        last_cursor: nextCursor,
        last_full_sync: new Date().toISOString(),
      });
    }

    return { profiles, nextCursor, hasMore };
    
  } catch (error: unknown) {
    console.error('[Health Sync] Download failed:', error);
    await updateSyncMetadata({ last_error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

// ========================================
// Full Sync (Bidirectional)
// ========================================

export async function fullSync(): Promise<{
  uploaded: number;
  downloaded: number;
  errors: string[];
}> {
  console.log('[Health Sync] Starting full sync...');
  
  const errors: string[] = [];
  let uploaded = 0;
  let downloaded = 0;

  try {
    // 1. Upload offline queue first
    const uploadResult = await syncOfflineQueue();
    uploaded = uploadResult.success;
    errors.push(...uploadResult.errors);

    // 2. Download from Supabase (cursor-based pagination)
    const metadata = await getSyncMetadata();
    let cursor = metadata?.last_cursor;
    let hasMore = true;

    while (hasMore) {
      const result = await syncFromSupabase(cursor);
      downloaded += result.profiles.length;
      cursor = result.nextCursor;
      hasMore = result.hasMore;

      // Pause between batches to avoid rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`[Health Sync] Full sync complete: ${uploaded} uploaded, ${downloaded} downloaded`);

    return { uploaded, downloaded, errors };
    
  } catch (error: unknown) {
    console.error('[Health Sync] Full sync failed:', error);
    errors.push(`Full sync error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { uploaded, downloaded, errors };
  }
}

// ========================================
// Auto Sync (Background)
// ========================================

let syncInterval: NodeJS.Timeout | null = null;

export function startAutoSync(intervalMinutes: number = 15): void {
  if (syncInterval) {
    console.warn('[Health Sync] Auto-sync already running');
    return;
  }

  console.log(`[Health Sync] Starting auto-sync (every ${intervalMinutes} min)`);

  // Immediate sync on start
  fullSync().catch(console.error);

  // Then periodic sync
  syncInterval = setInterval(() => {
    fullSync().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[Health Sync] Auto-sync stopped');
  }
}

// ========================================
// Sync Status
// ========================================

export async function getSyncStatus(): Promise<{
  isOnline: boolean;
  pendingUploads: number;
  lastSync?: string;
  lastError?: string;
}> {
  const metadata = await getSyncMetadata();
  
  return {
    isOnline: navigator.onLine,
    pendingUploads: metadata?.pending_uploads || 0,
    lastSync: metadata?.last_full_sync,
    lastError: metadata?.last_error,
  };
}
