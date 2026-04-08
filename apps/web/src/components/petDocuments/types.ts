import type { PetDocument } from '@/features/documents/types';

/** Vault view of a pet document — structurally identical to PetDocument. */
export type VaultPetDocument = PetDocument;

/** Minimal shape consumed by vault helper functions (duplicate detection, etc.). */
export interface VaultBatchDocItem {
  id: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
}
