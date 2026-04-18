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
import { PushActionSheet, type ActionSheetType } from '@/components/PushActionSheet';

import { HomePetDashboard } from '@/components/home/HomePetDashboard';
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
import { resolveHomeDeepLinkDestination, resolvePushActionSheetFullDestination, resolveScannedProductDestination, resolveTopAttentionDestination, type HomeSurfaceResolution } from '@/features/interactions/homeModalRouting';
import { useHomeModalUtilityActions } from '@/features/interactions/useHomeModalUtilityActions';
import { useHomeSurfaceActions } from '@/features/interactions/useHomeSurfaceActions';
import { useHomeInteractionCenter } from '@/features/interactions/useHomeInteractionCenter';
import { useHomeNotificationBridge } from '@/features/interactions/useHomeNotificationBridge';
import { useMasterInteractionRules } from '@/features/interactions/useMasterInteractionRules';
import { requestUserConfirmation, showAppToast, showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { trackV1Metric } from '@/lib/v1Metrics';
import { getPetCareCollections } from '@/features/pets/healthCollections';
import { usePetEventManagement } from '@/hooks/usePetEventManagement';
import { useVaccineCardWorkflow } from '@/hooks/useVaccineCardWorkflow';
import { useParasiteManagement } from '@/hooks/useParasiteManagement';
import { usePetBootstrap } from '@/hooks/usePetBootstrap';
import { useVaccineManagement } from '@/hooks/useVaccineManagement';
import { useGroomingManagement } from '@/hooks/useGroomingManagement';
import { useFoodPlanSync } from '@/hooks/useFoodPlanSync';
import { useQuickMark } from '@/hooks/useQuickMark';
import { vaccineInfo, commonVaccines } from '@/data/vaccineInfo';
import { usePendencies } from '@/hooks/usePendencies';

import { hasCompletedOnboarding } from '@/lib/ownerProfile';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { useAuth } from '@/contexts/AuthContext';
import { petMolAPI } from '@/lib/api-client';
import { normalizeBackendPetProfiles } from '@/lib/backendPetProfile';
import {
  mapNomeComercialToTipo,
} from '@/lib/vaccineOcr';

import {
  type GroomingRecord,
  type ParasiteControl,
  type ParasiteControlType,
} from '@/lib/types/home';
import type {
  DocFolderModalState,
  ParasiteFormData,
  VetHistoryDocument,
} from '@/lib/types/homeForms';
import { 
  type PetHealthProfile,
  type VaccineRecord,
  type VaccineType
} from '@/lib/petHealth';
import type { ScannedProduct } from '@/lib/productScanner';

// Helper para converter caminho de foto em URL com cache busting
const PHOTOS_BASE_URL = process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || API_BASE_URL;
const OWN_PHOTO_HOSTS = ['petmol.app', 'petmol.com.br', 'www.petmol.com.br', 'localhost'];
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
  const { tutor, isLoading } = useAuth();

  // Ler ?checkin=1 da URL (vindo de notificação push — app estava fechado)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkin') === '1') setForceCheckin(true);
  }, []);

  // Bootstrap de pets e tutor — gerenciado por usePetBootstrap
  const {
    isChecking,
    pets, setPets,
    selectedPetId, setSelectedPetId,
    tutorName, setTutorName,
    loggedUserId, setLoggedUserId,
    familyOwnerNames,
    tutorCheckinDay, setTutorCheckinDay,
    tutorCheckinHour, setTutorCheckinHour,
    tutorCheckinMinute, setTutorCheckinMinute,
    photoTimestamps, setPhotoTimestamps,
  } = usePetBootstrap();

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
  // Plano alimentar — API-first, sincronizado com localStorage
  const { feedingPlan, setFeedingPlan, fetchFeedingPlan } = useFoodPlanSync({ selectedPetId });
  // Quick-mark medicação inline
  const {
    quickMarkId, setQuickMarkId,
    quickMarkDate, setQuickMarkDate,
    quickMarkNotes, setQuickMarkNotes,
    quickMarkSaving, setQuickMarkSaving,
    quickMarkToast, setQuickMarkToast,
  } = useQuickMark();
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

  // Estado para vermífugos/antiparasitários — gerenciado por useParasiteManagement
  const {
    parasiteControls, setParasiteControls,
    showParasiteForm, setShowParasiteForm,
    editingParasite, setEditingParasite,
    parasiteFormData, setParasiteFormData,
    loadParasiteControls,
    handleSaveParasite, handleEditParasite, handleDeleteParasite,
    resetParasiteForm,
  } = useParasiteManagement({ selectedPetId, pets, setPets, fetchPetEvents, t });

  // Vacinas — gerenciado por useVaccineManagement
  const {
    vaccines, setVaccines,
    showVaccineForm, setShowVaccineForm,
    vaccineFormSaving, setVaccineFormSaving,
    importVaccineLoading, setImportVaccineLoading,
    showQuickAddVaccine, setShowQuickAddVaccine,
    showAllVaccinesGuide, setShowAllVaccinesGuide,
    showAIUpload, setShowAIUpload,
    editingVaccine, setEditingVaccine,
    showMedicalVault, setShowMedicalVault,
    vaccineFiles, setVaccineFiles,
    showFeedbackModal, setShowFeedbackModal,
    feedbackVaccine, setFeedbackVaccine,
    feedbackFormData, setFeedbackFormData,
    vaccineFormData, setVaccineFormData,
    quickAddData, setQuickAddData,
    loadVaccines,
    resetVaccineForm,
    calculateNextDose,
    getRecentVets,
    handleSaveVaccine,
    handleEditVaccine,
    handleDeleteVaccine,
    handleDeleteAllVaccines,
    handleReportVaccineIssue,
    handleSubmitFeedback,
    handleQuickAddVaccine,
    handleImportAnalyzedVaccines,
  } = useVaccineManagement({
    selectedPetId,
    pets,
    setPets,
    fetchPetEvents,
    t,
    locale,
    reviewRegistros,
    reviewConfirmed,
    reviewExpectedCount,
    rawRegistros,
    reviewLearnEnabled,
    cardAnalysis,
    closeCardAnalysis,
  });

  // Banho e Tosa — gerenciado por useGroomingManagement
  const {
    groomingRecords, setGroomingRecords,
    editingGrooming, setEditingGrooming,
    showEditGroomingModal, setShowEditGroomingModal,
    groomingDueAlerts, setGroomingDueAlerts,
    groomingFormData, setGroomingFormData,
    placeSuggestions, setPlaceSuggestions,
    showPlaceSuggestions, setShowPlaceSuggestions,
    searchingPlaces,
    placeAbortController,
    loadGroomingRecords,
    searchPlaces,
    selectPlace,
    handleSaveGrooming,
    handleEditGrooming,
    handleDeleteGrooming,
    handleCancelEditGrooming,
  } = useGroomingManagement({ selectedPetId, pets, setPets, fetchPetEvents, t });

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

  // ── Pendências persistentes (in-app) — complementam o push ──
  const { pendencies, act: actPendency, refetch: refetchPendencies } = usePendencies();

  // fire-and-forget: dispara push para itens vencidos ao abrir o app (loggedUserId set by usePetBootstrap)
  useEffect(() => {
    if (!loggedUserId) return;
    const tok = getToken();
    if (!tok) return;
    fetch(`${API_BASE_URL}/notifications/send-on-open`, {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${tok}` },
    }).then(() => {
      setTimeout(() => refetchPendencies(), 1500);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedUserId]);

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

  const handleTopAttentionSelect = useCallback((interaction: PetInteractionItem) => {
    if (interaction.pet_id) setSelectedPetId(interaction.pet_id);
    setShowTopAttentionModal(false);
    const destination = resolveTopAttentionDestination(interaction.action_target);
    if (destination) {
      applyHomeSurfaceResolution(destination);
    }
  }, [applyHomeSurfaceResolution, setSelectedPetId]);

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

  const handleGlobalProductScan = useCallback((product: ScannedProduct) => {
    if (!currentPet) return;

    try {
      sessionStorage.setItem('petmol_pending_scanned_product', JSON.stringify({
        petId: currentPet.pet_id,
        product,
      }));
    } catch {}

    if (product.category === 'food') {
      setShowFoodSheet(true);
      return;
    }
    if (product.category === 'medication') {
      setShowMedicationSheet(true);
      return;
    }
    const destination = resolveScannedProductDestination(product.category);
    if (destination) {
      applyHomeSurfaceResolution(destination);
      return;
    }

    showBlockingNotice('Não encontramos os dados. Preencha manualmente.', {
      title: 'Produto identificado parcialmente',
      tone: 'warning',
    });
  }, [applyHomeSurfaceResolution, currentPet]);

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
            {/* Atenção agora — API pendencies (primary) or inline alerts (fallback) */}
            {(() => {
              const topPend = pendencies[0];
              if (topPend) {
                const isHigh = topPend.priority >= 75;
                return (
                  <div className={`mb-3 rounded-2xl border px-4 py-3 space-y-2 ${isHigh ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">{isHigh ? '🚨' : '⚠️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold leading-snug ${isHigh ? 'text-red-900' : 'text-amber-900'}`}>
                          {topPend.title}
                        </p>
                        <p className={`text-xs leading-snug mt-0.5 ${isHigh ? 'text-red-700' : 'text-amber-700'}`}>
                          {topPend.message}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 pt-0.5">
                      <button
                        onClick={() => { router.push(topPend.deep_link); void actPendency(topPend.id, 'resolve'); }}
                        className={`flex-1 py-2 rounded-xl text-white text-xs font-bold active:scale-95 transition-all ${isHigh ? 'bg-red-600' : 'bg-amber-500'}`}
                      >
                        Resolver agora
                      </button>
                      <button
                        onClick={() => void actPendency(topPend.id, 'snooze', 24)}
                        className={`flex-1 py-2 rounded-xl border text-xs font-semibold active:scale-95 transition-all ${isHigh ? 'border-red-200 text-red-700' : 'border-amber-200 text-amber-700'}`}
                      >
                        Lembrar depois
                      </button>
                      <button
                        onClick={() => void actPendency(topPend.id, 'dismiss')}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-gray-400 text-xs font-semibold active:scale-95 transition-all"
                      >
                        Já resolvi
                      </button>
                    </div>
                    {pendencies.length > 1 && (
                      <p className="text-[10px] text-gray-400 text-center">
                        +{pendencies.length - 1} {pendencies.length - 1 === 1 ? 'outro item' : 'outros itens'} pendentes
                      </p>
                    )}
                  </div>
                );
              }
              // Fallback: inline computed alerts (before first send-on-open response)
              const currentPetName = pets.find(p => p.pet_id === selectedPetId)?.pet_name || 'seu pet';
              let label: string | null = null;
              let action: (() => void) | null = null;
              if (alertParasitesValue) {
                label = `${currentPetName} está com antiparasitário atrasado`;
                action = handleOpenVermifugo;
              } else if (alertVaccinesValue) {
                label = `${currentPetName} tem vacina em atraso`;
                action = handleOpenVaccines;
              }
              if (!label || !action) return null;
              return (
                <div className="mb-3 flex items-center gap-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
                  <span className="text-xl flex-shrink-0">🚨</span>
                  <p className="flex-1 text-sm font-bold text-red-900 leading-snug">{label}</p>
                  <button
                    onClick={action}
                    className="flex-shrink-0 text-xs font-semibold text-red-700 bg-red-100 px-3 py-1.5 rounded-lg active:scale-95 transition-transform whitespace-nowrap"
                  >
                    Ver agora
                  </button>
                </div>
              );
            })()}
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
