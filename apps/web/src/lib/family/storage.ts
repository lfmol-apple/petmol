/**
 * Family & Caregivers Storage
 * 
 * Sistema de compartilhamento familiar + cuidadores
 * - Convites por link/código
 * - Roles: view_only, can_edit, emergency_contact
 * - Revogação de acesso
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

export type CaregiverRole = 'view_only' | 'can_edit' | 'emergency_contact';

export interface FamilyInvite {
  id: string;
  code: string; // 6-digit code like "ABC123"
  
  // Owner info
  owner_id: string;
  owner_name: string;
  
  // Pets being shared
  pet_ids: string[];
  
  // Role to grant
  role: CaregiverRole;
  
  // Status
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  
  // Metadata
  created_at: string;
  expires_at: string;
  accepted_at?: string;
  accepted_by?: string; // user id
}

export interface Caregiver {
  id: string;
  
  // User info
  user_id: string;
  user_name: string;
  user_email?: string;
  user_phone?: string;
  
  // Access
  pet_ids: string[];
  role: CaregiverRole;
  
  // Metadata
  added_at: string;
  added_by: string; // owner user id
  last_access?: string;
  is_active: boolean;
}

interface FamilyDB extends DBSchema {
  invites: {
    key: string; // invite id
    value: FamilyInvite;
    indexes: { 
      'by-code': string;
      'by-status': string;
      'by-owner': string;
    };
  };
  caregivers: {
    key: string; // caregiver id
    value: Caregiver;
    indexes: { 
      'by-user': string;
      'by-pet': string;
      'by-role': string;
    };
  };
}

const DB_NAME = 'petmol_family';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<FamilyDB> | null = null;

async function getDB(): Promise<IDBPDatabase<FamilyDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<FamilyDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Invites store
      if (!db.objectStoreNames.contains('invites')) {
        const invitesStore = db.createObjectStore('invites', { keyPath: 'id' });
        invitesStore.createIndex('by-code', 'code', { unique: true });
        invitesStore.createIndex('by-status', 'status');
        invitesStore.createIndex('by-owner', 'owner_id');
      }

      // Caregivers store
      if (!db.objectStoreNames.contains('caregivers')) {
        const caregiversStore = db.createObjectStore('caregivers', { keyPath: 'id' });
        caregiversStore.createIndex('by-user', 'user_id');
        caregiversStore.createIndex('by-pet', 'pet_ids', { multiEntry: true });
        caregiversStore.createIndex('by-role', 'role');
      }
    },
  });

  return dbInstance;
}

// ========================================
// Invite Code Generation
// ========================================

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ========================================
// Create Invite
// ========================================

export async function createFamilyInvite(
  ownerId: string,
  ownerName: string,
  petIds: string[],
  role: CaregiverRole,
  expiresInHours: number = 48
): Promise<FamilyInvite> {
  const invite: FamilyInvite = {
    id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    code: generateInviteCode(),
    owner_id: ownerId,
    owner_name: ownerName,
    pet_ids: petIds,
    role,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
  };

  const db = await getDB();
  await db.put('invites', invite);

  console.log('[Family] Invite created:', invite.code);
  return invite;
}

// ========================================
// Get Invite
// ========================================

export async function getInviteByCode(code: string): Promise<FamilyInvite | null> {
  const db = await getDB();
  
  try {
    const invite = await db.getFromIndex('invites', 'by-code', code.toUpperCase());
    
    if (!invite) return null;
    
    // Check expiration
    if (new Date(invite.expires_at) < new Date() && invite.status === 'pending') {
      invite.status = 'expired';
      await db.put('invites', invite);
      return null;
    }
    
    return invite;
  } catch {
    return null;
  }
}

// ========================================
// Accept Invite
// ========================================

export async function acceptInvite(
  code: string,
  userId: string,
  userName: string,
  userEmail?: string,
  userPhone?: string
): Promise<Caregiver | null> {
  const invite = await getInviteByCode(code);
  
  if (!invite || invite.status !== 'pending') {
    console.error('[Family] Invalid or expired invite:', code);
    return null;
  }
  
  // Create caregiver
  const caregiver: Caregiver = {
    id: `cg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    user_name: userName,
    user_email: userEmail,
    user_phone: userPhone,
    pet_ids: invite.pet_ids,
    role: invite.role,
    added_at: new Date().toISOString(),
    added_by: invite.owner_id,
    is_active: true,
  };
  
  const db = await getDB();
  await db.put('caregivers', caregiver);
  
  // Update invite
  invite.status = 'accepted';
  invite.accepted_at = new Date().toISOString();
  invite.accepted_by = userId;
  await db.put('invites', invite);
  
  console.log('[Family] Invite accepted:', code, 'by', userName);
  return caregiver;
}

// ========================================
// Revoke Invite
// ========================================

export async function revokeInvite(inviteId: string): Promise<void> {
  const db = await getDB();
  const invite = await db.get('invites', inviteId);
  
  if (invite && invite.status === 'pending') {
    invite.status = 'revoked';
    await db.put('invites', invite);
    console.log('[Family] Invite revoked:', invite.code);
  }
}

// ========================================
// Caregivers
// ========================================

export async function getCaregiverByUser(userId: string): Promise<Caregiver | null> {
  const db = await getDB();
  
  try {
    const caregiver = await db.getFromIndex('caregivers', 'by-user', userId);
    return caregiver || null;
  } catch {
    return null;
  }
}

export async function getCaregiversForPet(petId: string): Promise<Caregiver[]> {
  const db = await getDB();
  const caregivers = await db.getAllFromIndex('caregivers', 'by-pet', petId);
  return caregivers.filter(c => c.is_active);
}

export async function getAllCaregivers(): Promise<Caregiver[]> {
  const db = await getDB();
  const caregivers = await db.getAll('caregivers');
  return caregivers.filter(c => c.is_active);
}

export async function updateCaregiverRole(
  caregiverId: string,
  newRole: CaregiverRole
): Promise<void> {
  const db = await getDB();
  const caregiver = await db.get('caregivers', caregiverId);
  
  if (caregiver) {
    caregiver.role = newRole;
    await db.put('caregivers', caregiver);
    console.log('[Family] Caregiver role updated:', caregiverId, newRole);
  }
}

export async function removeCaregiver(caregiverId: string): Promise<void> {
  const db = await getDB();
  const caregiver = await db.get('caregivers', caregiverId);
  
  if (caregiver) {
    caregiver.is_active = false;
    await db.put('caregivers', caregiver);
    console.log('[Family] Caregiver removed:', caregiverId);
  }
}

export async function trackCaregiverAccess(caregiverId: string): Promise<void> {
  const db = await getDB();
  const caregiver = await db.get('caregivers', caregiverId);
  
  if (caregiver) {
    caregiver.last_access = new Date().toISOString();
    await db.put('caregivers', caregiver);
  }
}

// ========================================
// List Invites
// ========================================

export async function getInvitesByOwner(ownerId: string): Promise<FamilyInvite[]> {
  const db = await getDB();
  const invites = await db.getAllFromIndex('invites', 'by-owner', ownerId);
  return invites.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getPendingInvites(ownerId: string): Promise<FamilyInvite[]> {
  const invites = await getInvitesByOwner(ownerId);
  return invites.filter(i => i.status === 'pending');
}

// ========================================
// Permissions Check
// ========================================

export function canEdit(role: CaregiverRole): boolean {
  return role === 'can_edit';
}

export function canView(role: CaregiverRole): boolean {
  return true; // All roles can view
}

export function isEmergencyContact(role: CaregiverRole): boolean {
  return role === 'emergency_contact';
}

// ========================================
// Cleanup Expired Invites
// ========================================

export async function cleanupExpiredInvites(): Promise<number> {
  const db = await getDB();
  const allInvites = await db.getAll('invites');
  let cleaned = 0;
  
  for (const invite of allInvites) {
    if (invite.status === 'pending' && new Date(invite.expires_at) < new Date()) {
      invite.status = 'expired';
      await db.put('invites', invite);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[Family] Cleaned up ${cleaned} expired invites`);
  }
  
  return cleaned;
}
