'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/I18nContext';

import { EditPetModal } from '@/components/EditPetModal';
import { AddPetModal } from '../../components/AddPetModal';
import { VaccineCardUpload } from '@/components/VaccineCardUpload';
import { HealthModal } from '@/components/home/HealthModal';
import { VaccineGuide } from '@/components/home/VaccineGuide';
import { VaccineWorkflowModals } from '@/components/home/VaccineWorkflowModals';
import { FeedbackModal } from '@/components/home/FeedbackModal';
import { QuickAddVaccineModal } from '@/components/home/QuickAddVaccineModal';
import { VetHistoryModal } from '@/components/home/VetHistoryModal';
import { HistoryDocumentsOverlay } from '@/components/home/HistoryDocumentsOverlay';
import { MedicalVaultModal } from '@/components/home/MedicalVaultModal';
import { HomeNavigationModals } from '@/components/home/HomeNavigationModals';
import { HomePetHeader } from '@/components/home/HomePetHeader';
import { PetTabs } from '@/components/PetTabs';

import { HomePetDashboard } from '@/components/home/HomePetDashboard';
import { PushActionSheet, type ActionSheetType } from '@/components/PushActionSheet';
import { ParasiteItemSheet } from '@/components/home/ParasiteItemSheet';
import { VaccineItemSheet } from '@/components/home/VaccineItemSheet';
import { MedicationItemSheet } from '@/components/home/MedicationItemSheet';
import { FoodItemSheet } from '@/components/home/FoodItemSheet';
import { GroomingItemSheet } from '@/components/home/GroomingItemSheet';
import { useMultipetInteractions } from '@/features/interactions/useMultipetInteractions';
import type { PetInteractionItem } from '@/features/interactions/types';
import { openHomeContextualCommerce, resolvePushActionSheetCommerceIntent } from '@/features/commerce/homeContextualCommerce';
// resolveAlertAction / navigateToPetHealthTab removidos — handleTopAttentionSelect abre sheets diretamente
import { useHomeItemSheetActions } from '@/features/interactions/useHomeItemSheetActions';
import { useHomeHistoryActions } from '@/features/interactions/useHomeHistoryActions';
import { resolveHomeDeepLinkDestination, resolvePushActionSheetFullDestination, type HomeSurfaceResolution } from '@/features/interactions/homeModalRouting';
import { useHomeModalUtilityActions } from '@/features/interactions/useHomeModalUtilityActions';
import { useHomeSurfaceActions } from '@/features/interactions/useHomeSurfaceActions';
import { useHomeInteractionCenter } from '@/features/interactions/useHomeInteractionCenter';
import { useHomeNotificationBridge } from '@/features/interactions/useHomeNotificationBridge';
import { useMasterInteractionRules } from '@/features/interactions/useMasterInteractionRules';
import { requestUserConfirmation, showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { trackV1Metric } from '@/lib/v1Metrics';
import { getPetCareCollections } from '@/features/pets/healthCollections';
import { usePetEventManagement } from '@/hooks/usePetEventManagement';
import { useVaccineCardWorkflow } from '@/hooks/useVaccineCardWorkflow';

import { hasCompletedOnboarding } from '@/lib/ownerProfile';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { useAuth } from '@/contexts/AuthContext';
import { petMolAPI } from '@/lib/api-client';
import { normalizeBackendPetProfiles, resolveBackendPetPhoto } from '@/lib/backendPetProfile';
import {
  mapNomeComercialToTipo,
  mapTipoVacinaToVaccineType,
  type VaccineCardOcrRecord,
} from '@/lib/vaccineOcr';
import {
  applyLearningToOcrRecords,
  learnFromCorrections,
  type VaccineOcrRecordLike,
} from '@/lib/vaccineLearning';
import {
  type GroomingRecord,

  type GroomingType,
  type ParasiteControl,
  type ParasiteControlType,
  type PlaceDetails,
} from '@/lib/types/home';
import type {
  DocFolderModalState,
  FeedingPlanEntry,
  GroomingFormData,
  ParasiteFormData,
  VaccineFormData,
  VetHistoryDocument,
} from '@/lib/types/homeForms';
import { 
  type PetHealthProfile,
  type VaccineRecord,
  type VaccineType
} from '@/lib/petHealth';
import { latestVaccinePerGroup } from '@/lib/vaccineUtils';

// Funções de gerenciamento de vacinas com backend
const updateVaccine = async (petId: string, vaccineId: string, updates: Partial<VaccineRecord>): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    // Map frontend VaccineRecord fields → backend VaccineRecordUpdate schema
    const payload: Record<string, unknown> = {};
    if (updates.vaccine_name) payload.vaccine_name = updates.vaccine_name;
    if (updates.date_administered) payload.applied_date = updates.date_administered;
    if (updates.next_dose_date !== undefined) payload.next_dose_date = updates.next_dose_date || null;
    if (updates.notes !== undefined) payload.notes = updates.notes || null;

    const response = await fetch(`${API_BASE_URL}/vaccines/${vaccineId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${savedToken}`,
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch (error) {
    console.error('Erro ao atualizar vacina:', error);
    return false;
  }
};

const deleteVaccine = async (_petId: string, vaccineId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    const response = await fetch(`${API_BASE_URL}/vaccines/${vaccineId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });

    // 204 No Content = success
    return response.ok || response.status === 204;
  } catch (error) {
    console.error('Error deleting vaccine:', error);
    return false;
  }
};

/**
 * Remove TODAS as vacinas de um pet de forma atômica
 * Operação única no backend para evitar race conditions
 */
const clearAllVaccines = async (petId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;

    // Fetch current vaccine IDs from the real table
    const listRes = await fetch(`${API_BASE_URL}/pets/${petId}/vaccines`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    if (!listRes.ok) return false;

    const list: { id: string }[] = await listRes.json();
    if (list.length === 0) return true;

    // Delete each vaccine via the real endpoint in parallel
    const results = await Promise.all(
      list.map((v) =>
        fetch(`${API_BASE_URL}/vaccines/${v.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${savedToken}` },
        })
      )
    );

    return results.every((r) => r.ok || r.status === 204);
  } catch (error) {
    console.error('Error clearing all vaccines:', error);
    return false;
  }
};

const getHealthProfile = async (petId: string): Promise<PetHealthProfile | null> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return null;

    const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    
    if (!response.ok) return null;
    
    const pet = await response.json();
    const healthData = pet.health_data || {};
    
    return {
      pet_id: String(pet.id),
      pet_name: pet.name,
      species: pet.species,
      breed: pet.breed,
      photo: resolveBackendPetPhoto(pet),
      birthdate: pet.birth_date,
      weight_kg: pet.weight,
      vaccines: healthData.vaccines || [],
      exams: healthData.exams || [],
      prescriptions: healthData.prescriptions || [],
      appointments: healthData.appointments || [],
      surgeries: healthData.surgeries || [],
      allergies: healthData.allergies || [],
      daily_walks: healthData.daily_walks || [],
      chronic_conditions: healthData.chronic_conditions || [],
      dental_records: healthData.dental_records || [],
      parasite_history: healthData.parasite_history || [],
      documents: healthData.documents || [],
      weight_history: healthData.weight_history || [],
      parasite_controls: healthData.parasite_controls || [], // ADICIONADO
      grooming_records: healthData.grooming_records || [], // ADICIONADO
      primary_vet: healthData.primary_vet || undefined,
      insurance_provider: pet.insurance_provider || undefined,
      owner_user_id: pet.user_id || undefined,
      created_at: pet.created_at || new Date().toISOString(),
      updated_at: pet.updated_at || new Date().toISOString(),
      health_data: healthData, // Incluir health_data completo
    } as PetHealthProfile;
  } catch (error) {
    console.error('Erro ao buscar perfil de saúde:', error);
    return null;
  }
};

// Funções de gerenciamento de vermífugos/antiparasitários
const generateParasiteId = () => `par_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const addParasiteControl = async (petId: string, control: Partial<ParasiteControl>): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('⚠️ Sessão expirada. Faça login novamente.');
      return false;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
      body: JSON.stringify({
        type: control.type,
        product_name: control.product_name,
        date_applied: control.date_applied,
        next_due_date: control.next_due_date || null,
        frequency_days: control.frequency_days ?? 30,
        dosage: control.dosage || null,
        application_form: control.application_form || null,
        veterinarian: control.veterinarian || null,
        cost: control.cost ?? null,
        purchase_location: control.purchase_location || null,
        collar_expiry_date: control.collar_expiry_date || null,
        reminder_enabled: control.reminder_enabled ?? true,
        reminder_days: control.reminder_days ?? control.alert_days_before ?? 7,
        alert_days_before: control.alert_days_before ?? null,
        notes: control.notes || null,
      }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [PARASITE] Erro ao salvar: ${res.status}`, errorText);
      return false;
    }

    if (control.type === 'dewormer') {
      trackV1Metric('worm_control_created', {
        pet_id: petId,
        product_name: control.product_name ?? null,
      });
      trackV1Metric('worm_control_applied', {
        pet_id: petId,
        product_name: control.product_name ?? null,
        next_due_date: control.next_due_date ?? null,
      });
    }

    if (control.type === 'flea_tick') {
      trackV1Metric('flea_control_created', {
        pet_id: petId,
        product_name: control.product_name ?? null,
      });
      trackV1Metric('flea_control_applied', {
        pet_id: petId,
        product_name: control.product_name ?? null,
        next_due_date: control.next_due_date ?? null,
      });
    }

    if (control.type === 'collar') {
      trackV1Metric('collar_created', {
        pet_id: petId,
        product_name: control.product_name ?? null,
        next_due_date: control.collar_expiry_date ?? null,
      });
    }

    return true;
  } catch (error) {
    console.error('❌ [PARASITE] ERRO CRÍTICO:', error);
    return false;
  }
};

const updateParasiteControl = async (petId: string, controlId: string, updates: Partial<ParasiteControl>): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;
    // Sanitize: convert empty strings to null for optional datetime/string fields
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      sanitized[k] = (v === '' || v === undefined) ? null : v;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${controlId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
      body: JSON.stringify(sanitized),
    });
    if (!res.ok) {
      console.error('Erro ao atualizar controle de parasitas:', res.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Erro ao atualizar controle de parasitas:', error);
    return false;
  }
};

const deleteParasiteControl = async (petId: string, controlId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites/${controlId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    return res.ok;
  } catch (error) {
    return false;
  }
};

// ===== Funções de Grooming (Banho e Tosa) =====
const addGroomingRecord = async (petId: string, record: GroomingRecord): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('⚠️ Sessão expirada. Por favor, faça login novamente para salvar os dados.');
      return false;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
      body: JSON.stringify({
        type: record.type,
        date: record.date,
        scheduled_time: record.scheduled_time || null,
        location: record.location || null,
        location_address: record.location_address || null,
        location_phone: record.location_phone || null,
        location_place_id: record.location_place_id || null,
        groomer: record.groomer || null,
        cost: record.cost ?? null,
        notes: record.notes || null,
        next_recommended_date: record.next_recommended_date || null,
        frequency_days: record.frequency_days ?? null,
        reminder_enabled: record.reminder_enabled ?? true,
        alert_days_before: record.alert_days_before ?? null,
      }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [GROOMING] Erro ao salvar: ${res.status}`, errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ [GROOMING] ERRO CRÍTICO ao adicionar registro:', error);
    return false;
  }
};

const updateGroomingRecord = async (petId: string, recordId: string, updates: Partial<GroomingRecord>): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) {
      showBlockingNotice('⚠️ Sessão expirada. Faça login novamente.');
      return false;
    }
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${recordId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [GROOMING UPDATE] Erro ao atualizar: ${res.status}`, errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ [GROOMING UPDATE] ERRO CRÍTICO:', error);
    return false;
  }
};

const deleteGroomingRecord = async (petId: string, recordId: string): Promise<boolean> => {
  try {
    const savedToken = getToken();
    if (!savedToken) return false;
    const res = await fetch(`${API_BASE_URL}/pets/${petId}/grooming/${recordId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${savedToken}` },
    });
    return res.ok;
  } catch (error) {
    console.error('Erro ao deletar registro de grooming:', error);
    return false;
  }
};

// Helper para converter caminho de foto em URL com cache busting
const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || API_BASE_URL;
const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'petshopbh.com', 'petshopbh.com.br', 'localhost'];
const isOwnHost = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return OWN_PHOTO_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  } catch { return false; }
};

const resolvePhotosBase = (): string => {
  const configured = String(PHOTOS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

const getPhotoUrl = (photoPath: string | undefined | null, petId?: string, photoTimestamps?: Record<string, number>): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  // URLs http externas: proxy para evitar CORS em dev
  if (photoPath.startsWith('http')) {
    if (isOwnHost(photoPath)) return photoPath; // nosso domínio — sem proxy
    return `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }
  // Caminho relativo — normaliza formatos: pets/*, uploads/*, /uploads/*
  const photosBase = resolvePhotosBase();
  const timestamp = petId && photoTimestamps?.[petId] ? `?t=${photoTimestamps[petId]}` : '';
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${photosBase}${path}${timestamp}`;
};

export default function HomePage() {
  const router = useRouter();
  const [forceCheckin, setForceCheckin] = useState(false);
  const deepLinkHandledRef = useRef(false);
  // Ref que sempre aponta para a função de refresh mais recente (evita closure stale no event listener)
  const refreshAllRef = useRef<() => void>(() => {});

  // Check-up inicial banner
  const [checkupBanner, setCheckupBanner] = useState<{ petName: string; pendingCount: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem('petmol_checkup_dismissed')) return;
    const raw = localStorage.getItem('petmol_checkup_v1');
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Record<string, string>;
      const pending = ['vaccines', 'vermifugo', 'antipulgas', 'food'].filter((k) => s[k] !== 'done' && s[k] !== 'skipped' && s[k] !== 'none').length;
      if (pending > 0) setCheckupBanner({ petName: s.petName || 'seu pet', pendingCount: pending });
    } catch {}
  }, []);

  // Pull-to-refresh
  const pullStartYRef = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { t, locale } = useI18n();
  const { tutor, token, isLoading, isAuthenticated } = useAuth();

  // Ler ?checkin=1 da URL (vindo de notificação push — app estava fechado)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkin') === '1') setForceCheckin(true);
  }, []);

  // FORÇA: Se tem tutor logado, carregar pets e decidir se mostra onboarding
  useEffect(() => {
    const forceLoadPets = async () => {
      if (tutor && tutor.email) {
        console.log('[FORÇA] Usuário logado detectado:', tutor.email);
        setIsChecking(false);
        
        try {
          const savedToken = getToken();
          const response = await fetch(`${API_BASE_URL}/pets`, {
            credentials: 'include',
            headers: savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {},
          });
          
          // Busca nome do tutor
          try {
            const savedToken2 = getToken();
            const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
              credentials: 'include',
              headers: savedToken2 ? { 'Authorization': `Bearer ${savedToken2}` } : {},
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              setTutorName(meData.name || '');
              if (meData.id) setLoggedUserId(meData.id);
              // fire-and-forget: dispara push para itens vencidos ao abrir o app
              const _tok = getToken();
              if (_tok) {
                fetch(`${API_BASE_URL}/notifications/send-on-open`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'Authorization': `Bearer ${_tok}` },
                }).catch(() => {});
              }
              if (typeof meData.monthly_checkin_day === 'number') {
                setTutorCheckinDay(meData.monthly_checkin_day);
              }
              if (typeof meData.monthly_checkin_hour === 'number') {
                setTutorCheckinHour(meData.monthly_checkin_hour);
              }
              if (typeof meData.monthly_checkin_minute === 'number') {
                setTutorCheckinMinute(meData.monthly_checkin_minute);
              }
              // family: silenciado até relancamento
              // try { await fetch(`${API_BASE_URL}/family/status`, ...) } catch {}
            }
          } catch (_) {}

          if (response.ok) {
            const backendPets = await response.json();
            console.log('[FORÇA] Pets encontrados:', backendPets.length);
            const convertedPets = normalizeBackendPetProfiles(backendPets);
            
            setPets(convertedPets);
            if (convertedPets.length > 0) {
              setSelectedPetId(convertedPets[0].pet_id);
              console.log('[FORÇA] Pets carregados:', convertedPets.map((p: PetHealthProfile) => p.pet_name));
            } else {
              console.log('[FORÇA] Nenhum pet encontrado — redirecionando para cadastro');
              router.push('/register-pet');
            }
          } else {
            // 401/403 = token inválido/vencido → login; outros erros = cadastro
            if (response.status === 401 || response.status === 403) {
              router.replace('/login');
            } else {
              router.push('/register-pet');
            }
          }
        } catch (error) {
          console.error('[FORÇA] Erro ao carregar pets:', error);
          router.replace('/login');
        }
      }
    };

    forceLoadPets();
  }, [tutor]);

  const [isChecking, setIsChecking] = useState(false);
  const [pets, setPets] = useState<PetHealthProfile[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [tutorName, setTutorName] = useState<string>('');
  const [loggedUserId, setLoggedUserId] = useState<string>('');
  const [familyOwnerNames, setFamilyOwnerNames] = useState<Record<string, string>>({});
  const [tutorCheckinDay, setTutorCheckinDay] = useState<number>(5);
  const [tutorCheckinHour, setTutorCheckinHour] = useState<number>(9);
  const [tutorCheckinMinute, setTutorCheckinMinute] = useState<number>(0);
  const [photoTimestamps, setPhotoTimestamps] = useState<Record<string, number>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPetInitialSection, setEditPetInitialSection] = useState<'food' | 'grooming' | undefined>(undefined);
  const [pushActionSheet, setPushActionSheet] = useState<{ type: ActionSheetType; itemName?: string; eventId?: string } | null>(null);
  const pushActionSheetWasOpenRef = useRef(false);
  const editModalWasOpenRef = useRef(false);
  const vaccineSheetWasOpenRef = useRef(false);
  const [showAddPetModal, setShowAddPetModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [healthModalMode, setHealthModalMode] = useState<'full' | 'health' | 'grooming' | 'food'>('full');
  const [healthActiveTab, setHealthActiveTab] = useState('vaccines');
  // Feeding plan por pet — API-first para o chip de ração aparecer em todos os dispositivos
  const [feedingPlan, setFeedingPlan] = useState<Record<string, FeedingPlanEntry>>({});
  // Quick-mark medicação inline
  const [quickMarkId,      setQuickMarkId]      = useState<string | null>(null);
  const [quickMarkDate,    setQuickMarkDate]    = useState('');
  const [quickMarkNotes,   setQuickMarkNotes]   = useState('');
  const [quickMarkSaving,  setQuickMarkSaving]  = useState(false);
  const [quickMarkToast,   setQuickMarkToast]   = useState<string | null>(null);
  const [vaccineFiles, setVaccineFiles] = useState<File[]>([]);
  const [showVetHistoryModal, setShowVetHistoryModal] = useState(false);
  const [historicoTab, setHistoricoTab] = useState<'resumo' | 'detalhado'>('detalhado');
  const [showDocUploadInHistorico, setShowDocUploadInHistorico] = useState(false);
  const [vetHistoryDocs, setVetHistoryDocs] = useState<VetHistoryDocument[]>([]);
  const [docFolderModal, setDocFolderModal] = useState<DocFolderModalState>(null);
  const [showVetOptionsModal, setShowVetOptionsModal] = useState(false);
  const [showServiceTypeModal, setShowServiceTypeModal] = useState(false);
  const [showHealthOptionsModal, setShowHealthOptionsModal] = useState(false);
  const [showEventTypeModal, setShowEventTypeModal] = useState(false);
  const [eventTypeLocked, setEventTypeLocked] = useState(false);
  const [showPetSelector, setShowPetSelector] = useState(false);
  const [vaccines, setVaccines] = useState<VaccineRecord[]>([]);
  const [showVaccineForm, setShowVaccineForm] = useState(false);
  const [vaccineFormSaving, setVaccineFormSaving] = useState(false);
  const [importVaccineLoading, setImportVaccineLoading] = useState(false);
  const [showQuickAddVaccine, setShowQuickAddVaccine] = useState(false);
  const [showAllVaccinesGuide, setShowAllVaccinesGuide] = useState(false);
  const [showAIUpload, setShowAIUpload] = useState(false);
  const [editingVaccine, setEditingVaccine] = useState<VaccineRecord | null>(null);
  const [showMedicalVault, setShowMedicalVault] = useState(false);
  
  // Sistema de Feedback e Aprendizado
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackVaccine, setFeedbackVaccine] = useState<VaccineRecord | null>(null);
  const [feedbackFormData, setFeedbackFormData] = useState({
    field_corrected: 'name' as 'name' | 'type' | 'date_administered' | 'next_dose_date' | 'veterinarian' | 'brand',
    original_value: '',
    corrected_value: '',
    user_comment: ''
  });
  
  // Estado para vermífugos/antiparasitários
  const [parasiteControls, setParasiteControls] = useState<ParasiteControl[]>([]);
  const [showParasiteForm, setShowParasiteForm] = useState(false);
  const [editingParasite, setEditingParasite] = useState<ParasiteControl | null>(null);
  const [parasiteFormData, setParasiteFormData] = useState<ParasiteFormData>({
    type: 'dewormer' as ParasiteControlType,
    product_name: '',
    date_applied: '',
    frequency_days: 90, // Padrão Brasil: 3 meses para vermífugo
    application_form: 'oral' as 'oral' | 'topical' | 'collar' | 'injection',
    dosage: '',
    veterinarian: '',
    cost: 0,
    notes: '',
    collar_expiry_date: '',
    alert_days_before: 7, // Padrão: 7 dias de antecedência
    purchase_location: '', // Onde foi comprado
    reminder_enabled: true // Lembrete ativado por padrão
  });
  
  const [showTopAttentionModal, setShowTopAttentionModal] = useState(false);
  const [showCheckinPicker, setShowCheckinPicker] = useState(false);
  const [checkinDayDraft, setCheckinDayDraft] = useState<number>(5);
  const [checkinPickerSaving, setCheckinPickerSaving] = useState(false);
  const {
    petEvents,
    eventsLoading,
    eventFormData,
    setEventFormData,
    eventSaving,
    setEventSaving,
    createdEventId,
    setCreatedEventId,
    showAttachDoc,
    setShowAttachDoc,
    attachDocFiles,
    setAttachDocFiles,
    editingEventId,
    setEditingEventId,
    fetchPetEvents,
    handleDeleteEvent,
    openEditEvent,
  } = usePetEventManagement({
    selectedPetId,
    healthActiveTab,
    setHealthActiveTab,
    setShowVetHistoryModal,
    setShowHealthModal,
    setEventTypeLocked,
  });
  const {
    showImportCard,
    setShowImportCard,
    importingCard,
    setImportingCard,
    pendingCardFiles,
    setPendingCardFiles,
    aiImageLimit,
    setAiImageLimit,
    cardAnalysis,
    cardFiles,
    reviewRegistros,
    setReviewRegistros,
    reviewExpectedCount,
    setReviewExpectedCount,
    reviewConfirmed,
    setReviewConfirmed,
    reviewLearnEnabled,
    setReviewLearnEnabled,
    rawRegistros,
    setRawRegistros,
    closeCardAnalysis,
    updateReviewRegistro,
    removeReviewRegistro,
    addReviewRegistro,
    handleFilesSelectedAppend,
    handleProcessCards,
  } = useVaccineCardWorkflow({
    petName: pets.find((pet) => pet.pet_id === selectedPetId)?.pet_name || pets[0]?.pet_name,
    ocrErrorMessage: t('feedback.ocr_error'),
    ocrRetryMessage: t('feedback.try_again_clearer'),
  });
  
  // Estado para controle de higiene (banho e tosa)
  const [groomingRecords, setGroomingRecords] = useState<GroomingRecord[]>([]);
  const [editingGrooming, setEditingGrooming] = useState<GroomingRecord | null>(null);
  const [showEditGroomingModal, setShowEditGroomingModal] = useState(false);
  const [groomingDueAlerts, setGroomingDueAlerts] = useState<{petName: string; type: string; daysOverdue: number}[]>([]);
  const [groomingFormData, setGroomingFormData] = useState<GroomingFormData>({
    type: 'bath' as GroomingType,
    date: localTodayISO(),
    scheduled_time: '',
    location: '',
    location_address: '',
    location_phone: '',
    location_place_id: '',
    cost: 0,
    notes: '',
    frequency_days: 14,
    reminder_enabled: true,
    alert_days_before: 3
  });
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceDetails[]>([]);
  const [showPlaceSuggestions, setShowPlaceSuggestions] = useState(false);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [placeSearchTimeout, setPlaceSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const placeAbortController = useRef<AbortController | null>(null);

  // ── Sheets modernos ──────────────────────────────────────────────────────
  const [showVermifugoSheet, setShowVermifugoSheet] = useState(false);
  const [showAntipulgasSheet, setShowAntipulgasSheet] = useState(false);
  const [showColeiraSheet, setShowColeiraSheet] = useState(false);
  const [showBanhoTosaSheet, setShowBanhoTosaSheet] = useState(false);
  const [showVaccineSheet, setShowVaccineSheet] = useState(false);
  const [showMedicationSheet, setShowMedicationSheet] = useState(false);
  const [showFoodSheet, setShowFoodSheet] = useState(false);

  // Estado para simulação de chegada em estabelecimento
  const [showArrivalAlert, setShowArrivalAlert] = useState(false);
  const [arrivalPlace, setArrivalPlace] = useState<{name: string, address: string, phone?: string, rating?: number, reviews?: number} | null>(null);
  const [showAttendanceOptions, setShowAttendanceOptions] = useState(false);
  
  // Helper para criar data local a partir de string YYYY-MM-DD
  // Evita problema de timezone onde new Date('2026-01-27') vira 2026-01-26
  const createLocalDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Helper para pegar o pet atual
  const getCurrentPet = () => pets.find(p => p.pet_id === selectedPetId) || pets[0];

  // Helper para formatar data e hora no estilo iPhone
  const formatDateTimeReminder = (dateStr: string, timeStr?: string) => {
    const date = createLocalDate(dateStr);
    const dateFormatted = date.toLocaleDateString(locale);
    
    if (timeStr) {
      return `${dateFormatted} ${t('common.at')} ${timeStr}`;
    }
    return dateFormatted;
  };

  // Informações educacionais sobre cada tipo de vacina
  const vaccineInfo: Record<VaccineType, {description: string, protects: string[], frequency: string, importance: string}> = {
    'multiple': {
      description: 'Vacina polivalente que protege contra múltiplas doenças em uma única aplicação. Essencial para todos os cães.',
      protects: ['Cinomose (vírus que afeta sistema nervoso)', 'Parvovirose (vírus intestinal grave)', 'Hepatite infecciosa canina', 'Adenovírus tipo 2 (tosse)', 'Parainfluenza (gripe)', 'Leptospirose (4 cepas - afeta rins e fígado)'],
      frequency: 'Anual (reforço a cada 12 meses)',
      importance: '🔴 OBRIGATÓRIA - Essencial para a saúde do pet'
    },
    'rabies': {
      description: 'Vacina obrigatória por lei que protege contra a raiva, doença viral fatal transmitida por mordidas de animais infectados. Pode ser transmitida para humanos.',
      protects: ['Raiva (doença viral fatal que afeta sistema nervoso central)'],
      frequency: 'Anual (reforço a cada 12 meses)',
      importance: '🔴 OBRIGATÓRIA POR LEI - Fatal se não tratada'
    },
    'leptospirosis': {
      description: 'Protege contra bactéria transmitida pela urina de ratos em água parada ou solo contaminado. Pode afetar humanos (zoonose).',
      protects: ['Leptospirose (4 sorovares: Canicola, Icterohaemorrhagiae, Grippotyphosa, Pomona)'],
      frequency: 'Semestral ou Anual (em áreas urbanas a cada 6 meses)',
      importance: '🟡 MUITO RECOMENDADA - Especialmente em áreas urbanas'
    },
    'kennel_cough': {
      description: 'Protege contra tosse altamente contagiosa em ambientes com muitos cães (creches, hotéis, parques). Aplicada via intranasal ou injetável.',
      protects: ['Bordetella bronchiseptica (bactéria da tosse dos canis)', 'Parainfluenza (componente viral)'],
      frequency: 'Anual ou semestral para cães em creches',
      importance: '🟡 RECOMENDADA - Obrigatória em creches e hotéis'
    },
    'giardia': {
      description: 'Protege contra parasita intestinal microscópico que causa diarreia crônica. Comum em filhotes e ambientes coletivos.',
      protects: ['Giardia lamblia (protozoário intestinal)'],
      frequency: 'Anual, com 2 doses iniciais',
      importance: '🟢 OPCIONAL - Recomendada para ambientes coletivos'
    },
    'coronavirus': {
      description: 'Protege contra coronavírus canino que causa gastroenterite (diferente do COVID-19 humano). Mais grave em filhotes.',
      protects: ['Coronavírus Canino (CCoV - causa diarreia)'],
      frequency: 'Anual',
      importance: '🟢 OPCIONAL - Mais importante em filhotes'
    },
    'influenza': {
      description: 'Protege contra gripe canina altamente contagiosa. Importante para cães que frequentam creches, parques e exposições.',
      protects: ['Influenza Canina H3N8', 'Influenza Canina H3N2'],
      frequency: 'Anual',
      importance: '🟡 RECOMENDADA - Para cães socializados'
    },
    'lyme': {
      description: 'Protege contra doença transmitida por carrapatos infectados. Importante em áreas de mata e fazendas.',
      protects: ['Borreliose (Doença de Lyme) - causa artrite e problemas renais'],
      frequency: 'Anual, com 2 doses iniciais',
      importance: '🟢 OPCIONAL - Recomendada em áreas rurais'
    },
    'parainfluenza': {
      description: 'Protege contra vírus respiratório altamente contagioso. Normalmente incluída na V8/V10.',
      protects: ['Parainfluenza canina (infecção respiratória leve a moderada)'],
      frequency: 'Geralmente incluída na V8/V10',
      importance: '🟡 INCLUÍDA - Faz parte da vacina múltipla'
    },
    'adenovirus': {
      description: 'Protege contra vírus que causa hepatite e problemas respiratórios. Normalmente incluída na V8/V10.',
      protects: ['Adenovírus tipo 1 (hepatite)', 'Adenovírus tipo 2 (tosse e pneumonia)'],
      frequency: 'Geralmente incluída na V8/V10',
      importance: '🟡 INCLUÍDA - Faz parte da vacina múltipla'
    },
    'hepatitis': {
      description: 'Protege contra hepatite infecciosa canina causada por adenovírus. Normalmente incluída na V8/V10.',
      protects: ['Hepatite Infecciosa Canina (afeta fígado, rins e olhos)'],
      frequency: 'Geralmente incluída na V8/V10',
      importance: '🟡 INCLUÍDA - Faz parte da vacina múltipla'
    },
    'leishmaniasis': {
      description: '⚠️ VACINA DESCONTINUADA - A vacina contra leishmaniose (LeishTec/Leishmune) foi descontinuada no Brasil. Atualmente, a prevenção é feita com coleiras repelentes, pipetas e medicamentos preventivos.',
      protects: ['Nota: Foco em prevenção com repelentes (coleira Scalibor, Advantix) e acompanhamento veterinário'],
      frequency: 'N/A - Vacina não disponível',
      importance: '⚠️ DESCONTINUADA - Use coleira repelente'
    },
    'distemper': {
      description: 'Protege contra cinomose, doença viral grave que afeta múltiplos sistemas. Normalmente incluída na V8/V10.',
      protects: ['Vírus da Cinomose (afeta sistema nervoso, respiratório e digestivo)'],
      frequency: 'Geralmente incluída na V8/V10',
      importance: '🔴 INCLUÍDA - Faz parte da vacina múltipla'
    },
    'parvovirus': {
      description: 'Protege contra parvovirose, doença viral intestinal grave e altamente contagiosa. Normalmente incluída na V8/V10.',
      protects: ['Parvovírus Canino (causa diarreia hemorrágica grave)'],
      frequency: 'Geralmente incluída na V8/V10',
      importance: '🔴 INCLUÍDA - Faz parte da vacina múltipla'
    },
    'bordetella': {
      description: 'Protege contra tosse dos canis (Bordetella). Geralmente incluída na vacina de Tosse dos Canis.',
      protects: ['Bordetella bronchiseptica (bactéria respiratória)'],
      frequency: 'Anual ou semestral',
      importance: '🟡 INCLUÍDA - Geralmente com Tosse dos Canis'
    },
    'feline_leukemia': {
      description: 'Vacina para gatos que protege contra leucemia felina, doença viral que compromete o sistema imunológico.',
      protects: ['Vírus da Leucemia Felina (FeLV)'],
      frequency: 'Anual, após 2 doses iniciais',
      importance: '🔴 ESSENCIAL - Para gatos com acesso externo'
    },
    'feline_distemper': {
      description: 'Vacina polivalente V3/V4/V5 para gatos. Protege contra as principais doenças virais felinas.',
      protects: ['Panleucopenia Felina', 'Rinotraqueíte', 'Calicivirose', 'Clamidiose (V4/V5)'],
      frequency: 'Anual',
      importance: '🔴 OBRIGATÓRIA - Essencial para todos os gatos'
    },
    'other': {
      description: 'Outras vacinas específicas conforme orientação veterinária (ex: leishmaniose em áreas endêmicas).',
      protects: ['Consulte seu veterinário para vacinas específicas da sua região'],
      frequency: 'Conforme orientação veterinária',
      importance: '🟢 CONSULTE - Depende da região e estilo de vida'
    }
  };
  
  const [vaccineFormData, setVaccineFormData] = useState<VaccineFormData>({
    vaccine_type: 'multiple' as VaccineType,
    vaccine_name: '',
    date_administered: '',
    next_dose_date: '',
    frequency_days: 365,
    veterinarian: '',
    notes: '',
    alert_days_before: 3,
    reminder_time: '09:00',
  });

  // Carregar pets e dados do tutor do backend
  useEffect(() => {
    const loadPets = async () => {
      // Usar token do contexto ao invés de localStorage
      if (!token) {
        // Não redirecionar se ainda estiver carregando
        if (!isLoading) {
          router.replace('/login');
        }
        return;
      }

      localStorage.removeItem('petmol_pets');
      localStorage.removeItem('pet_health_profiles');
      localStorage.removeItem('petmol_cached_pets');

      try {
        // Buscar dados do tutor
        const tutorResponse = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: 'include', // Incluir cookies
          headers: token ? {
            'Authorization': `Bearer ${token}`,
          } : {},
        });
        
        if (tutorResponse.ok) {
          const tutorData = await tutorResponse.json();
          setTutorName(tutorData.name || '');
          if (typeof tutorData.monthly_checkin_day === 'number') {
            setTutorCheckinDay(tutorData.monthly_checkin_day);
          }
          if (typeof tutorData.monthly_checkin_hour === 'number') {
            setTutorCheckinHour(tutorData.monthly_checkin_hour);
          }
          if (typeof tutorData.monthly_checkin_minute === 'number') {
            setTutorCheckinMinute(tutorData.monthly_checkin_minute);
          }
        }

        // Buscar pets
        const response = await fetch(`${API_BASE_URL}/pets`, {
          credentials: 'include', // Incluir cookies
          ...(token && {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }),
        });
        
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            router.replace('/login');
            return;
          }
          throw new Error('Erro ao carregar pets');
        }

        const backendPets = await response.json();
        console.log('[LoadPets] Pets do backend:', backendPets);
        console.log('[LoadPets] Número de pets recebidos:', backendPets.length);
        
        // Converter formato backend para frontend
        const convertedPets = normalizeBackendPetProfiles(backendPets);
        
        convertedPets.sort((a, b) => {
          const aName = (a.pet_name || '').toLowerCase();
          const bName = (b.pet_name || '').toLowerCase();
          if (aName === 'baby') return -1;
          if (bName === 'baby') return 1;
          return 0;
        });
        setPets(convertedPets);
        if (convertedPets.length > 0) {
          console.log('[LoadPets] SUCESSO - Carregados', convertedPets.length, 'pets');
          if (!selectedPetId) {
            setSelectedPetId(convertedPets[0].pet_id);
          }
        } else {
          console.log('[LoadPets] Nenhum pet — redirecionando para cadastro');
          router.push('/register-pet');
        }
        setIsChecking(false);
      } catch (error) {
        console.error('[LoadPets] ERRO ao carregar pets do backend:', error);
        setPets([]);
        router.replace('/login');
        setIsChecking(false);
      }
    };
    
    loadPets();
  }, [isAuthenticated, token, API_BASE_URL]);

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('petmol_token');
    window.location.href = '/login';
  };

  // Salvar pet editado
  const handleSavePet = async (
    updatedPet: Partial<PetHealthProfile> & {
      pet_id: string;
      name?: string;
      is_neutered?: boolean;
      weight?: number;
      _photoUpdated?: boolean;
      insurance_provider?: string;
      health_data?: Record<string, unknown>;
      primary_vet?: { name: string; clinic: string; phone: string };
    }
  ) => {
    try {
      const savedToken = getToken();
      if (!savedToken) {
        showBlockingNotice('Você precisa estar logado para editar pets');
        return;
      }

      const petId = updatedPet.pet_id; // UUID string, não parseInt
      
      // Preparar health_data com primary_vet
      const healthData = {
        ...(updatedPet.health_data || {}),
        primary_vet: updatedPet.primary_vet || { name: '', clinic: '', phone: '' }
      };
      
      // Salvar APENAS no backend
      const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${savedToken}`,
        },
        body: JSON.stringify({
          name: updatedPet.pet_name || updatedPet.name,
          species: updatedPet.species,
          breed: updatedPet.breed,
          birth_date: updatedPet.birth_date,
          sex: updatedPet.sex,
          neutered: updatedPet.neutered !== undefined ? updatedPet.neutered : updatedPet.is_neutered,
          weight_value: updatedPet.weight || updatedPet.weight_history?.[0]?.weight,
          health_data: healthData,
          insurance_provider: updatedPet.insurance_provider || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar pet');
      }

      // Recarregar pets do backend
      const petsResponse = await fetch(`${API_BASE_URL}/pets`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (petsResponse.ok) {
        const backendPets = await petsResponse.json();
        const convertedPets = normalizeBackendPetProfiles(backendPets);
        setPets(convertedPets);
        
        // Atualizar timestamp da foto para forçar reload se foto foi atualizada
        if (updatedPet._photoUpdated && updatedPet.pet_id) {
          setPhotoTimestamps(prev => ({
            ...prev,
            [updatedPet.pet_id]: Date.now()
          }));
        }
      }
    } catch (error) {
      console.error('Erro ao salvar pet:', error);
      showBlockingNotice(t('pet.error_save'));
      throw error;
    }
  };

  const handleDeletePet = async (petId: string) => {
    try {
      const savedToken = getToken();
      if (!savedToken) {
        showBlockingNotice('Você precisa estar logado para excluir pets');
        return;
      }

      // Deletar APENAS do banco de dados
      const response = await fetch(`${API_BASE_URL}/pets/${petId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao deletar pet');
      }

      // Recarregar pets do banco
      const petsResponse = await fetch(`${API_BASE_URL}/pets`, {
        headers: {
          'Authorization': `Bearer ${savedToken}`,
        },
      });

      if (petsResponse.ok) {
        const backendPets = await petsResponse.json();
        const convertedPets = normalizeBackendPetProfiles(backendPets);
        
        setPets(convertedPets);
        
        // Selecionar outro pet ou limpar seleção
        if (convertedPets.length > 0) {
          setSelectedPetId(convertedPets[0].pet_id);
        } else {
          setSelectedPetId(null);
        }
      }
      
      setShowEditModal(false);
      showBlockingNotice('✅ Pet excluído com sucesso!');
    } catch (error) {
      console.error('Erro ao deletar pet:', error);
      showBlockingNotice('❌ Erro ao excluir pet. Tente novamente.');
    }
  };




  // Carregar vacinas do pet atual — usa a tabela vaccine_records (fonte única de verdade)
  // health_data.vaccines é legado e não recebe vacinas do bulk-confirm
  const loadVaccines = async () => {
    const pet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;
    const savedToken = getToken();
    if (!savedToken) return;
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/vaccines`, {
        headers: { 'Authorization': `Bearer ${savedToken}` },
      });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        deleted?: boolean;
        vaccine_type?: string;
        vaccine_name: string;
        applied_date?: string | null;
        next_dose_date?: string | null;
        veterinarian_name?: string | null;
        clinic_name?: string | null;
        notes?: string | null;
        vaccine_code?: string | null;
        country_code?: string | null;
        next_due_source?: string | null;
      }> = await res.json();
      const mapped: VaccineRecord[] = data
        .filter(v => !v.deleted)
        .map(v => {
          // applied_date pode vir como "2023-11-30T00:00:00" ou "2023-11-30 00:00:00.000"
          const toDateStr = (raw: string | null | undefined): string => {
            if (!raw) return '';
            return raw.replace('T', ' ').split(' ')[0]; // "2023-11-30" em qualquer formato
          };
          return {
            id: v.id,
            vaccine_type: (v.vaccine_type as VaccineType) || 'multiple',
            vaccine_name: v.vaccine_name,
            date_administered: toDateStr(v.applied_date),
            next_dose_date: v.next_dose_date ? toDateStr(v.next_dose_date) : undefined,
            veterinarian: v.veterinarian_name || '',
            clinic_name: v.clinic_name || '',
            notes: v.notes || undefined,
            vaccine_code: v.vaccine_code || undefined,
            country_code: v.country_code || undefined,
            next_due_source: v.next_due_source || undefined,
          };
        })
        .sort((a, b) =>
          createLocalDate(b.date_administered).getTime() - createLocalDate(a.date_administered).getTime()
        );
      setVaccines(mapped);
      setPets(prevPets => prevPets.map(p =>
        p.pet_id === pet.pet_id ? { ...p, vaccines: mapped } : p
      ));
    } catch (err) {
      console.error('Erro ao carregar vacinas:', err);
    }
  };

  useEffect(() => {
    if (showHealthModal && selectedPetId) {
      const currentPet = pets.find(p => p.pet_id === selectedPetId);
      const token = getToken();

      if (currentPet) {
        // Só pré-preenche se ainda não há vacinas carregadas (evita sobrescrever com blob legado vazio)
        if (vaccines.length === 0) {
          setVaccines(currentPet.vaccines || []);
        }
        setParasiteControls(currentPet.parasite_controls || []);
        setGroomingRecords(currentPet.grooming_records || []);
        
        // Se tem token, atualizar com dados frescos da API
        if (token) {
          loadVaccines();
          loadParasiteControls(); 
          loadGroomingRecords();
        }
      }
    }
  }, [showHealthModal, selectedPetId]);

  const fetchFeedingPlan = async (petId: string) => {
    const token = getToken();
    if (!token || !petId) return;

    const readLocalFoodPlan = (): FeedingPlanEntry | null => {
      try {
        const raw = localStorage.getItem(`petmol_food_control_${petId}`);
        if (!raw) return null;
        const local = JSON.parse(raw);
        return {
          ...local,
          food_brand: local.food_brand ?? local.brand ?? null,
          brand: local.brand ?? local.food_brand ?? null,
          next_purchase_date: local.next_purchase_date ?? local.nextPurchaseDate ?? null,
          next_reminder_date: local.next_reminder_date ?? null,
          estimated_end_date: local.estimated_end_date ?? null,
          manual_reminder_days_before: local.manual_reminder_days_before ?? local.manualDaysBefore ?? null,
        };
      } catch {
        return null;
      }
    };

    const syncFoodPlan = (entry: FeedingPlanEntry | null) => {
      setFeedingPlan(prev => {
        if (!entry) {
          const next = { ...prev };
          delete next[petId];
          return next;
        }
        return { ...prev, [petId]: entry };
      });
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/health/pets/${petId}/feeding/plan`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // API retorna { plan: {...}, estimate: {...} } — achata para acesso direto
        const flat = {
          ...(data.plan ?? {}),
          next_reminder_date: data.estimate?.recommended_alert_date ?? null,
          estimated_end_date: data.estimate?.estimated_end_date ?? null,
        };
        syncFoodPlan(flat);
        // Sincroniza localStorage para que FoodControlTab também enxergue
        try {
          const stored = localStorage.getItem(`petmol_food_control_${petId}`);
          const local = stored ? JSON.parse(stored) : {};
          const merged = {
            ...local,
            next_purchase_date: flat.next_purchase_date ?? local.next_purchase_date,
            next_reminder_date: flat.next_reminder_date ?? local.next_reminder_date,
            estimated_end_date: flat.estimated_end_date ?? local.estimated_end_date,
            manual_reminder_days_before: flat.manual_reminder_days_before ?? local.manual_reminder_days_before ?? local.manualDaysBefore,
            food_brand: flat.food_brand ?? local.food_brand ?? local.brand,
            brand: flat.food_brand ?? local.food_brand ?? local.brand,
          };
          localStorage.setItem(`petmol_food_control_${petId}`, JSON.stringify(merged));
        } catch {}
        return;
      }

      const fallback = readLocalFoodPlan();
      syncFoodPlan(fallback);
    } catch (e) {
      console.error('Erro ao carregar plano alimentar:', e);
      const fallback = readLocalFoodPlan();
      syncFoodPlan(fallback);
    }
  };

  // Carregar plano alimentar ao selecionar pet — garante chip de ração em qualquer dispositivo
  useEffect(() => {
    if (selectedPetId) fetchFeedingPlan(selectedPetId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPetId]);

  // Mantém refreshAllRef sempre apontando para o closure mais recente (evita closure stale no listener)
  // Roda a cada render → sempre tem acesso à versão atual de pets, selectedPetId, etc.
  useEffect(() => {
    refreshAllRef.current = () => {
      if (!selectedPetId) return;
      fetchFeedingPlan(selectedPetId);
      fetchPetEvents(selectedPetId);
      loadVaccines();
      loadParasiteControls();
      loadGroomingRecords();
    };
  }); // sem array de deps: roda sempre

  // Resincroniza dados quando o app volta ao foco (celular saiu e voltou, ou troca de aba)
  // Resolve o problema de dados desatualizados no mobile após salvar no desktop
  // Usa refreshAllRef.current() → nunca fica com closure stale mesmo com deps []
  useEffect(() => {
    let lastRefresh = 0;

    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh < 2_000) return;
      lastRefresh = now;
      refreshAllRef.current();
    };

    // iOS Safari usa pageshow ao voltar do histórico (bfcache)
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const now = Date.now();
        if (now - lastRefresh < 2_000) return;
        lastRefresh = now;
        refreshAllRef.current();
      }
    };

    document.addEventListener('visibilitychange', handler);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []); // deps vazio: listener criado 1x, freshness garantida pelo ref

  // Carregar documentos ao abrir a aba de eventos (para exibir docs vinculados)
  useEffect(() => {
    if (healthActiveTab === 'eventos' && selectedPetId) {
      const token = getToken();
      if (!token) return;
      fetch(`${API_BASE_URL}/pets/${selectedPetId}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : [])
        .then(data => setVetHistoryDocs(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthActiveTab, selectedPetId]);

  // Carregar vacinas e antiparasitários automaticamente ao selecionar um pet (garante que o estado
  // esteja populado antes de qualquer modal abrir)
  useEffect(() => {
    if (selectedPetId && pets.length > 0) {
      const token = getToken();
      if (token) {
        loadVaccines();
        loadParasiteControls();
        loadGroomingRecords();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPetId, pets.length]);

  // Detectar brilho da foto quando pet muda
  useEffect(() => {
  }, [selectedPetId, pets.length]);

  // Carregar controles de parasitas
  const loadParasiteControls = async () => {
    const pet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;
    try {
      const savedToken = getToken();
      if (!savedToken) return;
      const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/parasites`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        type: ParasiteControlType;
        product_name: string;
        date_applied?: string | null;
        next_due_date?: string | null;
        frequency_days: number;
        dosage?: string | null;
        application_form?: ParasiteFormData['application_form'];
        veterinarian?: string | null;
        cost?: number;
        purchase_location?: string | null;
        reminder_days: number;
        collar_expiry_date?: string | null;
        alert_days_before?: number;
        reminder_enabled?: boolean;
        notes?: string | null;
      }> = await res.json();
      const _d = (raw: string | null | undefined): string =>
        raw ? raw.replace('T', ' ').split(' ')[0] : '';
      const mapped: ParasiteControl[] = data.map(p => ({
        id: p.id, type: p.type, product_name: p.product_name,
        date_applied: _d(p.date_applied),
        next_due_date: p.next_due_date ? _d(p.next_due_date) : undefined,
        frequency_days: p.frequency_days, dosage: p.dosage || '',
        application_form: p.application_form, veterinarian: p.veterinarian || '',
        cost: p.cost, purchase_location: p.purchase_location || '',
        reminder_days: p.reminder_days,
        collar_expiry_date: p.collar_expiry_date ? _d(p.collar_expiry_date) : '',
        alert_days_before: p.alert_days_before, reminder_enabled: p.reminder_enabled,
        notes: p.notes || '',
      } as ParasiteControl));
      const sorted = mapped.sort((a, b) =>
        createLocalDate(b.date_applied).getTime() - createLocalDate(a.date_applied).getTime()
      );
      setParasiteControls(sorted);
      setPets(prevPets => prevPets.map(p =>
        p.pet_id === pet.pet_id ? { ...p, parasite_controls: sorted } : p
      ));
    } catch {}
  };

  // Carregar registros de higiene
  const loadGroomingRecords = async () => {
    const pet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;
    try {
      const savedToken = getToken();
      if (!savedToken) return;
      const res = await fetch(`${API_BASE_URL}/pets/${pet.pet_id}/grooming`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      });
      if (!res.ok) return;
      const data: Array<{
        id: string;
        type: GroomingType;
        date?: string | null;
        scheduled_time?: string;
        location?: string | null;
        location_address?: string | null;
        location_phone?: string | null;
        location_place_id?: string | null;
        groomer?: string | null;
        cost?: number;
        notes?: string | null;
        next_recommended_date?: string | null;
        frequency_days: number;
        reminder_enabled?: boolean;
        alert_days_before?: number;
      }> = await res.json();
      const _d = (raw: string | null | undefined): string =>
        raw ? raw.replace('T', ' ').split(' ')[0] : '';
      const records: GroomingRecord[] = data.map(g => ({
        id: g.id, pet_id: pet.pet_id, type: g.type,
        date: _d(g.date), scheduled_time: g.scheduled_time,
        location: g.location || '', location_address: g.location_address || '',
        location_phone: g.location_phone || '', location_place_id: g.location_place_id || '',
        groomer: g.groomer || '', cost: g.cost, notes: g.notes || '',
        next_recommended_date: g.next_recommended_date ? _d(g.next_recommended_date) : undefined,
        frequency_days: g.frequency_days, reminder_enabled: g.reminder_enabled,
        alert_days_before: g.alert_days_before,
      } as GroomingRecord));
      const sorted = records.sort((a, b) =>
        createLocalDate(b.date).getTime() - createLocalDate(a.date).getTime()
      );
      setGroomingRecords(sorted);
      setPets(prevPets => prevPets.map(p =>
        p.pet_id === pet.pet_id ? { ...p, grooming_records: sorted } : p
      ));
      // Verificar lembretes pendentes
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const typeLabel: Record<string, string> = { bath: 'Banho', grooming: 'Tosa', bath_grooming: 'Banho & Tosa' };
      const alerts: {petName: string; type: string; daysOverdue: number}[] = [];
      const shownKey = `petmol_groom_alerted_${pet.pet_id}_${dateToLocalISO(today)}`;
      const alreadyShown = localStorage.getItem(shownKey);
      const latestByType = new Map<string, GroomingRecord>();
      sorted.forEach((r: GroomingRecord) => {
        const key = String(r.type || '').toLowerCase();
        if (!key) return;
        const prev = latestByType.get(key);
        if (!prev) {
          latestByType.set(key, r);
          return;
        }
        const currentDate = createLocalDate(r.date).getTime();
        const prevDate = createLocalDate(prev.date).getTime();
        if (!Number.isNaN(currentDate) && (Number.isNaN(prevDate) || currentDate > prevDate)) {
          latestByType.set(key, r);
        }
      });

      Array.from(latestByType.values()).forEach((r: GroomingRecord) => {
        if (!r.reminder_enabled || !r.next_recommended_date) return;
        const alertDate = createLocalDate(r.next_recommended_date);
        alertDate.setDate(alertDate.getDate() - (r.alert_days_before || 3));
        const daysOverdue = Math.floor((today.getTime() - alertDate.getTime()) / 86400000);
        if (daysOverdue >= 0) {
          alerts.push({ petName: pet.pet_name, type: typeLabel[r.type] || r.type, daysOverdue });
        }
      });
      if (alerts.length > 0) {
        setGroomingDueAlerts(alerts);
      } else {
        setGroomingDueAlerts([]);
      }
    } catch {}
  };

  // Buscar estabelecimentos no Google Places com debounce
  const searchPlaces = async (query: string) => {
    // Cancelar timeout e requisição anteriores
    if (placeSearchTimeout) clearTimeout(placeSearchTimeout);
    if (placeAbortController.current) placeAbortController.current.abort();

    if (!query || query.length < 3) {
      setPlaceSuggestions([]);
      setShowPlaceSuggestions(false);
      return;
    }

    // Debounce de 600ms
    const timeout = setTimeout(async () => {
      const controller = new AbortController();
      placeAbortController.current = controller;
      setSearchingPlaces(true);
      try {
        const response = await fetch(`/api/places/search?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          setPlaceSuggestions(data.results || []);
          setShowPlaceSuggestions((data.results?.length ?? 0) > 0);
        }
      } catch (error: unknown) {
        if (!(error instanceof Error) || error.name !== 'AbortError') {
          console.error('[places/search] Erro:', error);
        }
      } finally {
        setSearchingPlaces(false);
      }
    }, 600);

    setPlaceSearchTimeout(timeout);
  };

  // Selecionar estabelecimento — busca details sob demanda
  const selectPlace = async (place: PlaceDetails) => {
    // Preenche imediatamente com o que já temos
    setGroomingFormData(prev => ({
      ...prev,
      location: place.name,
      location_address: place.formatted_address,
      location_phone: '',
      location_place_id: place.place_id,
    }));
    setShowPlaceSuggestions(false);
    setPlaceSuggestions([]);

    // Busca detalhes (telefone, site) em background
    try {
      const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(place.place_id)}`);
      if (res.ok) {
        const { result } = await res.json();
        if (result) {
          setGroomingFormData(prev => ({
            ...prev,
            location_phone: result.formatted_phone_number || '',
          }));
        }
      }
    } catch {
      // silencioso — telefone fica vazio
    }
  };

  // Salvar registro de higiene
  const handleSaveGrooming = async () => {
    const pet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
    if (!pet) return;

    // Validar campos obrigatórios
    if (!groomingFormData.date) {
      showBlockingNotice('Por favor, preencha a data do serviço');
      return;
    }

    if (groomingFormData.cost !== undefined && groomingFormData.cost < 0) {
      showBlockingNotice('O valor do serviço não pode ser negativo');
      return;
    }

    const frequencyMap = {
      bath: 14, // Banho a cada 14 dias
      grooming: 45, // Tosa a cada 45 dias
      bath_grooming: 45 // Banho e tosa a cada 45 dias
    };

    const frequency = groomingFormData.frequency_days || frequencyMap[groomingFormData.type];
    const nextRecommended = createLocalDate(groomingFormData.date);
    nextRecommended.setDate(nextRecommended.getDate() + frequency);

    try {
      let success = false;

      if (editingGrooming) {
        // Atualizar registro existente
        const updatedRecord: Partial<GroomingRecord> = {
          type: groomingFormData.type,
          date: groomingFormData.date,
          location: groomingFormData.location,
          location_address: groomingFormData.location_address,
          location_phone: groomingFormData.location_phone,
          location_place_id: groomingFormData.location_place_id,
          cost: groomingFormData.cost,
          notes: groomingFormData.notes,
          frequency_days: frequency,
          next_recommended_date: dateToLocalISO(nextRecommended),
          reminder_enabled: groomingFormData.reminder_enabled,
          alert_days_before: groomingFormData.alert_days_before
        };

        success = await updateGroomingRecord(pet.pet_id, editingGrooming.id, updatedRecord);
        
        if (success) {
          // Atualizar estado local imediatamente
          setGroomingRecords(prev => prev.map(r => 
            r.id === editingGrooming.id ? { ...r, ...updatedRecord } : r
          ));
          showBlockingNotice('✅ Registro atualizado com sucesso!');
        }
      } else {
        // Criar novo registro
        const newRecord: GroomingRecord = {
          id: `groom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          pet_id: pet.pet_id,
          type: groomingFormData.type,
          date: groomingFormData.date,
          location: groomingFormData.location,
          location_address: groomingFormData.location_address,
          location_phone: groomingFormData.location_phone,
          location_place_id: groomingFormData.location_place_id,
          cost: groomingFormData.cost,
          notes: groomingFormData.notes,
          frequency_days: frequency,
          next_recommended_date: dateToLocalISO(nextRecommended),
          reminder_enabled: groomingFormData.reminder_enabled,
          alert_days_before: groomingFormData.alert_days_before
        };

        success = await addGroomingRecord(pet.pet_id, newRecord);
        
        if (success) {
          showBlockingNotice('✅ Registro de banho/tosa salvo com sucesso!');
        }
      }
      
      if (success) {
        await loadGroomingRecords();
        
        // Resetar formulário
        setGroomingFormData({
          type: 'bath',
          date: localTodayISO(),
          scheduled_time: '',
          location: '',
          location_address: '',
          location_phone: '',
          location_place_id: '',
          cost: 0,
          notes: '',
          frequency_days: 14,
          reminder_enabled: true,
          alert_days_before: 3
        });
        setEditingGrooming(null);
        setShowEditGroomingModal(false);
        if (selectedPetId) fetchPetEvents(selectedPetId);
      } else {
        showBlockingNotice(t('grooming.error_save'));
      }
    } catch (error) {
      console.error('Erro ao salvar registro de grooming:', error);
      showBlockingNotice(t('grooming.error_save'));
    }
  };

  // Editar registro de grooming
  const handleEditGrooming = (record: GroomingRecord) => {
    setEditingGrooming(record);
    setGroomingFormData({
      type: record.type,
      date: record.date,
      scheduled_time: record.scheduled_time || '',
      location: record.location || '',
      location_address: record.location_address || '',
      location_phone: record.location_phone || '',
      location_place_id: record.location_place_id || '',
      cost: record.cost || 0,
      notes: record.notes || '',
      frequency_days: record.frequency_days || 14,
      reminder_enabled: record.reminder_enabled ?? true,
      alert_days_before: record.alert_days_before ?? 3
    });
    setShowEditGroomingModal(true);
  };

  // Excluir registro de grooming
  const handleDeleteGrooming = async (record: GroomingRecord) => {
    const typeText = record.type === 'bath' ? t('grooming.bath').toLowerCase() : 
      record.type === 'grooming' ? t('grooming.grooming').toLowerCase() : 
      t('grooming.bath_and_grooming');
    
    if (requestUserConfirmation(t('grooming.delete_confirm', { type: typeText }))) {
      try {
        const pet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
        if (!pet) return;

        const success = await deleteGroomingRecord(pet.pet_id, record.id);
        if (success) {
          // Remover do estado local imediatamente
          setGroomingRecords(prev => prev.filter(r => r.id !== record.id));
          showBlockingNotice('✅ Registro removido!');
          await loadGroomingRecords();
        } else {
          showBlockingNotice(t('grooming.error_delete'));
        }
      } catch (error) {
        console.error('Erro ao excluir:', error);
        showBlockingNotice(t('grooming.error_delete'));
      }
    }
  };

  // Cancelar edição de grooming
  const handleCancelEditGrooming = () => {
    setEditingGrooming(null);
    setShowEditGroomingModal(false);
    setGroomingFormData({
      type: 'bath',
      date: localTodayISO(),
      scheduled_time: '',
      location: '',
      location_address: '',
      location_phone: '',
      location_place_id: '',
      cost: 0,
      notes: '',
      frequency_days: 14,
      reminder_enabled: true,
      alert_days_before: 3
    });
  };

  // Resetar formulário de controle parasitário
  const resetParasiteForm = () => {
    setParasiteFormData({
      type: 'dewormer',
      product_name: '',
      date_applied: '',
      frequency_days: 90, // Padrão Brasil: 3 meses para vermífugo
      application_form: 'oral',
      dosage: '',
      veterinarian: '',
      cost: 0,
      notes: '',
      collar_expiry_date: '',
      alert_days_before: 7,
      purchase_location: '',
      reminder_enabled: true
    });
    setEditingParasite(null);
    setShowParasiteForm(false);
  };

  // Calcular próxima dose
  const calculateNextDose = (dateApplied: string, frequencyDays: number): string => {
    const date = createLocalDate(dateApplied);
    date.setDate(date.getDate() + frequencyDays);
    return dateToLocalISO(date);
  };

  // Salvar controle de parasita
  const handleSaveParasite = async () => {
    const currentPet = getCurrentPet();
    if (!currentPet || !parasiteFormData.product_name || !parasiteFormData.date_applied) {
      showBlockingNotice('Preencha os campos obrigatórios: Produto e Data de aplicação');
      return;
    }

    try {
      const nextDueDate = calculateNextDose(parasiteFormData.date_applied, parasiteFormData.frequency_days);
      
      // Normalizar nome do produto para análise estatística
      const normalizedProductName = parasiteFormData.product_name.trim();
      
      const controlData: Partial<ParasiteControl> = {
        ...parasiteFormData,
        product_name: normalizedProductName,
        next_due_date: nextDueDate,
        pet_weight_kg: (currentPet as PetHealthProfile & { weight_kg?: number })?.weight_kg || undefined,
      };

      let success = false;
      if (editingParasite) {
        success = await updateParasiteControl(currentPet.pet_id, editingParasite.id, controlData);
        if (success) {
          // Atualizar estado local imediatamente
          setParasiteControls(prev => prev.map(c => 
            c.id === editingParasite.id ? { ...c, ...controlData } as ParasiteControl : c
          ));
          showBlockingNotice('✅ Controle atualizado com sucesso!');
        }
      } else {
        success = await addParasiteControl(currentPet.pet_id, controlData);
        if (success) {
          showBlockingNotice('✅ Controle registrado no prontuário!');
        }
      }
      
      if (success) {
        await loadParasiteControls();
        resetParasiteForm();
        if (selectedPetId) fetchPetEvents(selectedPetId);
      } else {
        showBlockingNotice(t('parasite.error_save'));
      }
    } catch (error) {
      console.error('Erro ao salvar controle:', error);
      showBlockingNotice(t('parasite.error_save'));
    }
  };

  // Editar controle
  const handleEditParasite = (control: ParasiteControl) => {
    setEditingParasite(control);
    setParasiteFormData({
      type: control.type,
      product_name: control.product_name,
      date_applied: control.date_applied,
      frequency_days: control.frequency_days,
      application_form: control.application_form || 'oral',
      dosage: control.dosage || '',
      veterinarian: control.veterinarian || '',
      cost: control.cost || 0,
      notes: control.notes || '',
      collar_expiry_date: control.collar_expiry_date || '',
      alert_days_before: control.alert_days_before || 7,
      purchase_location: control.purchase_location || '',
      reminder_enabled: control.reminder_enabled !== undefined ? control.reminder_enabled : true
    });
    setShowParasiteForm(true);
  };

  // Excluir controle
  const handleDeleteParasite = async (control: ParasiteControl) => {
    if (requestUserConfirmation(t('parasite.delete_confirm', { name: control.product_name }))) {
      try {
        const success = await deleteParasiteControl(currentPet.pet_id, control.id);
        if (success) {
          // Remover do estado local imediatamente
          setParasiteControls(prev => prev.filter(c => c.id !== control.id));
          showBlockingNotice('✅ Registro removido!');
          await loadParasiteControls();
        } else {
          showBlockingNotice(t('parasite.error_delete'));
        }
      } catch (error) {
        console.error('Erro ao excluir:', error);
        showBlockingNotice(t('parasite.error_delete'));
      }
    }
  };

  // Resetar formulário
  const resetVaccineForm = () => {
    setVaccineFormData({
      vaccine_type: 'multiple',
      vaccine_name: '',
      date_administered: '',
      next_dose_date: '',
      frequency_days: 365,
      veterinarian: '',
      notes: '',
      alert_days_before: 3,
      reminder_time: '09:00',
    });
    setEditingVaccine(null);
    setShowVaccineForm(false);
    setVaccineFiles([]);
  };

  // Salvar vacina (criar ou editar)
  const handleSaveVaccine = async () => {
    const currentPet = getCurrentPet();
    if (!currentPet || !vaccineFormData.vaccine_name || !vaccineFormData.date_administered) {
      showBlockingNotice('Preencha os campos obrigatórios: Nome da vacina e Data de aplicação');
      return;
    }

    setVaccineFormSaving(true);
    try {
      if (editingVaccine) {
        const updates: Partial<VaccineRecord> = {
          vaccine_type: vaccineFormData.vaccine_type,
          vaccine_name: vaccineFormData.vaccine_name,
          date_administered: vaccineFormData.date_administered,
          next_dose_date: vaccineFormData.next_dose_date || undefined,
          veterinarian: vaccineFormData.veterinarian,
          clinic_name: '',
          batch_number: undefined,
          notes: vaccineFormData.notes || undefined,
        };
        const success = await updateVaccine(currentPet.pet_id, editingVaccine.id, updates);
        
        if (success) {
          // Atualizar estado local imediatamente
          setVaccines(prevVaccines => 
            prevVaccines.map(v => 
              v.id === editingVaccine.id 
                ? { ...v, ...updates }
                : v
            )
          );
          setPets(prevPets => prevPets.map(p =>
            p.pet_id === currentPet.pet_id
              ? { ...p, vaccines: (p.vaccines || []).map(v => v.id === editingVaccine.id ? { ...v, ...updates } : v) }
              : p
          ));
          showBlockingNotice('✅ Vacina atualizada com sucesso!');
        } else {
          showBlockingNotice('❌ Erro ao atualizar vacina. Tente novamente.');
        }
      } else {
        // Use catalog endpoint for new vaccines (enriches with vaccine_code & protocol next_due)
        const savedToken = getToken();
        if (!savedToken) {
          showBlockingNotice('❌ Sessão expirada. Faça login novamente.');
          return;
        }
        const countryCode = locale.startsWith('pt') ? 'BR' : locale.startsWith('en') ? 'US' : 'BR';
        const vaccinePayload: Record<string, unknown> = {
          display_name: vaccineFormData.vaccine_name,
          applied_on: vaccineFormData.date_administered,
          source: 'manual',
          confirmed_by_user: true,
        };
        const computedNextDose = vaccineFormData.date_administered
          ? calculateNextDose(vaccineFormData.date_administered, vaccineFormData.frequency_days || 365)
          : null;
        const nextDoseHint = vaccineFormData.next_dose_date || computedNextDose;
        if (nextDoseHint) vaccinePayload.next_due_on = nextDoseHint;
        if (vaccineFormData.notes) vaccinePayload.notes = vaccineFormData.notes;
        if (vaccineFormData.veterinarian) vaccinePayload.veterinarian = vaccineFormData.veterinarian;
        vaccinePayload.alert_days_before = vaccineFormData.alert_days_before ?? 3;
        vaccinePayload.reminder_time = vaccineFormData.reminder_time ?? '09:00';

        const res = await fetch(`${API_BASE_URL}/api/health/pets/${currentPet.pet_id}/vaccines/bulk-confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${savedToken}`,
          },
          body: JSON.stringify({
            country_code: countryCode,
            species: currentPet.species || 'dog',
            vaccines: [vaccinePayload],
          }),
        });

        if (!res.ok) {
          showBlockingNotice('❌ Erro ao adicionar vacina. Tente novamente.');
          return;
        }

        const data = await res.json();
        const saved = data.vaccines[0];

        // Map VaccineResponse → local VaccineRecord
        const createdVaccine: VaccineRecord = {
          id: saved.id,
          vaccine_type: vaccineFormData.vaccine_type,
          vaccine_name: saved.display_name,
          date_administered: saved.applied_on,
          next_dose_date: saved.next_due_on || vaccineFormData.next_dose_date || undefined,
          veterinarian: vaccineFormData.veterinarian,
          clinic_name: '',
          notes: saved.notes || vaccineFormData.notes || undefined,
          vaccine_code: saved.vaccine_code || undefined,
          country_code: saved.country_code || undefined,
          next_due_source: saved.next_due_source || 'unknown',
        };

        trackV1Metric('vaccine_record_created', {
          pet_id: currentPet.pet_id,
          vaccine_id: saved.id,
          vaccine_name: saved.display_name,
          source: 'manual_form',
        });

        setVaccines(prevVaccines => [...prevVaccines, createdVaccine]);
        setPets(prevPets => prevPets.map(p =>
          p.pet_id === currentPet.pet_id
            ? { ...p, vaccines: [...(p.vaccines || []), createdVaccine] }
            : p
        ));

        const now = new Date();
        const nextDate = saved.next_due_on ? new Date(saved.next_due_on) : null;
        const diff = nextDate ? Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
        let statusLabel = 'Em dia';
        if (diff !== null && diff <= 30 && diff >= 0) statusLabel = 'Vencendo';
        if (diff !== null && diff < 0) statusLabel = 'Atrasada';
        let msg = `✅ Vacina registrada!\nStatus: ${statusLabel}\nLembrete ativo`;
        if (saved.next_due_on) msg += `\nPróxima previsão: ${saved.next_due_on}`;
        showBlockingNotice(msg);
      }
      
      resetVaccineForm();
      if (selectedPetId) fetchPetEvents(selectedPetId);
    } catch (error) {
      console.error('Erro ao salvar vacina:', error);
      showBlockingNotice(t('health.vaccines.error_save'));
    } finally {
      setVaccineFormSaving(false);
    }
  };

  // Editar vacina
  const handleEditVaccine = (vaccine: VaccineRecord) => {
    setEditingVaccine(vaccine);
    setVaccineFormData({
      vaccine_type: vaccine.vaccine_type,
      vaccine_name: vaccine.vaccine_name,
      date_administered: vaccine.date_administered,
      next_dose_date: vaccine.next_dose_date || '',
      frequency_days: 365,
      veterinarian: vaccine.veterinarian,
      notes: vaccine.notes || '',
      alert_days_before: (vaccine as unknown as Record<string, unknown>).alert_days_before as number ?? 3,
      reminder_time: (vaccine as unknown as Record<string, unknown>).reminder_time as string ?? '09:00',
    });
    setShowVaccineForm(true);
  };

  // Excluir vacina
  const handleDeleteVaccine = async (vaccine: VaccineRecord) => {
    if (requestUserConfirmation(t('health.vaccines.delete_confirm', { name: vaccine.vaccine_name }))) {
      try {
        const success = await deleteVaccine(currentPet.pet_id, vaccine.id);
        if (success) {
          setVaccines(prev => prev.filter(v => v.id !== vaccine.id));
          setPets(prevPets => prevPets.map(p =>
            p.pet_id === currentPet.pet_id
              ? { ...p, vaccines: (p.vaccines || []).filter(v => v.id !== vaccine.id) }
              : p
          ));
          showBlockingNotice('✅ Vacina removida do prontuário!');
        } else {
          showBlockingNotice('Erro ao excluir vacina do banco de dados.');
        }
      } catch (error) {
        console.error('Erro ao excluir vacina:', error);
        showBlockingNotice(t('health.vaccines.error_delete'));
      }
    }
  };

  // Limpar todas as vacinas
  const handleDeleteAllVaccines = async () => {
    if (!currentPet) return;
    
    const count = vaccines.length;
    if (count === 0) {
      showBlockingNotice('Não há vacinas para remover.');
      return;
    }

    if (requestUserConfirmation(`⚠️ ATENÇÃO: Você está prestes a REMOVER TODAS as ${count} vacinas do prontuário!\n\nEsta ação NÃO pode ser desfeita.\n\nDeseja continuar?`)) {
      try {
        // OPERAÇÃO ATÔMICA: uma única chamada para limpar todas as vacinas
        const success = await clearAllVaccines(currentPet.pet_id);
        
        if (success) {
          setVaccines([]);
          setPets(prevPets => prevPets.map(p =>
            p.pet_id === currentPet.pet_id ? { ...p, vaccines: [] } : p
          ));
          showBlockingNotice(`✅ Todas as ${count} vacinas foram removidas do prontuário!`);
        } else {
          showBlockingNotice('❌ Erro ao limpar vacinas. Tente novamente.');
        }
      } catch (error) {
        console.error('Erro ao limpar vacinas:', error);
        showBlockingNotice('❌ Erro ao limpar vacinas. Tente novamente.');
      }
    }
  };

  // ========== SISTEMA DE FEEDBACK E APRENDIZADO ==========
  
  // Abrir modal de feedback para correção
  const handleReportVaccineIssue = (vaccine: VaccineRecord) => {
    setFeedbackVaccine(vaccine);
    setFeedbackFormData({
      field_corrected: 'name',
      original_value: vaccine.vaccine_name,
      corrected_value: '',
      user_comment: ''
    });
    setShowFeedbackModal(true);
  };

  // Submeter correção de vacina
  const handleSubmitFeedback = async () => {
    if (!feedbackVaccine || !currentPet) return;

    if (!feedbackFormData.corrected_value.trim()) {
      showBlockingNotice('Por favor, informe o valor correto.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/feedback/vaccine-correction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pet_id: currentPet.pet_id,
          vaccine_id: feedbackVaccine.id,
          field_corrected: feedbackFormData.field_corrected,
          original_value: feedbackFormData.original_value,
          corrected_value: feedbackFormData.corrected_value,
          user_comment: feedbackFormData.user_comment,
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // TAMBÉM aplicar correção à vacina no banco de dados
        try {
          const updateData: Partial<VaccineRecord> = {};
          
          // Atualizar campo correto baseado no tipo
          switch(feedbackFormData.field_corrected) {
            case 'name':
            case 'brand':
              updateData.vaccine_name = feedbackFormData.corrected_value;
              break;
            case 'type':
              updateData.vaccine_type = feedbackFormData.corrected_value as VaccineType;
              break;
            case 'date_administered':
              updateData.date_administered = feedbackFormData.corrected_value;
              break;
            case 'next_dose_date':
              updateData.next_dose_date = feedbackFormData.corrected_value;
              break;
            case 'veterinarian':
              updateData.veterinarian = feedbackFormData.corrected_value;
              break;
          }
          
          // Usar a função updateVaccine existente
          const success = await updateVaccine(currentPet.pet_id, feedbackVaccine.id, updateData);
          
          if (success) {
            // Atualizar estado local imediatamente (sem esperar reload)
            setVaccines(prevVaccines => 
              prevVaccines.map(v => 
                v.id === feedbackVaccine.id 
                  ? { ...v, ...updateData }
                  : v
              )
            );
            
            let message = t('feedback.correction_success');
            
            if (result.impact?.similar_corrections > 2) {
              message += `\n\n📊 Este erro já foi reportado ${result.impact.similar_corrections}x. Estamos trabalhando na correção automática!`;
            }
            
            showBlockingNotice(message);
            
            // Recarregar dados em background para garantir sincronização
            loadVaccines();
            
          } else {
            showBlockingNotice('✅ Feedback registrado, mas não foi possível atualizar a vacina.\n\nUse o botão ✏️ para editar manualmente.');
          }
          
        } catch (updateError) {
          console.error('Erro ao atualizar vacina:', updateError);
          showBlockingNotice('✅ Feedback registrado!\n\n💡 Use o botão ✏️ para aplicar a correção manualmente.');
        }
        
        // Fechar modal
        setShowFeedbackModal(false);
        setFeedbackVaccine(null);
      } else {
        showBlockingNotice(t('feedback.error_send'));
      }
    } catch (error) {
      console.error('Erro ao enviar feedback:', error);
      showBlockingNotice(t('feedback.error_connection'));
    }
  };

  // ========== QUICK ADD: Preenchimento Rápido com Toques ==========
  
  const [quickAddData, setQuickAddData] = useState({
    vaccine_type: 'rabies' as VaccineType,
    vaccine_name: '',
    date_administered: localTodayISO(),
    next_dose_date: '',
    veterinarian: ''
  });

  const commonVaccines: { type: VaccineType; name: string; icon: string; code: string }[] = [
    { type: 'multiple', name: 'V10', icon: '💉', code: 'DOG_POLYVALENT_V8' },
    { type: 'multiple', name: 'V8', icon: '💉', code: 'DOG_POLYVALENT_V8' },
    { type: 'rabies', name: 'Raiva', icon: '🦠', code: 'DOG_RABIES' },
    { type: 'influenza', name: 'Gripe', icon: '🤧', code: 'DOG_INFLUENZA' },
    { type: 'giardia', name: 'Giárdia', icon: '🧪', code: 'DOG_GIARDIA' },
    { type: 'leishmaniasis', name: 'Leishmaniose', icon: '🛡️', code: 'DOG_LEISH_TEC' },
    { type: 'other', name: 'Outro', icon: '➕', code: 'OTHER' },
  ];

  // Estabilização Home: manter callback esperado pelos modais sem lógica extra.
  const getRecentVets = () => {
    const vets = (vaccines || [])
      .map((v) => v.veterinarian)
      .filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i)
      .slice(0, 5);
    return vets.length > 0 ? vets : [''];
  };

  const handleQuickAddVaccine = async (selectedVaccine: (typeof commonVaccines)[number]) => {
    const currentPet = getCurrentPet();
    if (!currentPet) return;

    const savedToken = getToken();
    if (!savedToken) { showBlockingNotice('❌ Sessão expirada. Faça login novamente.'); return; }

    const countryCode = locale.startsWith('pt') ? 'BR' : locale.startsWith('en') ? 'US' : 'BR';

    try {
      const res = await fetch(`${API_BASE_URL}/api/health/pets/${currentPet.pet_id}/vaccines/bulk-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
        body: JSON.stringify({
          country_code: countryCode,
          species: currentPet.species || 'dog',
          vaccines: [{
            display_name: selectedVaccine.name,
            applied_on: quickAddData.date_administered,
            source: 'quick_add',
            confirmed_by_user: true,
            notes: t('health.added_via_quick'),
          }],
        }),
      });

      if (!res.ok) { showBlockingNotice('❌ Erro ao adicionar vacina. Tente novamente.'); return; }

      const data = await res.json();
      const saved = data.vaccines[0];

      const createdVaccine: VaccineRecord = {
        id: saved.id,
        vaccine_type: selectedVaccine.type,
        vaccine_name: saved.display_name,
        date_administered: saved.applied_on,
        next_dose_date: saved.next_due_on || undefined,
        veterinarian: '',
        clinic_name: '',
        notes: saved.notes || t('health.added_via_quick'),
        vaccine_code: saved.vaccine_code || undefined,
        country_code: saved.country_code || undefined,
        next_due_source: saved.next_due_source || 'unknown',
      };

      trackV1Metric('vaccine_record_created', {
        pet_id: currentPet.pet_id,
        vaccine_id: saved.id,
        vaccine_name: saved.display_name,
        source: 'quick_add',
      });

      setVaccines(prevVaccines => [...prevVaccines, createdVaccine]);
      setPets(prevPets => prevPets.map(p =>
        p.pet_id === currentPet.pet_id
          ? { ...p, vaccines: [...(p.vaccines || []), createdVaccine] }
          : p
      ));

      const now = new Date();
      const nextDate = saved.next_due_on ? new Date(saved.next_due_on) : null;
      const diff = nextDate ? Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
      let statusLabel = 'Em dia';
      if (diff !== null && diff <= 30 && diff >= 0) statusLabel = 'Vencendo';
      if (diff !== null && diff < 0) statusLabel = 'Atrasada';
      let msg = `✅ ${selectedVaccine.name} registrada!\nStatus: ${statusLabel}\nLembrete ativo`;
      if (saved.next_due_on) msg += `\nPróxima previsão: ${saved.next_due_on}`;
      showBlockingNotice(msg);

      setShowQuickAddVaccine(false);
      setQuickAddData({
        vaccine_type: 'rabies',
        vaccine_name: '',
        date_administered: localTodayISO(),
        next_dose_date: '',
        veterinarian: '',
      });
      if (selectedPetId) fetchPetEvents(selectedPetId);
    } catch (error) {
      console.error('Erro ao adicionar vacina:', error);
      showBlockingNotice('❌ Erro ao adicionar vacina. Tente novamente.');
    }
  };

  // ===========================================================

  const handleImportAnalyzedVaccines = async () => {
    const currentPet = getCurrentPet();
    if (!currentPet) return;

    const registrosToImport = reviewRegistros || [];
    if (registrosToImport.length === 0) return;

    // Guardrails: require confirmation and a consistent count
    if (!reviewConfirmed) {
      showBlockingNotice('Antes de importar, confirme/edite os registros.');
      return;
    }
    // Aviso se a quantidade não bate, mas não bloqueia a importação
    if (reviewExpectedCount !== registrosToImport.length) {
      const proceed = requestUserConfirmation(`⚠️ Quantidade esperada (${reviewExpectedCount}) não bate com os registros encontrados (${registrosToImport.length}).\n\nVocê pode importar assim mesmo as ${registrosToImport.length} vacina(s) encontradas.\n\nContinuar?`);
      if (!proceed) return;
    }
    if (registrosToImport.some((r) => !r.data_aplicacao)) {
      showBlockingNotice('Preencha a data de aplicação em todos os registros antes de importar.');
      return;
    }

    setImportVaccineLoading(true);

    // 🧠 APRENDIZADO ML: Aprender com as correções ANTES de importar
    try {
      if (reviewLearnEnabled && rawRegistros && rawRegistros.length > 0) {
        console.log('🧠 ML: Analisando correções do usuário...');
        
        // Comparar registros originais (rawRegistros) com os corrigidos (reviewRegistros)
        const corrections: Array<{
          original: VaccineCardOcrRecord;
          corrected: VaccineCardOcrRecord;
        }> = [];
        
        // Mapear correções por índice ou por similaridade
        reviewRegistros.forEach((corrected, index) => {
          const original = rawRegistros[index];
          if (original) {
            // Verificar se houve mudanças significativas
            const hasChanges = 
              original.nome_comercial !== corrected.nome_comercial ||
              original.tipo_vacina !== corrected.tipo_vacina ||
              original.data_aplicacao !== corrected.data_aplicacao ||
              original.data_revacina !== corrected.data_revacina ||
              original.veterinario_responsavel !== corrected.veterinario_responsavel;
            
            if (hasChanges) {
              corrections.push({ original, corrected });
              console.log(`🔧 Correção detectada [${index}]:`, {
                de: original.nome_comercial || original.tipo_vacina,
                para: corrected.nome_comercial || corrected.tipo_vacina
              });
            }
          }
        });
        
        if (corrections.length > 0) {
          console.log(`📚 ML: ${corrections.length} correção(ões) detectada(s). Aplicando aprendizado...`);
          
          // Aplicar aprendizado com as correções
          try {
            // Converter para o formato esperado, garantindo que campos obrigatórios não sejam null/undefined
            const originals: VaccineOcrRecordLike[] = corrections.map(c => ({
              tipo_vacina: c.original.tipo_vacina || 'Vacina',
              nome_comercial: c.original.nome_comercial || '',
              data_aplicacao: c.original.data_aplicacao || '',
              data_revacina: c.original.data_revacina || null,
              veterinario_responsavel: c.original.veterinario_responsavel || null
            }));
            
            const corrected: VaccineOcrRecordLike[] = corrections.map(c => ({
              tipo_vacina: c.corrected.tipo_vacina || 'Vacina',
              nome_comercial: c.corrected.nome_comercial || '',
              data_aplicacao: c.corrected.data_aplicacao || '',
              data_revacina: c.corrected.data_revacina || null,
              veterinario_responsavel: c.corrected.veterinario_responsavel || null
            }));
            
            await learnFromCorrections(originals, corrected);
            console.log('✅ ML: Aprendizado aplicado com sucesso! Próximas leituras serão mais precisas.');
          } catch (error) {
            console.error('❌ ML: Erro ao aplicar aprendizado:', error);
          }
        } else {
          console.log('ℹ️ ML: Nenhuma correção detectada. Leitura estava perfeita!');
        }
      }
    } catch (mlError) {
      console.warn('⚠️ ML: Erro no aprendizado (não crítico):', mlError);
      // Não bloquear a importação por erro no ML
    }

    // Dedupe inteligente: comparar com vacinas já existentes no prontuário
    const existingVaccines = vaccines || [];
    const newRecords: VaccineCardOcrRecord[] = [];
    const duplicates: VaccineCardOcrRecord[] = [];

    registrosToImport.forEach((detected: VaccineCardOcrRecord) => {
      // Normalizar para comparação
      const detectedName = (detected.nome_comercial || detected.tipo_vacina || '').toLowerCase().trim();
      const detectedDate = detected.data_aplicacao || '';
      
      // Verificar se já existe uma vacina muito similar
      const isDuplicate = existingVaccines.some((existing) => {
        const existingName = (existing.vaccine_name || '').toLowerCase().trim();
        const existingDate = existing.date_administered || '';
        
        // Considera duplicado se: mesmo nome E mesma data de aplicação
        return existingName === detectedName && existingDate === detectedDate;
      });

      if (isDuplicate) {
        duplicates.push(detected);
      } else {
        newRecords.push(detected);
      }
    });

    // Avisar sobre duplicatas encontradas
    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map(d => d.nome_comercial || d.tipo_vacina).join(', ');
      if (!requestUserConfirmation(`⚠️ Detectadas ${duplicates.length} vacina(s) que já existem no prontuário:\n\n${duplicateNames}\n\nEstas serão IGNORADAS. Apenas ${newRecords.length} nova(s) vacina(s) será(ão) importada(s).\n\nContinuar?`)) {
        return;
      }
    }

    if (newRecords.length === 0) {
      showBlockingNotice('❌ Todas as vacinas do cartão já estão no prontuário. Nenhuma nova vacina para importar.');
      return;
    }

    let importedCount = 0;
    const createdVaccines: VaccineRecord[] = [];

    // Usar bulk-confirm para enriquecer todas as vacinas do catálogo de uma vez
    const savedToken = getToken();
    const countryCode = locale.startsWith('pt') ? 'BR' : locale.startsWith('en') ? 'US' : 'BR';
    const validRecords = newRecords.filter(d => !!d.data_aplicacao);

    if (!savedToken) {
      showBlockingNotice('❌ Sessão expirada. Faça login novamente para importar vacinas.');
      return;
    }

    if (validRecords.length === 0) {
      showBlockingNotice('❌ Nenhuma vacina com data de aplicação válida para importar.');
      return;
    }

    // Tentar bulk-confirm (enriquece com catálogo e calcula próxima dose)
    try {
      const ocrNotes = `${t('health.imported_ocr')}${cardAnalysis?.leitura_confiavel ? '' : ' (leitura parcial)'}`;
      const vaccinePayloads = validRecords.map(detected => ({
        display_name: detected.nome_comercial || detected.tipo_vacina || 'Vacina',
        applied_on: detected.data_aplicacao as string,
        ...(detected.data_revacina ? { next_due_on: detected.data_revacina } : {}),
        notes: ocrNotes,
        source: 'ocr_card',
        confirmed_by_user: true,
        ...(detected.veterinario_responsavel ? { veterinarian: detected.veterinario_responsavel } : {}),
      }));

      const res = await fetch(`${API_BASE_URL}/api/health/pets/${currentPet.pet_id}/vaccines/bulk-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
        body: JSON.stringify({ country_code: countryCode, species: currentPet.species || 'dog', vaccines: vaccinePayloads }),
      });

      if (res.ok) {
        const data = await res.json();
        for (let i = 0; i < data.vaccines.length; i++) {
          const saved = data.vaccines[i];
          const detected = validRecords[i];
          createdVaccines.push({
            id: saved.id,
            vaccine_type: mapTipoVacinaToVaccineType(detected.tipo_vacina || 'Outro'),
            vaccine_name: saved.display_name,
            date_administered: saved.applied_on,
            next_dose_date: saved.next_due_on || detected.data_revacina || undefined,
            veterinarian: detected.veterinario_responsavel || '',
            clinic_name: '',
            notes: saved.notes || ocrNotes,
            vaccine_code: saved.vaccine_code || undefined,
            country_code: saved.country_code || undefined,
            next_due_source: saved.next_due_source || 'unknown',
          });
        }
        importedCount = createdVaccines.length;
      } else if (res.status === 401 || res.status === 403) {
        showBlockingNotice('❌ Sessão expirada. Faça login novamente para importar vacinas.');
        return;
      } else {
        // bulk-confirm falhou por outro motivo — tentar fallback manual abaixo
        const errText = await res.text().catch(() => '');
        console.warn(`bulk-confirm retornou ${res.status}: ${errText}`);
      }
    } catch (error) {
      console.error('Erro ao importar vacinas via bulk-confirm:', error);
    }

    // Fallback: salvar individualmente via POST /pets/{id}/vaccines se bulk-confirm falhou
    if (createdVaccines.length === 0) {
      for (const detected of validRecords) {
        try {
          const ocrNotes = `${t('health.imported_ocr')}${cardAnalysis?.leitura_confiavel ? '' : ' (leitura parcial)'}`;
          const appliedDate = detected.data_aplicacao as string;
          // next_dose_date é obrigatório no endpoint; usar data_revacina ou +1 ano como fallback
          const nextDoseDate = detected.data_revacina || (() => {
            const d = new Date(appliedDate);
            d.setFullYear(d.getFullYear() + 1);
            return dateToLocalISO(d);
          })();

          const res = await fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/vaccines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${savedToken}` },
            body: JSON.stringify({
              vaccine_name: detected.nome_comercial || detected.tipo_vacina || 'Vacina',
              applied_date: appliedDate,
              next_dose_date: nextDoseDate,
              notes: `${ocrNotes}${detected.veterinario_responsavel ? ` | Dr(a). ${detected.veterinario_responsavel}` : ''}`,
            }),
          });

          if (res.ok) {
            const saved = await res.json();
            createdVaccines.push({
              id: saved.id,
              vaccine_type: mapTipoVacinaToVaccineType(detected.tipo_vacina || 'Outro'),
              vaccine_name: saved.vaccine_name,
              date_administered: saved.applied_date,
              next_dose_date: saved.next_dose_date || detected.data_revacina || undefined,
              veterinarian: detected.veterinario_responsavel || '',
              clinic_name: '',
              notes: saved.notes || ocrNotes,
            });
            importedCount++;
          } else if (res.status === 401 || res.status === 403) {
            showBlockingNotice('❌ Sessão expirada. Faça login novamente para importar vacinas.');
            return;
          } else {
            const errText = await res.text().catch(() => '');
            console.error(`Falha ao salvar vacina: ${res.status} ${errText}`);
          }
        } catch (error) {
          console.error('Erro ao importar vacina (fallback):', error);
        }
      }
    }

    if (createdVaccines.length > 0) {
      createdVaccines.forEach((vaccine) => {
        trackV1Metric('vaccine_record_created', {
          pet_id: currentPet.pet_id,
          vaccine_id: vaccine.id,
          vaccine_name: vaccine.vaccine_name,
          source: 'ocr_import',
        });
      });

      setVaccines(prevVaccines => [...prevVaccines, ...createdVaccines]);
      setPets(prevPets => prevPets.map(p =>
        p.pet_id === currentPet.pet_id
          ? { ...p, vaccines: [...(p.vaccines || []), ...createdVaccines] }
          : p
      ));
    }

    if (importedCount > 0) {
      const wasPartialRead = !cardAnalysis?.leitura_confiavel;
      const hadMissingVaccines = duplicates.length > 0 || newRecords.length < reviewExpectedCount;
      
      // Verificar se houve aprendizado ML
      const corrections = rawRegistros && reviewRegistros ? 
        reviewRegistros.filter((r, i) => {
          const orig = rawRegistros[i];
          return orig && (
            orig.nome_comercial !== r.nome_comercial ||
            orig.tipo_vacina !== r.tipo_vacina ||
            orig.data_aplicacao !== r.data_aplicacao ||
            orig.data_revacina !== r.data_revacina ||
            orig.veterinario_responsavel !== r.veterinario_responsavel
          );
        }).length : 0;
      
      let message = `✅ ${importedCount} vacina(s) importada(s) para o prontuário digital!`;
      
      if (corrections > 0 && reviewLearnEnabled) {
        message += `\n\n🧠 Sistema aprendeu com ${corrections} correção(ões)!\nPróximas leituras serão mais precisas.`;
      }
      
      if (wasPartialRead || hadMissingVaccines) {
        message += `\n\n⚠️ IMPORTANTE: Verifique se todas as vacinas do cartão foram importadas.`;
        message += `\nSe faltou alguma, clique em "➕ Nova Vacina Manual" para adicionar.`;
      }
      
      showBlockingNotice(message);
      
      closeCardAnalysis();
      if (selectedPetId) fetchPetEvents(selectedPetId);
      // Não chamar loadVaccines() aqui — ela lê apenas localStorage e apagaria as vacinas
      // que acabamos de importar do backend. O estado já foi atualizado via setVaccines acima.

      // Configurar alertas com base nas vacinas importadas + as já existentes
      // Regra: considerar apenas a vacina mais recente por grupo canônico.
      const allVaccinesNow = [...(vaccines || []), ...createdVaccines];
      const latestByType = latestVaccinePerGroup(allVaccinesNow);

      const overdueCurrent = Array.from(latestByType.values()).filter((v) => {
        if (!v.next_dose_date) return false;
        const next = createLocalDate(v.next_dose_date);
        return !Number.isNaN(next.getTime()) && next.getTime() < Date.now();
      });

      if (overdueCurrent.length > 0) {
        localStorage.setItem(
          'vaccine_alerts',
          JSON.stringify({
            count: overdueCurrent.length,
            vaccines: overdueCurrent.map((v) => v.vaccine_name),
            timestamp: Date.now(),
          })
        );
      }
    } else {
      setImportVaccineLoading(false);
      showBlockingNotice('❌ Nenhuma vacina foi importada. Verifique se você está logado e tente novamente.');
    }
  };

  // Current pet based on selection
  const currentPet = pets.find(p => p.pet_id === selectedPetId) || pets[0];
  const currentPetIndex = useMemo(() => {
    if (pets.length === 0) return -1;
    const idx = pets.findIndex(p => p.pet_id === selectedPetId);
    return idx >= 0 ? idx : 0;
  }, [pets, selectedPetId]);

  const switchPetByOffset = useCallback((offset: number) => {
    if (pets.length < 2) return;
    const safeIdx = currentPetIndex >= 0 ? currentPetIndex : 0;
    const nextIdx = (safeIdx + offset + pets.length) % pets.length;
    const nextPet = pets[nextIdx];
    if (!nextPet) return;
    setSelectedPetId(nextPet.pet_id);
    setShowPetSelector(false);
  }, [pets, currentPetIndex]);

  const petEventsByPet = useMemo(
    () => (selectedPetId ? { [selectedPetId]: petEvents } : {}),
    [selectedPetId, petEvents],
  );

  // ── Eventos canônicos + interações multipet (considera TODOS os pets, não só o selecionado) ──
  const multipetInteractions = useMultipetInteractions(pets, {
    feedingPlanByPet: feedingPlan,
    petEventsByPet,
  });
  const {
    topAttentionAlerts,
    topAttentionPetCount,
    selectedPetActiveAlerts: _selectedPetActiveAlerts,
    selectedPetAllAlerts: _selectedPetAllAlerts,
    selectedPetCardAlerts,
    selectedPetCardColors,
  } = useHomeInteractionCenter(
    multipetInteractions.interactions,
    multipetInteractions.canonicalEvents,
    selectedPetId,
  );

  // ── Notification dispatcher — conecta eventos reais às policies ──
  const { rules: masterRules } = useMasterInteractionRules();
  useHomeNotificationBridge(multipetInteractions.canonicalEvents, masterRules);

  const homePreferenceScopeId = useMemo(
    () => String(loggedUserId || tutor?.id || currentPet?.owner_user_id || 'petmol-home'),
    [loggedUserId, tutor?.id, currentPet?.owner_user_id]
  );

  const _selectedPetCareBreakdown = useMemo(() => {
    const todayRef = new Date();
    todayRef.setHours(0, 0, 0, 0);
    const todayStr = dateToLocalISO(todayRef);

    type CareItem = { key: string; compliant: boolean; label: string };
    const items: CareItem[] = [];

    type ExtendedVaccineRecord = VaccineRecord & { history_status?: string; tracking_mode?: string };
    const vaccinesData: ExtendedVaccineRecord[] = vaccines || [];
    const petCareCollections = getPetCareCollections(currentPet);
    const groomingData: GroomingRecord[] = groomingRecords?.length ? groomingRecords : petCareCollections.groomingRecords;
    const parasiteData: ParasiteControl[] = parasiteControls?.length ? parasiteControls : petCareCollections.parasiteControls;

    const currentVaccineRecords = vaccinesData.filter((v) => {
      const historyStatus = String(v?.history_status || '').toLowerCase();
      const trackingMode = String(v?.tracking_mode || '').toLowerCase();
      const dueSource = String(v?.next_due_source || '').toLowerCase();
      if (historyStatus === 'history') return false;
      if (historyStatus === 'current' || historyStatus === 'active') return true;
      if (trackingMode === 'active' || trackingMode === 'protocol') return true;
      if (dueSource === 'protocol') return true;
      return false;
    });
    const hasVaccineOverdue = currentVaccineRecords.some((v) => {
      const dueRaw = String(v?.next_dose_date || '').split('T')[0];
      if (!dueRaw) return false;
      const dueDate = createLocalDate(dueRaw);
      return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < todayRef.getTime();
    });
    const hasGroomingOverdue = _selectedPetAllAlerts.some((a: PetInteractionItem) => a.category === 'grooming' && (a.status === 'overdue' || a.status === 'today'));

    const hasCurrentRegimen = currentVaccineRecords.length > 0;
    items.push({ key: 'vaccine', compliant: hasCurrentRegimen && !hasVaccineOverdue, label: 'Vacina' });

    const groomingEligible = groomingData.length > 0 || _selectedPetAllAlerts.some((a: PetInteractionItem) => a.category === 'grooming');
    if (groomingEligible) {
      items.push({ key: 'grooming', compliant: !hasGroomingOverdue, label: 'Higiene' });
    }

    const parasiteTypes: Array<'dewormer' | 'flea_tick' | 'collar'> = ['dewormer', 'flea_tick', 'collar'];
    parasiteTypes.forEach((type) => {
      const controlsForType = parasiteData.filter((c) => c.type === type);
      const latest = controlsForType
        .slice()
        .sort((a, b) => {
          const da = createLocalDate(String(a?.date_applied || '1970-01-01')).getTime();
          const db = createLocalDate(String(b?.date_applied || '1970-01-01')).getTime();
          return db - da;
        })[0];

      const dueRaw = latest?.next_due_date ? String(latest.next_due_date).split('T')[0] : '';
      const dueDate = dueRaw ? createLocalDate(dueRaw) : null;
      const compliant = !!dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() >= todayRef.getTime();
      const parasiteLabel = type === 'dewormer' ? 'Vermífugo' : type === 'flea_tick' ? 'Antipulgas' : 'Coleira';
      items.push({ key: `parasite-${type}`, compliant, label: parasiteLabel });
    });

    type MedicationEventLike = {
      id: string;
      type?: string;
      source?: string;
      status?: string;
      extra_data?: string | null;
      scheduled_at?: string;
      next_due_date?: string | null;
    };

    const activeMedicationEvents = (petEvents as MedicationEventLike[]).filter((ev) => {
      if (ev.type !== 'medicacao' || ev.source === 'document' || ev.status === 'cancelled') return false;
      if (ev.status !== 'completed') return true;
      try {
        const ex = JSON.parse(String(ev.extra_data || '{}')) as Record<string, unknown>;
        if (ex.treatment_days) {
          const appliedDates = Array.isArray(ex.applied_dates) ? ex.applied_dates : [];
          return appliedDates.length < parseInt(String(ex.treatment_days), 10);
        }
      } catch {}
      return false;
    });

    activeMedicationEvents.forEach((ev) => {
        let extra: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(String(ev.extra_data || '{}'));
          if (parsed && typeof parsed === 'object') {
            extra = parsed as Record<string, unknown>;
          }
        } catch {
          extra = {};
        }

        const totalDoses = extra.treatment_days ? parseInt(String(extra.treatment_days), 10) : 0;
        const appliedDatesRaw = Array.isArray(extra.applied_dates) ? extra.applied_dates : [];
        const skippedDatesRaw = Array.isArray(extra.skipped_dates) ? extra.skipped_dates : [];
        const appliedDates: string[] = appliedDatesRaw.map((d) => String(d).replace('T', ' ').split(' ')[0]);
        const skippedDates: string[] = skippedDatesRaw.map((d) => String(d).replace('T', ' ').split(' ')[0]);

        let compliant = true;
        if (totalDoses > 0) {
          const startRaw = String(ev.scheduled_at || '').replace('T', ' ').split(' ')[0];
          const startDate = createLocalDate(startRaw);
          if (!Number.isNaN(startDate.getTime())) {
            if (startDate.getTime() > todayRef.getTime()) {
              compliant = true;
            } else {
              const appliedToday = appliedDates.includes(todayStr);
              const skippedToday = skippedDates.includes(todayStr);
              compliant = appliedToday || skippedToday;
            }
          }
        } else if (ev.status !== 'completed') {
          const appliedToday = appliedDates.includes(todayStr);
          const skippedToday = skippedDates.includes(todayStr);
          const dueRaw = ev.next_due_date ? String(ev.next_due_date).split('T')[0] : '';
          const dueDate = dueRaw ? createLocalDate(dueRaw) : null;
          const dueNow = !dueDate || (!Number.isNaN(dueDate.getTime()) && dueDate.getTime() <= todayRef.getTime());
          compliant = !dueNow || appliedToday || skippedToday;
        }

        items.push({ key: `med-${ev.id}`, compliant, label: 'Medicação' });
      });

    const totalItems = items.length;
    const compliantItems = items.filter(item => item.compliant).length;
    const overdueItems = Math.max(0, totalItems - compliantItems);
    const pendingItems = items.filter(item => !item.compliant);
    const pendingCounts = pendingItems.reduce((acc: Record<string, number>, item) => {
      acc[item.label] = (acc[item.label] || 0) + 1;
      return acc;
    }, {});
    const pendingSummary = Object.entries(pendingCounts)
      .map(([label, count]) => (count > 1 ? `${label} (${count})` : label))
      .join(', ');

    const hoverReason = overdueItems === 0
      ? 'Tudo em dia: régua em 100%.'
      : `Régua abaixo de 100% porque ${overdueItems} item(ns) está(ão) pendente(s): ${pendingSummary}.`;

    return { totalItems, compliantItems, overdueItems, hoverReason };
  }, [_selectedPetAllAlerts, currentPet, petEvents, vaccines, parasiteControls, groomingRecords]);
  const _selectedPetCareScore = useMemo(() => {
    if (_selectedPetCareBreakdown.totalItems === 0) return 100;
    const proportional = Math.round((_selectedPetCareBreakdown.compliantItems / _selectedPetCareBreakdown.totalItems) * 100);
    return Math.max(15, Math.min(100, proportional));
  }, [_selectedPetCareBreakdown]);
  const _selectedPetNeedsAttention = _selectedPetCareBreakdown.overdueItems > 0;

  const activeMedicationCount = useMemo(() => {
    return petEvents.filter(ev => {
      if ((ev.type !== 'medicacao' && ev.type !== 'medication') || ev.source === 'document' || ev.status === 'cancelled') return false;
      if (ev.status !== 'completed') return true;
      try {
        const ex = JSON.parse(String((ev as unknown as Record<string, unknown>).extra_data || '{}')) as Record<string, unknown>;
        if (ex.treatment_days) {
          const applied = Array.isArray(ex.applied_dates) ? ex.applied_dates.length : 0;
          return applied < parseInt(String(ex.treatment_days), 10);
        }
      } catch {}
      return false;
    }).length;
  }, [petEvents]);

  const medicationCardStatus = useMemo(() => {
    const todayStr = localTodayISO();
    const todayRef = new Date(`${todayStr}T00:00:00`);
    const activeMeds = petEvents.filter(ev => {
      if ((ev.type !== 'medicacao' && ev.type !== 'medication') || ev.source === 'document' || ev.status === 'cancelled') return false;
      if (ev.status !== 'completed') return true;
      try {
        const ex = JSON.parse(String((ev as unknown as Record<string, unknown>).extra_data || '{}')) as Record<string, unknown>;
        if (ex.treatment_days) {
          const applied = Array.isArray(ex.applied_dates) ? (ex.applied_dates as string[]).length : 0;
          return applied < parseInt(String(ex.treatment_days), 10);
        }
      } catch {}
      return false;
    });
    if (activeMeds.length === 0) return { alert: false as const, color: 'neutral' as const };
    let totalSlots = 0;
    let doneSlots = 0;
    activeMeds.forEach(ev => {
      try {
        const ex = JSON.parse(String((ev as unknown as Record<string, unknown>).extra_data || '{}')) as Record<string, unknown>;
        const startRaw = String(ev.scheduled_at || '').replace('T', ' ').split(' ')[0];
        const startDate = startRaw ? createLocalDate(startRaw) : null;
        const nextDueRaw = ev.next_due_date ? String(ev.next_due_date).replace('T', ' ').split(' ')[0] : '';
        const nextDueDate = nextDueRaw ? createLocalDate(nextDueRaw) : null;
        const isFutureStart = startDate && !Number.isNaN(startDate.getTime()) && startDate.getTime() > todayRef.getTime();
        const isFutureDue = nextDueDate && !Number.isNaN(nextDueDate.getTime()) && nextDueDate.getTime() > todayRef.getTime();

        if (isFutureStart || isFutureDue) return;

        const times = Array.isArray(ex.reminder_times) && (ex.reminder_times as string[]).length > 0
          ? ex.reminder_times as string[]
          : null;
        if (times) {
          const appliedDatetimes: string[] = Array.isArray(ex.applied_datetimes) ? ex.applied_datetimes as string[] : [];
          totalSlots += times.length;
          doneSlots += times.filter((t: string) => appliedDatetimes.includes(`${todayStr}_${t}`)).length;
        } else {
          const appliedDates: string[] = Array.isArray(ex.applied_dates) ? ex.applied_dates as string[] : [];
          totalSlots += 1;
          doneSlots += appliedDates.includes(todayStr) ? 1 : 0;
        }
      } catch {}
    });
    if (totalSlots === 0) return { alert: false as const, color: 'ok' as const };
    if (doneSlots === totalSlots) return { alert: false as const, color: 'ok' as const };
    if (doneSlots > 0) return { alert: true as const, color: 'warning' as const };
    return { alert: true as const, color: 'critical' as const };
  }, [petEvents]);

  const handleTopAttentionSelect = useCallback((interaction: PetInteractionItem) => {
    if (interaction.pet_id) setSelectedPetId(interaction.pet_id);
    setShowTopAttentionModal(false);
    switch (interaction.action_target) {
      case 'health/vaccines':
        setShowVaccineSheet(true);
        break;
      case 'health/parasites':
      case 'health/parasites/dewormer':
        setShowVermifugoSheet(true);
        break;
      case 'health/parasites/flea_tick':
        setShowAntipulgasSheet(true);
        break;
      case 'health/parasites/collar':
        setShowColeiraSheet(true);
        break;
      case 'health/medication':
        setShowMedicationSheet(true);
        break;
      case 'health/grooming':
        setShowBanhoTosaSheet(true);
        break;
      case 'health/food':
        setShowFoodSheet(true);
        break;
      default:
        break;
    }
  }, [setSelectedPetId, setShowVaccineSheet, setShowVermifugoSheet, setShowAntipulgasSheet, setShowColeiraSheet, setShowMedicationSheet, setShowBanhoTosaSheet, setShowFoodSheet]);

  const {
    applyHomeSurfaceResolution,
    openVaccines: handleOpenVaccines,
    openVermifugo: handleOpenVermifugo,
    openAntipulgas: handleOpenAntipulgas,
    openColeira: handleOpenColeira,
    openDocuments: handleOpenDocuments,
    openGrooming: handleOpenGrooming,
    openMedication: handleOpenMedication,
    openFood: handleOpenFood,
    openEvents: handleOpenEvents,
    openHealth: handleOpenHealth,
  } = useHomeSurfaceActions({
    setShowVaccineSheet,
    setShowVermifugoSheet,
    setShowAntipulgasSheet,
    setShowColeiraSheet,
    setShowMedicalVault,
    setShowBanhoTosaSheet,
    setShowMedicationSheet,
    setShowFoodSheet,
    setShowHealthModal,
    setShowHealthOptionsModal,
    setEditPetInitialSection,
    setShowEditModal,
    setHealthModalMode,
    setHealthActiveTab,
  });

  const {
    closeVermifugoSheet,
    closeAntipulgasSheet,
    closeColeiraSheet,
    closeGroomingSheet,
    closeFoodSheet,
    handleFoodSaved,
    closeVaccineSheet,
    handleVaccineQuickAdd,
    openVaccineCardReader,
    closeVaccineCardReader,
    openVaccineFormFromCardReader,
    closeQuickAddVaccine,
    openFullVaccineFormFromQuickAdd,
    handleVaccineFullForm,
    handleVaccineEdit,
    refreshVaccines,
    deleteAllVaccines,
    closeMedicationSheet,
    refreshMedicationHistory,
  } = useHomeItemSheetActions({
    selectedPetId,
    setShowVermifugoSheet,
    setShowAntipulgasSheet,
    setShowColeiraSheet,
    setShowBanhoTosaSheet,
    setShowFoodSheet,
    setShowVaccineSheet,
    setShowAIUpload,
    setShowQuickAddVaccine,
    setShowVaccineForm,
    setShowMedicationSheet,
    setVaccineFormData,
    fetchFeedingPlan,
    loadVaccines,
    fetchPetEvents,
    handleEditVaccine,
    handleDeleteAllVaccines,
  });

  const {
    openAddPetModal,
    openEditPetModal,
    togglePetSelector,
    closePetSelector,
    openTopAttentionModal,
    closeTopAttentionModal,
    closeArrivalFlow,
    openArrivalAttendanceOptions,
    closeArrivalAttendanceOptions,
    openArrivalVaccineForm,
    navigateToSaudeFromArrival,
    navigateToSaudeFromHealthOptions,
    closeServiceTypeModal,
    closeHealthOptionsModal,
    openEventTypeModal,
    closeEventTypeModal,
    closeVetOptionsModal,
    openHealthTab,
    selectHealthTab,
    closeHealthModal,
    backFromHealthModal,
    openVaccineCenterFromHealthModal,
    startEventRegistration,
    closeAddPetModal,
    handleAddPetComplete,
    closeEditPetModal,
  } = useHomeModalUtilityActions({
    router,
    selectedPetId,
    showPetSelector,
    setShowArrivalAlert,
    setShowAttendanceOptions,
    setShowHealthOptionsModal,
    setShowServiceTypeModal,
    setShowEventTypeModal,
    setShowVetOptionsModal,
    setShowAddPetModal,
    setShowEditModal,
    setShowPetSelector,
    setShowTopAttentionModal,
    setShowHealthModal,
    setShowVaccineForm,
    setShowVaccineSheet,
    setHealthModalMode,
    setHealthActiveTab,
    setEventTypeLocked,
    setEventFormData,
    setEditPetInitialSection,
    setPets,
    setSelectedPetId,
    setPhotoTimestamps,
  });

  const {
    closeVetHistoryModal,
    openHealthOptionsFromVetHistory,
    openGroomingFromVetHistory,
    openFoodFromVetHistory,
    openHealthTabFromVetHistory,
    openVetHistoryDocumentFolder,
    closeVetHistoryDocumentFolder,
    removeDocumentFromVetHistoryFolder,
    navigateToSaudeFromVetHistory,
  } = useHomeHistoryActions({
    router,
    selectedPetId,
    setShowVetHistoryModal,
    setShowDocUploadInHistorico,
    setShowHealthOptionsModal,
    setShowHealthModal,
    setHealthModalMode,
    setHealthActiveTab,
    setDocFolderModal,
  });

  const handlePushActionCommerceOpen = useCallback(() => {
    if (!pushActionSheet || !currentPet) return;

    const intent = resolvePushActionSheetCommerceIntent({
      type: pushActionSheet.type,
      petId: currentPet.pet_id,
      itemName: pushActionSheet.itemName,
    });

    setPushActionSheet(null);

    if (!intent) {
      return;
    }

    openHomeContextualCommerce(intent, {
      openFoodSheet: handleOpenFood,
      openParasiteSheet: handleOpenVermifugo,
    });
  }, [currentPet, handleOpenFood, handleOpenVermifugo, pushActionSheet]);

  const handleSaveCheckinPreference = useCallback(async () => {
    setCheckinPickerSaving(true);
    try {
      const tok = getToken();
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
        credentials: 'include',
        body: JSON.stringify({ monthly_checkin_day: checkinDayDraft }),
      });
      if (res.ok) {
        setTutorCheckinDay(checkinDayDraft);
        setShowCheckinPicker(false);
      }
    } finally {
      setCheckinPickerSaving(false);
    }
  }, [checkinDayDraft]);

  const alertVaccinesValue = selectedPetCardAlerts.vacinas;
  const alertParasitesValue = selectedPetCardAlerts.vermifugo || selectedPetCardAlerts.antipulgas || selectedPetCardAlerts.coleira;
  const alertMedicationValue = medicationCardStatus.alert;

  // Retorno automático ao check-up quando o modal fecha
  useEffect(() => {
    if (pushActionSheet !== null) {
      pushActionSheetWasOpenRef.current = true;
    } else if (pushActionSheetWasOpenRef.current) {
      pushActionSheetWasOpenRef.current = false;
      if (typeof window !== 'undefined' && sessionStorage.getItem('petmol_checkup_return') === '1') {
        sessionStorage.removeItem('petmol_checkup_return');
        router.push('/check-up');
      }
    }
  }, [pushActionSheet, router]);

  // Retorno automático ao check-up quando toda a jornada de vacina termina
  // (sheet → form → quick-add; só redireciona quando TUDO fecha)
  useEffect(() => {
    if (showVaccineSheet) {
      vaccineSheetWasOpenRef.current = true;
    }

    const allVaccineClosed = !showVaccineSheet && !showVaccineForm && !showQuickAddVaccine;
    if (vaccineSheetWasOpenRef.current && allVaccineClosed) {
      vaccineSheetWasOpenRef.current = false;
      if (typeof window !== 'undefined' && sessionStorage.getItem('petmol_checkup_return') === '1') {
        sessionStorage.removeItem('petmol_checkup_return');
        router.push('/check-up');
      }
    }
  }, [showVaccineSheet, showVaccineForm, showQuickAddVaccine, router]);

  // Retorno automático ao check-up quando EditPetModal fecha
  useEffect(() => {
    if (showEditModal) {
      editModalWasOpenRef.current = true;
    } else if (editModalWasOpenRef.current) {
      editModalWasOpenRef.current = false;
      if (typeof window !== 'undefined' && sessionStorage.getItem('petmol_checkup_return') === '1') {
        sessionStorage.removeItem('petmol_checkup_return');
        router.push('/check-up');
      }
    }
  }, [showEditModal, router]);

  // ── Deep link: abre modal via query string ao montar (ex.: push notification) ──
  // URL pattern: /home?modal=vaccines&petId=<id>
  // Suportado: vaccines | parasites | medication | eventos | grooming | health | food
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (!pets.length) return; // aguarda os pets carregarem
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const modal = params.get('modal');
    if (!modal) return;
    deepLinkHandledRef.current = true;

    const requestedPetId = params.get('petId');
    const resolvedPetId = requestedPetId && pets.some((pet) => pet.pet_id === requestedPetId)
      ? requestedPetId
      : selectedPetId && pets.some((pet) => pet.pet_id === selectedPetId)
        ? selectedPetId
        : pets[0]?.pet_id || null;

    if (resolvedPetId && resolvedPetId !== selectedPetId) {
      setSelectedPetId(resolvedPetId);
    }

    const eventId = params.get('eventId') || undefined;
    const itemName = params.get('itemName') || undefined;

    const destination = resolveHomeDeepLinkDestination(modal, params.get('tab'));
    if (destination?.kind === 'push-action-sheet' && resolvedPetId) {
      setPushActionSheet({ type: destination.actionSheetType as ActionSheetType, eventId, itemName });
    } else if (destination) {
      applyHomeSurfaceResolution(destination);
    }

    // limpa query string sem recarregar a página
    window.history.replaceState({}, '', '/home');
  }, [applyHomeSurfaceResolution, pets.length, selectedPetId]);


  useEffect(() => {
    if (currentPet) {
      console.log('🖥️ [TELA] Dados sendo exibidos:', {
        nome: currentPet.pet_name,
        peso: currentPet.weight_history?.[0]?.weight,
        peso_unit: currentPet.weight_history?.[0]?.weight_unit,
        weight_history_completo: currentPet.weight_history,
        esperado: '12.5 kg'
      });
    }
  }, [currentPet]);

  // Fetch documents when vet history modal opens
  useEffect(() => {
    if (!showVetHistoryModal || !currentPet) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE_URL}/pets/${currentPet.pet_id}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setVetHistoryDocs(Array.isArray(data) ? data : []))
      .catch(() => {});
    // Refrescar vacinas ao abrir o histórico
    loadVaccines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVetHistoryModal, currentPet?.pet_id]);

  useEffect(() => {
    if (showVetHistoryModal) {
      setHistoricoTab('detalhado');
    }
  }, [showVetHistoryModal]);

  if (isLoading || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl sm:text-5xl md:text-6xl mb-4">🐾</div>
          <p className="text-slate-600">{t('loading')}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div
      className="min-h-screen bg-gray-50"
      onTouchStart={(e) => {
        // Só ativa pull-to-refresh se o scroll já estiver no topo
        if (window.scrollY === 0) {
          pullStartYRef.current = e.touches[0].clientY;
        } else {
          pullStartYRef.current = 0;
        }
      }}
      onTouchMove={(e) => {
        if (!pullStartYRef.current) return;
        const delta = e.touches[0].clientY - pullStartYRef.current;
        if (delta > 0) {
          // Resistência progressiva: fica mais difícil passar de 80px
          setPullY(Math.min(80, delta * 0.45));
        }
      }}
      onTouchEnd={async () => {
        if (pullY >= 60 && !isRefreshing) {
          setIsRefreshing(true);
          setPullY(0);
          pullStartYRef.current = 0;
          try {
            await new Promise<void>((resolve) => {
              refreshAllRef.current();
              setTimeout(resolve, 800);
            });
          } finally {
            setIsRefreshing(false);
          }
        } else {
          setPullY(0);
          pullStartYRef.current = 0;
        }
      }}
    >
      {/* Indicador de pull-to-refresh */}
      <div
        className="flex justify-center items-center overflow-hidden transition-all duration-200"
        style={{ height: isRefreshing ? 44 : pullY > 0 ? pullY : 0 }}
      >
        <div className={`flex items-center gap-2 text-sm text-gray-400 ${isRefreshing ? 'animate-pulse' : ''}`}>
          {isRefreshing ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <span>Atualizando...</span>
            </>
          ) : pullY >= 60 ? (
            <span>↑ Solte para atualizar</span>
          ) : (
            <span>↓ Puxe para atualizar</span>
          )}
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Pet Management - if pets exist */}
        {pets.length > 0 ? (
          <>
            {checkupBanner && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-blue-900 leading-snug">
                    Faltam {checkupBanner.pendingCount} {checkupBanner.pendingCount === 1 ? 'passo' : 'passos'} para colocar {checkupBanner.petName} em dia
                  </p>
                </div>
                <button
                  onClick={() => router.push('/check-up')}
                  className="flex-shrink-0 text-xs font-semibold text-[#0056D2] bg-blue-100 px-3 py-1.5 rounded-lg active:scale-95 transition-transform"
                >
                  Continuar
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('petmol_checkup_dismissed', '1');
                    setCheckupBanner(null);
                  }}
                  className="flex-shrink-0 text-gray-300 text-sm leading-none"
                >
                  ✕
                </button>
              </div>
            )}
            {(() => {
              const currentPet = pets.find(p => p.pet_id === selectedPetId);
              if (!currentPet) return null;
              const { vaccines, parasiteControls, groomingRecords } = getPetCareCollections(currentPet);
              
              return (
                <div className="max-w-md mx-auto space-y-2">
                  <PetTabs
                    pets={pets.map(p => ({
                      id: p.pet_id,
                      name: p.pet_name,
                      photo: p.photo,
                      species: p.species
                    }))}
                    selectedPetId={selectedPetId!}
                    onPetChange={(petId) => setSelectedPetId(String(petId))}
                  >
                    <HomePetHeader
                      currentPet={currentPet}
                      pets={pets}
                      selectedPetId={selectedPetId}
                      setSelectedPetId={setSelectedPetId}
                      photoTimestamps={photoTimestamps}
                      getPhotoUrl={getPhotoUrl}
                      switchPetByOffset={switchPetByOffset}
                      onOpenAddPetModal={openAddPetModal}
                      onOpenEditPetModal={openEditPetModal}
                      loggedUserId={loggedUserId}
                      familyOwnerNames={familyOwnerNames}
                      showPetSelector={showPetSelector}
                      onTogglePetSelector={togglePetSelector}
                      onClosePetSelector={closePetSelector}
                      topAttentionPetCount={topAttentionPetCount}
                      onOpenTopAttentionModal={openTopAttentionModal}
                      onCloseTopAttentionModal={closeTopAttentionModal}
                      showTopAttentionModal={showTopAttentionModal}
                      topAttentionAlerts={topAttentionAlerts}
                      onAlertSelect={handleTopAttentionSelect}
                      selectedPetNeedsAttention={_selectedPetNeedsAttention}
                      selectedPetCareScore={_selectedPetCareScore}
                    />
                  </PetTabs>

                  <HomePetDashboard
                    petEvents={petEvents}
                    vaccines={vaccines}
                    parasiteControls={parasiteControls}
                    groomingRecords={groomingRecords}
                    feedingPlan={feedingPlan}
                    viewerPreferenceId={homePreferenceScopeId}
                    currentPet={currentPet}
                    tutorCheckinDay={tutorCheckinDay}
                    selectedPetId={selectedPetId}
                    quickMarkId={quickMarkId}
                    setQuickMarkId={setQuickMarkId}
                    quickMarkDate={quickMarkDate}
                    setQuickMarkDate={setQuickMarkDate}
                    quickMarkNotes={quickMarkNotes}
                    setQuickMarkNotes={setQuickMarkNotes}
                    quickMarkSaving={quickMarkSaving}
                    setQuickMarkSaving={setQuickMarkSaving}
                    quickMarkToast={quickMarkToast}
                    setQuickMarkToast={setQuickMarkToast}
                    fetchPetEvents={fetchPetEvents}
                    onOpenHealth={handleOpenHealth}
                    onOpenDocuments={handleOpenDocuments}
                    alertVacinas={selectedPetCardAlerts.vacinas}
                    colorVacinas={selectedPetCardColors.vacinas}
                    alertVermifugo={selectedPetCardAlerts.vermifugo}
                    colorVermifugo={selectedPetCardColors.vermifugo}
                    alertAntipulgas={selectedPetCardAlerts.antipulgas}
                    colorAntipulgas={selectedPetCardColors.antipulgas}
                    alertColeira={selectedPetCardAlerts.coleira}
                    colorColeira={selectedPetCardColors.coleira}
                    alertGrooming={selectedPetCardAlerts.grooming}
                    colorGrooming={selectedPetCardColors.grooming}
                    alertFood={selectedPetCardAlerts.food}
                    colorFood={selectedPetCardColors.food}
                    alertMedicacao={medicationCardStatus.alert}
                    colorMedicacao={medicationCardStatus.color}
                    onOpenGrooming={handleOpenGrooming}
                    onOpenMedication={handleOpenMedication}
                    onOpenFood={handleOpenFood}
                    onOpenEvents={handleOpenEvents}
                    onOpenFamily={togglePetSelector}
                  />
                </div>
              );
            })()}
          </>
        ) : (
          /* No Pets - Show Simple Message */
          <div className="space-y-3">
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl sm:text-5xl md:text-6xl mb-4">🐾</div>
              <p className="text-lg">{t('common.welcome')}</p>
              <p className="text-sm">{t('common.tagline')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Central de Saúde */}
      {showHealthModal && (
        <HealthModal
          currentPet={currentPet}
          selectedPetId={selectedPetId}
          photoTimestamps={photoTimestamps}
          healthModalMode={healthModalMode}
          healthActiveTab={healthActiveTab}
          eventTypeLocked={eventTypeLocked}
          onBackFromHealthModal={backFromHealthModal}
          onCloseHealthModal={closeHealthModal}
          onSelectHealthTab={selectHealthTab}
          onOpenVaccineCenter={openVaccineCenterFromHealthModal}
          vaccines={vaccines}
          parasiteControls={parasiteControls}
          showParasiteForm={showParasiteForm}
          setShowParasiteForm={setShowParasiteForm}
          editingParasite={editingParasite}
          setEditingParasite={setEditingParasite}
          parasiteFormData={parasiteFormData}
          setParasiteFormData={setParasiteFormData}
          handleDeleteParasite={handleDeleteParasite}
          handleEditParasite={handleEditParasite}
          handleSaveParasite={handleSaveParasite}
          resetParasiteForm={resetParasiteForm}
          groomingRecords={groomingRecords}
          editingGrooming={editingGrooming}
          groomingFormData={groomingFormData}
          setGroomingFormData={setGroomingFormData}
          groomingDueAlerts={groomingDueAlerts}
          setGroomingDueAlerts={setGroomingDueAlerts}
          handleDeleteGrooming={handleDeleteGrooming}
          handleEditGrooming={handleEditGrooming}
          handleSaveGrooming={handleSaveGrooming}
          handleCancelEditGrooming={handleCancelEditGrooming}
          showPlaceSuggestions={showPlaceSuggestions}
          setShowPlaceSuggestions={setShowPlaceSuggestions}
          searchingPlaces={searchingPlaces}
          placeSuggestions={placeSuggestions}
          searchPlaces={searchPlaces}
          selectPlace={selectPlace}
          fetchFeedingPlan={fetchFeedingPlan}
          petEvents={petEvents}
          eventsLoading={eventsLoading}
          editingEventId={editingEventId}
          setEditingEventId={setEditingEventId}
          eventFormData={eventFormData}
          setEventFormData={setEventFormData}
          eventSaving={eventSaving}
          setEventSaving={setEventSaving}
          setCreatedEventId={setCreatedEventId}
          attachDocFiles={attachDocFiles}
          setAttachDocFiles={setAttachDocFiles}
          setShowAttachDoc={setShowAttachDoc}
          docFolderModal={docFolderModal}
          setDocFolderModal={setDocFolderModal}
          handleDeleteEvent={handleDeleteEvent}
          fetchPetEvents={fetchPetEvents}
          openEditEvent={openEditEvent}
          vetHistoryDocs={vetHistoryDocs}
        />
      )}

      {/* Modal: Guia Completo de Vacinas */}
      {showAllVaccinesGuide && (
        <VaccineGuide
          vaccineInfo={vaccineInfo}
          setShowAllVaccinesGuide={setShowAllVaccinesGuide}
        />
      )}

      {/* Modal Formulário de Vacina */}
      {(showVaccineForm || showAIUpload || cardAnalysis) && (
        <VaccineWorkflowModals
          showVaccineForm={showVaccineForm}
          showAIUpload={showAIUpload}
          cardAnalysis={cardAnalysis}
          editingVaccine={editingVaccine}
          vaccineFormData={vaccineFormData}
          setVaccineFormData={setVaccineFormData}
          resetVaccineForm={resetVaccineForm}
          onOpenAIUpload={openVaccineCardReader}
          onCloseAIUpload={closeVaccineCardReader}
          onOpenVaccineFormFromAIUpload={openVaccineFormFromCardReader}
          currentPet={currentPet}
          vaccineFiles={vaccineFiles}
          setVaccineFiles={setVaccineFiles}
          selectedPetId={selectedPetId}
          handleSaveVaccine={handleSaveVaccine}
          vaccineFormSaving={vaccineFormSaving}
          pets={pets}
          closeCardAnalysis={closeCardAnalysis}
          reviewRegistros={reviewRegistros}
          reviewExpectedCount={reviewExpectedCount}
          setReviewExpectedCount={setReviewExpectedCount}
          setReviewConfirmed={setReviewConfirmed}
          addReviewRegistro={addReviewRegistro}
          removeReviewRegistro={removeReviewRegistro}
          updateReviewRegistro={updateReviewRegistro}
          mapNomeComercialToTipo={mapNomeComercialToTipo}
          handleImportAnalyzedVaccines={handleImportAnalyzedVaccines}
          importVaccineLoading={importVaccineLoading}
          reviewConfirmed={reviewConfirmed}
          reviewLearnEnabled={reviewLearnEnabled}
        />
      )}

      {/* Modal Cofre de Documentos */}
      {showMedicalVault && (
        <MedicalVaultModal
          currentPet={currentPet}
          setShowMedicalVault={setShowMedicalVault}
          setVetHistoryDocs={setVetHistoryDocs}
        />
      )}

      {/* Edit Pet Modal */}
      {showEditModal && currentPet && (
        <EditPetModal
          pet={currentPet}
          photoVersion={selectedPetId ? photoTimestamps[selectedPetId] : undefined}
          onClose={closeEditPetModal}
          onSave={handleSavePet}
          onDelete={handleDeletePet}
          initialSection={editPetInitialSection}
        />
      )}

      {/* Modal Histórico Veterinário Completo */}
      {showVetHistoryModal && currentPet && (
        <VetHistoryModal
          currentPet={currentPet}
          historicoTab={historicoTab}
          setHistoricoTab={setHistoricoTab}
          vaccines={vaccines}
          petEvents={petEvents}
          vetHistoryDocs={vetHistoryDocs}
          onClose={closeVetHistoryModal}
          onOpenHealthOptions={openHealthOptionsFromVetHistory}
          onOpenGrooming={openGroomingFromVetHistory}
          onOpenFood={openFoodFromVetHistory}
          onOpenHealthTab={openHealthTabFromVetHistory}
          onOpenDocumentFolder={openVetHistoryDocumentFolder}
          onNavigateToSaude={navigateToSaudeFromVetHistory}
        />
      )}

      {/* Modal de pasta de documentos */}
      <HistoryDocumentsOverlay
        currentPet={currentPet}
        setHistoricoTab={setHistoricoTab}
        showDocUploadInHistorico={showDocUploadInHistorico}
        setShowDocUploadInHistorico={setShowDocUploadInHistorico}
        setVetHistoryDocs={setVetHistoryDocs}
        docFolderModal={docFolderModal}
        onCloseDocFolder={closeVetHistoryDocumentFolder}
        onRemoveDocFromFolder={removeDocumentFromVetHistoryFolder}
      />

      {/* Modal de Feedback/Correção */}
      {showFeedbackModal && feedbackVaccine && (
        <FeedbackModal
          feedbackVaccine={feedbackVaccine}
          feedbackFormData={feedbackFormData}
          setFeedbackFormData={setFeedbackFormData}
          setShowFeedbackModal={setShowFeedbackModal}
          setFeedbackVaccine={setFeedbackVaccine}
          handleSubmitFeedback={handleSubmitFeedback}
        />
      )}

      {/* Modal Quick Add: Adicionar Vacina com Poucos Toques */}
      {showQuickAddVaccine && (
        <QuickAddVaccineModal
          quickAddData={quickAddData}
          setQuickAddData={setQuickAddData}
          commonVaccines={commonVaccines}
          handleQuickAddVaccine={handleQuickAddVaccine}
          onClose={closeQuickAddVaccine}
          onOpenFullForm={openFullVaccineFormFromQuickAdd}
        />
      )}

      <HomeNavigationModals
        currentPet={currentPet}
        showServiceTypeModal={showServiceTypeModal}
        onCloseServiceTypeModal={closeServiceTypeModal}
        showHealthOptionsModal={showHealthOptionsModal}
        onCloseHealthOptionsModal={closeHealthOptionsModal}
        onOpenHealthOptionsModal={() => setShowHealthOptionsModal(true)}
        showEventTypeModal={showEventTypeModal}
        onOpenEventTypeModal={openEventTypeModal}
        onCloseEventTypeModal={closeEventTypeModal}
        showVetOptionsModal={showVetOptionsModal}
        onCloseVetOptionsModal={closeVetOptionsModal}
        alertVaccinesValue={alertVaccinesValue}
        alertParasitesValue={alertParasitesValue}
        alertMedicationValue={alertMedicationValue}
        colorVaccinesValue={selectedPetCardColors.vacinas}
        colorVermifugoValue={selectedPetCardColors.vermifugo}
        colorAntipulgasValue={selectedPetCardColors.antipulgas}
        colorColeiraValue={selectedPetCardColors.coleira}
        colorMedicationValue={medicationCardStatus.color}
        onOpenHealthTab={openHealthTab}
        onStartEventRegistration={startEventRegistration}
        onOpenEditPet={openEditPetModal}
        getRecentVets={getRecentVets}
        onNavigateToSaude={navigateToSaudeFromHealthOptions}
        onOpenVaccines={handleOpenVaccines}
        onOpenVermifugo={handleOpenVermifugo}
        onOpenAntipulgas={handleOpenAntipulgas}
        onOpenColeira={handleOpenColeira}
        onOpenMedication={handleOpenMedication}
      />

      {/* Add Pet Modal */}
      {showAddPetModal && (
        <AddPetModal
          onClose={closeAddPetModal}
          onComplete={handleAddPetComplete}
        />
      )}
  {/* Sistema automático removido — sem geolocalização */}

      {/* ── PushActionSheet — tela curta de decisão (push → ação rápida) ── */}
      {pushActionSheet && currentPet && (
        <PushActionSheet
          type={pushActionSheet.type}
          petName={currentPet.pet_name || ''}
          petId={currentPet.pet_id}
          itemName={pushActionSheet.itemName}
          eventId={pushActionSheet.eventId}
          onClose={() => setPushActionSheet(null)}
          onOpenCommerce={handlePushActionCommerceOpen}
          onOpenFull={() => {
            setPushActionSheet(null);
            applyHomeSurfaceResolution(resolvePushActionSheetFullDestination(pushActionSheet.type));
          }}
        />
      )}

      {/* ── Sheets modernos por item ─────────────────────────────────────── */}
      {showVermifugoSheet && selectedPetId && (
        <ParasiteItemSheet
          type="dewormer"
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          parasiteControls={parasiteControls.filter(p => p.type === 'dewormer' || p.type === 'heartworm' || p.type === 'leishmaniasis')}
          onClose={closeVermifugoSheet}
          onRefresh={loadParasiteControls}
        />
      )}

      {showAntipulgasSheet && selectedPetId && (
        <ParasiteItemSheet
          type="flea_tick"
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          parasiteControls={parasiteControls.filter(p => p.type === 'flea_tick')}
          onClose={closeAntipulgasSheet}
          onRefresh={loadParasiteControls}
        />
      )}

      {showColeiraSheet && selectedPetId && (
        <ParasiteItemSheet
          type="collar"
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          parasiteControls={parasiteControls.filter(p => p.type === 'collar')}
          onClose={closeColeiraSheet}
          onRefresh={loadParasiteControls}
        />
      )}

      {showFoodSheet && currentPet && (
        <FoodItemSheet
          pet={currentPet}
          onClose={closeFoodSheet}
          onSaved={handleFoodSaved}
        />
      )}

      {showVaccineSheet && selectedPetId && (
        <VaccineItemSheet
          petName={currentPet?.pet_name}
          petSpecies={currentPet?.species}
          vaccines={vaccines}
          onClose={closeVaccineSheet}
          onQuickAdd={handleVaccineQuickAdd}
          onFullFormVaccine={handleVaccineFullForm}
          onEditVaccine={handleVaccineEdit}
          onDeleteVaccine={(v) => { handleDeleteVaccine(v); }}
          onDeleteAllVaccines={deleteAllVaccines}
          onRefreshVaccines={refreshVaccines}
          pendingCardFiles={pendingCardFiles}
          setPendingCardFiles={setPendingCardFiles}
          importingCard={importingCard}
          aiImageLimit={aiImageLimit}
          setAiImageLimit={setAiImageLimit}
          handleFilesSelectedAppend={handleFilesSelectedAppend}
          handleProcessCards={handleProcessCards}
        />
      )}

      {showMedicationSheet && selectedPetId && (
        <MedicationItemSheet
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          petEvents={petEvents}
          onClose={closeMedicationSheet}
          onRefresh={refreshMedicationHistory}
        />
      )}

      {showBanhoTosaSheet && selectedPetId && (
        <GroomingItemSheet
          petId={selectedPetId}
          petName={currentPet?.pet_name}
          groomingRecords={groomingRecords}
          onClose={closeGroomingSheet}
          onRefresh={loadGroomingRecords}
        />
      )}

    </div>
  );
}
