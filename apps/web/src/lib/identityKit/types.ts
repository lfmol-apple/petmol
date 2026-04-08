/**
 * Identity Kit - Sistema de Identidade Global do Pet
 * 
 * Gera 3 artefatos virais para aquisição:
 * 1. Pet Passport / Pet ID (1080x1920)
 * 2. Emergency QR Card (1080x1920)
 * 3. Missing Pet Poster (1080x1920)
 * 
 * Cada artefato tem marca d'água obrigatória com CTA para growth viral.
 */

export type IdentityKitTheme = 'classic' | 'cute' | 'neon';

export interface PetIdentityData {
  petId: string;
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed?: string;
  photoUrl: string;
  docCode: string; // Hash curto 8-10 chars para exibição
  issuedAt: string; // ISO date
  ownerContactAuthorized: boolean; // Se tutor autoriza mostrar contato no QR público
  preferredTheme?: IdentityKitTheme;
}

export interface PassportData extends PetIdentityData {
  mrzLine1: string; // Machine Readable Zone fake (entretenimento)
  mrzLine2: string;
}

export interface QRCardData extends PetIdentityData {
  qrUrl: string; // URL para https://petmol.app/p/{code}
  message?: string; // Mensagem customizada tipo "Se eu me perdi, escaneie"
}

export interface MissingPosterData extends PetIdentityData {
  qrUrl: string;
  lastSeenLocation?: string;
  lastSeenDate?: string; // ISO date
  reward?: string; // Opcional, texto livre
  contactInfo?: string; // Apenas se owner autorizar
}

export interface GeneratedArtifact {
  type: 'passport' | 'qr_card' | 'missing_poster';
  petId: string;
  theme: IdentityKitTheme;
  imageUri: string; // Local file URI
  width: number;
  height: number;
  generatedAt: string; // ISO date
  shareCount: number;
}

/**
 * Metadados do Identity Kit para analytics
 */
export interface IdentityKitEvent {
  event: 'identitykit_generated' | 'identitykit_shared' | 'identitykit_qr_scanned';
  type: 'passport' | 'qr_card' | 'missing_poster';
  theme: IdentityKitTheme;
  petId: string;
  country: string;
  locale: string;
  timestamp: string;
}
