/**
 * PETMOL - Tipos de Dados Híbridos (Local + Backend)
 * Baseado na análise dos reviews dos concorrentes
 */

// ========================================
// TUTOR (Backend)
// ========================================
export interface Tutor {
  id: string;
  name: string;
  email: string;
  phone?: string;
  cpf_hash?: string; // Hash do CPF, nunca texto puro
  created_at: string;
  updated_at: string;
}

// ========================================
// PET (Backend + Cache Local)
// ========================================
export interface Pet {
  id: string;
  tutor_id: string;
  name: string;
  species: 'dog' | 'cat' | 'bird' | 'other';
  breed?: string;
  birth_date?: string;
  weight_current?: number;
  weight_unit: 'kg' | 'lb';
  microchip?: string;
  gender?: 'male' | 'female';
  sterilized?: boolean;
  photo_url?: string;
  
  // Campos específicos baseados nos reviews
  ring_number?: string; // Para pássaros (anilha)
  heat_cycle_notes?: string; // Para fêmeas (cio)
  
  created_at: string;
  updated_at: string;
}

// ========================================
// VACINAS (Calendário inteligente)
// ========================================
export interface Vaccine {
  id: string;
  pet_id: string;
  type: 'rabies' | 'multiple' | 'leptospirosis' | 'parvovirus' | 'distemper' | 'adenovirus' | 'parainfluenza' | 'bordetella' | 'other';
  name: string;
  date_applied: string;
  next_due?: string;
  batch_number?: string;
  veterinarian?: string;
  clinic_name?: string;
  cost?: number;
  reminder_days: number; // Customizável (5, 10, 15 dias antes)
  notes?: string;
  
  // Attachments (fotos da carteira de vacinação)
  attachments: DocumentAttachment[];
  
  created_at: string;
  updated_at: string;
}

// ========================================
// MEDICAMENTOS (Horários flexíveis)
// ========================================
export interface Medication {
  id: string;
  pet_id: string;
  name: string;
  dosage: string;
  
  // Horários naturais (não matemáticos)
  frequency_type: 'daily' | 'custom' | 'as_needed';
  times_per_day?: number; // 1, 2, 3 vezes ao dia
  custom_times: string[]; // ['08:00', '16:00', '20:00'] - horários específicos
  
  start_date: string;
  end_date?: string;
  active: boolean;
  notes?: string;
  
  // Tracking de administração
  administered_doses: MedicationDose[];
  
  created_at: string;
  updated_at: string;
}

export interface MedicationDose {
  id: string;
  medication_id: string;
  scheduled_time: string;
  administered_time?: string;
  administered: boolean;
  notes?: string;
}

// ========================================
// HISTÓRICO MÉDICO (Prontuário completo)
// ========================================
export interface MedicalRecord {
  id: string;
  pet_id: string;
  type: 'visit' | 'exam' | 'surgery' | 'emergency' | 'routine' | 'weight' | 'other';
  date: string;
  title: string;
  description: string;
  veterinarian?: string;
  clinic_name?: string;
  cost?: number;
  
  // Anexos (receitas, exames, fotos)
  attachments: DocumentAttachment[];
  
  // Tags para organização
  tags: string[];
  
  created_at: string;
  updated_at: string;
}

// ========================================
// DOCUMENTOS/ANEXOS
// ========================================
export interface DocumentAttachment {
  id: string;
  filename: string;
  file_url?: string; // URL do backend (se sincronizado)
  file_data?: string; // Base64 local (se offline)
  file_type: 'image' | 'pdf' | 'document';
  file_size: number;
  description?: string;
  uploaded_at: string;
}

// ========================================
// HISTÓRICO DE PESO (Para filhotes)
// ========================================
export interface WeightRecord {
  id: string;
  pet_id: string;
  weight: number;
  weight_unit: 'kg' | 'lb';
  measured_at: string;
  notes?: string;
  created_at: string;
}

// ========================================
// SISTEMA HÍBRIDO (Cache + Sync)
// ========================================
export interface LocalCache {
  pets: Pet[];
  vaccines: Vaccine[];
  medications: Medication[];
  medical_records: MedicalRecord[];
  weight_records: WeightRecord[];
  documents: DocumentAttachment[];
  
  // Sync metadata
  last_sync: string;
  pending_sync: PendingAction[];
  offline_mode: boolean;
}

export interface PendingAction {
  id: string;
  action: 'create' | 'update' | 'delete';
  entity_type: 'pet' | 'vaccine' | 'medication' | 'medical_record' | 'weight_record' | 'document';
  entity_id: string;
  data: unknown;
  timestamp: string;
  retries: number;
}

// ========================================
// EXPORT (Nunca reter dados)
// ========================================
export interface ExportData {
  tutor: Tutor;
  pets: Pet[];
  vaccines: Vaccine[];
  medications: Medication[];
  medical_records: MedicalRecord[];
  weight_records: WeightRecord[];
  documents: DocumentAttachment[];
  exported_at: string;
  version: string;
}

// ========================================
// CONFIGURAÇÕES DO USUÁRIO
// ========================================
export interface UserSettings {
  notifications_enabled: boolean;
  reminder_days_default: number; // 7 dias antes por padrão
  weight_unit_preferred: 'kg' | 'lb';
  date_format: 'DD/MM/YYYY' | 'MM/DD/YYYY';
  language: string;
  offline_mode_preferred: boolean;
  backup_frequency: 'daily' | 'weekly' | 'monthly';
}