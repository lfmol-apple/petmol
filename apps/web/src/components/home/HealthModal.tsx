'use client';

// TODO(limpeza-leve): revisar sobreposicao de experiencia com VetHistoryModal.
// Mantido sem alteracao funcional para evitar regressao nesta etapa.

import { type Dispatch, type SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { FoodControlTab } from '@/components/FoodControlTab';
import { HealthParasiteControlPanel } from '@/components/home/HealthParasiteControlPanel';
import { HealthGroomingPanel } from '@/components/home/HealthGroomingPanel';
import { HealthMedicationPanel } from '@/components/home/HealthMedicationPanel';
import { HealthEventPanel } from '@/components/home/HealthEventPanel';
import { HealthVaccinesPanel } from '@/components/home/HealthVaccinesPanel';
import { PetShareExportPanel } from '@/components/PetShareExportPanel';
import { useHomeMedicationActions } from '@/features/interactions/useHomeMedicationActions';
import { useHomeEventActions } from '@/features/interactions/useHomeEventActions';
import { type PetEventRecord } from '@/lib/petEvents';
import type { EventFormState } from '@/hooks/usePetEventManagement';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { GroomingRecord, ParasiteControl, PlaceDetails } from '@/lib/types/home';
import type {
  DocFolderModalState,
  GroomingFormData,
  ParasiteFormData,
  VetHistoryDocument,
} from '@/lib/types/homeForms';
import { latestVaccinePerGroup } from '@/lib/vaccineUtils';
import { ModalPortal } from '@/components/ModalPortal';
type VaccineCardOcrRecord = {
  tipo_vacina?: string | null; nome_comercial: string | null;
  data_aplicacao: string | null; data_revacina: string | null;
  veterinario_responsavel: string | null; missing_fields?: string[]; confianca_score?: number;
};

// Photo utilities (mirrored from page.tsx)
const OWN_PHOTO_HOSTS_HM = ['petmol.app', 'petmol.com.br', 'petshopbh.com', 'petshopbh.com.br', 'localhost'];
const isOwnHost_hm = (url: string): boolean => {
  try { const { hostname } = new URL(url); return OWN_PHOTO_HOSTS_HM.some((h) => hostname === h || hostname.endsWith(`.${h}`)); }
  catch { return false; }
};
const getPhotoUrl = (photoPath: string | undefined | null, petId?: string, photoTimestamps?: Record<string, number>): string | null => {
  if (!photoPath) return null;
  if (photoPath.startsWith('data:')) return photoPath;
  if (photoPath.startsWith('http')) {
    if (isOwnHost_hm(photoPath)) return photoPath;
    return `/api/photo-proxy?url=${encodeURIComponent(photoPath)}`;
  }
  const configured = String(process.env.NEXT_PUBLIC_PHOTOS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
    .replace(/\/api\/?$/, '').replace(/\/$/, '');
  const photosBase = configured || (typeof window !== 'undefined' ? window.location.origin : '');
  const timestamp = petId && photoTimestamps?.[petId] ? `?t=${photoTimestamps[petId]}` : '';
  const normalized = photoPath.replace(/^\/+/, '');
  const path = normalized.startsWith('uploads/') ? `/${normalized}` : `/uploads/${normalized}`;
  return `${photosBase}${path}${timestamp}`;
};

// Props
interface HealthModalProps {
  currentPet: PetHealthProfile | null; selectedPetId: string | null;
  photoTimestamps: Record<string, number>;
  healthModalMode: 'full' | 'health' | 'grooming' | 'food';
  healthActiveTab: string;
  eventTypeLocked: boolean;
  onBackFromHealthModal: (wasLocked: boolean) => void;
  onCloseHealthModal: () => void;
  onSelectHealthTab: (tab: string) => void;
  onOpenVaccineCenter: () => void;
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[]; showParasiteForm: boolean; setShowParasiteForm: (v: boolean) => void;
  editingParasite: ParasiteControl | null; setEditingParasite: (p: ParasiteControl | null) => void;
  parasiteFormData: ParasiteFormData; setParasiteFormData: Dispatch<SetStateAction<ParasiteFormData>>; handleDeleteParasite: (parasite: ParasiteControl) => void;
  handleEditParasite: (parasite: ParasiteControl) => void; handleSaveParasite: () => void; resetParasiteForm: () => void;
  groomingRecords: GroomingRecord[]; editingGrooming: GroomingRecord | null;
  groomingFormData: GroomingFormData; setGroomingFormData: Dispatch<SetStateAction<GroomingFormData>>;
  groomingDueAlerts: { petName: string; type: string; daysOverdue: number }[];
  setGroomingDueAlerts: (alerts: { petName: string; type: string; daysOverdue: number }[]) => void;
  handleDeleteGrooming: (record: GroomingRecord) => Promise<void>; handleEditGrooming: (record: GroomingRecord) => void;
  handleSaveGrooming: () => void; handleCancelEditGrooming: () => void;
  showPlaceSuggestions: boolean; setShowPlaceSuggestions: (v: boolean) => void;
  searchingPlaces: boolean; placeSuggestions: PlaceDetails[]; searchPlaces: (q: string) => void; selectPlace: (place: PlaceDetails) => void;
  fetchFeedingPlan: (petId: string) => void;
  petEvents: PetEventRecord[]; eventsLoading: boolean; editingEventId: string | null; setEditingEventId: (id: string | null) => void;
  eventFormData: EventFormState; setEventFormData: Dispatch<SetStateAction<EventFormState>>; eventSaving: boolean; setEventSaving: (v: boolean) => void;
  setCreatedEventId: (id: string | null) => void;
  attachDocFiles: File[]; setAttachDocFiles: (files: File[]) => void; setShowAttachDoc: (v: boolean) => void;
  docFolderModal: DocFolderModalState; setDocFolderModal: Dispatch<SetStateAction<DocFolderModalState>>; handleDeleteEvent: (eventId: string) => void;
  fetchPetEvents: (petId: string) => void; openEditEvent: (event: PetEventRecord) => void; vetHistoryDocs: VetHistoryDocument[];
}

export function HealthModal({
  currentPet, selectedPetId, photoTimestamps,
  healthModalMode, healthActiveTab, eventTypeLocked, onBackFromHealthModal, onCloseHealthModal, onSelectHealthTab, onOpenVaccineCenter,
  vaccines,
  parasiteControls, showParasiteForm, setShowParasiteForm, editingParasite, setEditingParasite,
  parasiteFormData, setParasiteFormData, handleDeleteParasite, handleEditParasite, handleSaveParasite, resetParasiteForm,
  groomingRecords, editingGrooming, groomingFormData, setGroomingFormData,
  groomingDueAlerts, setGroomingDueAlerts, handleDeleteGrooming, handleEditGrooming, handleSaveGrooming, handleCancelEditGrooming,
  showPlaceSuggestions, setShowPlaceSuggestions, searchingPlaces, placeSuggestions, searchPlaces, selectPlace, fetchFeedingPlan,
  petEvents, eventsLoading, editingEventId, setEditingEventId, eventFormData, setEventFormData,
  eventSaving, setEventSaving, setCreatedEventId, attachDocFiles, setAttachDocFiles,
  setShowAttachDoc, docFolderModal, setDocFolderModal,
  handleDeleteEvent, fetchPetEvents, openEditEvent, vetHistoryDocs,
}: HealthModalProps) {
  const { t } = useI18n();

  const { saveMedication, cancelMedicationForm } = useHomeMedicationActions({
    selectedPetId,
    eventFormData,
    setEventFormData,
    setEventSaving,
    attachDocFiles,
    setAttachDocFiles,
    editingEventId,
    setEditingEventId,
    fetchPetEvents,
  });

  const { saveEvent, cancelEventForm } = useHomeEventActions({
    selectedPetId,
    eventFormData,
    setEventFormData,
    setEventSaving,
    attachDocFiles,
    setAttachDocFiles,
    editingEventId,
    setEditingEventId,
    fetchPetEvents,
    setCreatedEventId,
    setShowAttachDoc,
    eventTypeLocked,
  });

  const latestVaccinesMap = latestVaccinePerGroup(vaccines);
  const currentVaccines = Array.from(latestVaccinesMap.values());

  return (
    <ModalPortal>
    <>
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md backdrop-blur-sm flex items-center justify-center sm:p-4 z-50 animate-fadeIn overflow-hidden">
          <div className="bg-slate-50 rounded-[32px] shadow-premium w-full max-w-4xl max-h-[100dvh] sm:max-h-[94dvh] overflow-hidden flex flex-col animate-scaleIn border border-slate-200/50">
            {/* Header do Modal - Design Clean e Elegante */}
            <div className="sticky top-0 z-50 shadow-sm bg-white/90 backdrop-blur-xl border-b border-slate-100">
              {/* Borda Colorida Superior - dinâmica por modo */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${
                healthModalMode === 'grooming' ? 'bg-emerald-500' :
                healthModalMode === 'food' ? 'bg-amber-500' :
                healthModalMode === 'health' && healthActiveTab === 'parasites' ? 'bg-orange-500' :
                healthModalMode === 'health' && healthActiveTab === 'medication' ? 'bg-purple-500' :
                'bg-blue-500'
              }`}></div>
              
              {/* Conteúdo do Header */}
              <div className="relative">
                {/* Barra Superior Minimalista */}
                <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-5">
                  {/* Info do Pet - Destaque */}
                  <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                    {/* Avatar Grande do Pet */}
                    <div className="relative group flex-shrink-0 cursor-pointer">
                      <div className="absolute -inset-0.5 bg-gray-200/50 rounded-3xl blur-md group-hover:bg-gray-300/60 transition-all duration-300"></div>
                      <div className="relative rounded-2xl p-0.5 sm:p-1 overflow-hidden w-10 h-10 sm:w-16 sm:h-16 md:w-20 md:h-20 group-hover:shadow-xl transition-all duration-300 bg-white shadow-sm ring-1 ring-slate-100/50">
                        {currentPet?.photo ? (
                          <div className="relative w-full h-full rounded-xl overflow-hidden">
                            <img 
                              src={getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps) || ''}
                              alt={currentPet.pet_name}
                              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                              style={{
                                objectPosition: 'center 30%', // Foca na parte superior onde geralmente está o rosto
                                transform: 'scale(1.15)', // Leve zoom para melhor enquadramento
                              }}
                              onError={(e) => {
                                // Fallback para emoji se a imagem falhar
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const fallback = target.nextElementSibling as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                            <div className="hidden w-full h-full items-center justify-center">
                              <span className="text-4xl sm:text-5xl drop-shadow-sm">
                                {currentPet?.species === 'dog' ? '🐕' : currentPet?.species === 'cat' ? '🐈' : '🐾'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl sm:text-5xl drop-shadow-sm group-hover:scale-110 transition-transform duration-300">
                              {currentPet?.species === 'dog' ? '🐕' : currentPet?.species === 'cat' ? '🐈' : '🐾'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Nome do Pet - Destaque Principal */}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base sm:text-2xl md:text-3xl font-black text-gray-900 truncate mb-0.5 sm:mb-1">
                        {currentPet?.pet_name}
                      </h2>
                      <p className="text-gray-600 text-xs sm:text-base font-medium">
                        {healthModalMode === 'grooming' ? t('health.grooming') :
                         healthModalMode === 'food' ? t('home.food.title') :
                         healthModalMode === 'health' && healthActiveTab === 'vaccines' ? '💉 Vacinas' :
                         healthModalMode === 'health' && healthActiveTab === 'parasites' ? '🛡️ Controle Parasitário' :
                         healthModalMode === 'health' && healthActiveTab === 'medication' ? '💊 Medicação' :
                         t('health.record_title')}
                      </p>
                    </div>
                  </div>

                  {/* Botão Fechar / Voltar */}
                  <div className="flex items-center gap-2">
                    {healthModalMode === 'health' && (
                      <button
                        onClick={() => onBackFromHealthModal(eventTypeLocked)}
                        className="group bg-gray-100 hover:bg-gray-200 rounded-2xl w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center flex-shrink-0 transition-all duration-300 hover:scale-110 active:scale-95 border border-gray-200"
                        aria-label="Voltar"
                      >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={onCloseHealthModal}
                      className="group bg-gray-100 hover:bg-gray-200 rounded-2xl w-9 h-9 sm:w-12 sm:h-12 flex items-center justify-center flex-shrink-0 transition-all duration-300 hover:scale-110 active:scale-95 border border-gray-200"
                      aria-label={t('common.close')}
                    >
                      <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700 transform group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Navegação por Abas */}
                {healthModalMode === 'full' && (
                <div className="px-3 sm:px-6 pb-2.5 sm:pb-4 pt-1">
                  <div className="flex gap-1.5 sm:gap-2.5 overflow-x-auto scrollbar-hide pb-2">
                    {[
                      { id: 'vaccines', label: t('health.vaccines'), icon: '💉' },
                      { id: 'parasites', label: t('health.parasite_control'), icon: '🛡️' },
                      { id: 'medication', label: 'Medicação', icon: '💊' },
                      ...(healthModalMode === 'full' ? [
                        { id: 'grooming', label: t('health.grooming'), icon: '🛁' },
                        { id: 'food', label: t('health.food'), icon: '🥣' },
                      ] : []),
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => onSelectHealthTab(tab.id)}
                        className={`group relative px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl text-[13px] sm:text-sm font-bold transition-all duration-300 whitespace-nowrap flex items-center gap-2 flex-shrink-0 ${
                          healthActiveTab === tab.id ? 'scale-105 active:scale-100 shadow-sm' : 'hover:scale-105 active:scale-95'
                        }`}
                      >
                        {healthActiveTab === tab.id ? (
                          <>
                            <div className="absolute inset-0 bg-white rounded-2xl border border-slate-200"></div>
                            <div className="absolute inset-0 ring-2 ring-brand-DEFAULT/20 rounded-2xl"></div>
                          </>
                        ) : (
                          <div className="absolute inset-0 bg-slate-100/50 rounded-2xl border border-slate-200/50 group-hover:bg-slate-200/50"></div>
                        )}
                        
                        <span className={`relative text-lg sm:text-xl transition-transform ${healthActiveTab === tab.id ? 'scale-110' : 'grayscale group-hover:grayscale-0'}`}>
                          {tab.icon}
                        </span>
                        <span className={`relative font-bold transition-colors ${
                          healthActiveTab === tab.id ? 'text-brand-DEFAULT' : 'text-slate-500 group-hover:text-slate-700'
                        }`}>
                          {tab.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                )}
              </div>
            </div>

            {/* Conteúdo do Modal - Área de scroll otimizada */}
            <div className="p-3 sm:p-5 overflow-y-auto flex-1 bg-gray-50">
              {/* Aba Vacinas */}
              {healthActiveTab === 'vaccines' && (
                <div className="space-y-4">
                  <HealthVaccinesPanel
                    petName={currentPet?.pet_name}
                    vaccines={vaccines}
                    currentVaccines={currentVaccines}
                    onOpenVaccineCenter={onOpenVaccineCenter}
                  />
                  {currentPet && (
                    <PetShareExportPanel
                      pet={currentPet}
                      vaccines={vaccines}
                      petEvents={petEvents}
                      documents={vetHistoryDocs}
                      parasiteControls={parasiteControls}
                      groomingRecords={groomingRecords}
                    />
                  )}
                </div>
              )}

              {/* Aba Vermífugos/Antiparasitários */}
              {healthActiveTab === 'parasites' && (
                <HealthParasiteControlPanel
                  petName={currentPet?.pet_name}
                  parasiteControls={parasiteControls}
                  showParasiteForm={showParasiteForm}
                  setShowParasiteForm={setShowParasiteForm}
                  editingParasite={editingParasite}
                  parasiteFormData={parasiteFormData}
                  setParasiteFormData={setParasiteFormData}
                  handleDeleteParasite={handleDeleteParasite}
                  handleEditParasite={handleEditParasite}
                  handleSaveParasite={handleSaveParasite}
                  resetParasiteForm={resetParasiteForm}
                />
              )}

              {/* Aba Banho e Tosa */}
              {healthActiveTab === 'grooming' && (
                <HealthGroomingPanel
                  petName={currentPet?.pet_name}
                  editingGrooming={editingGrooming}
                  groomingFormData={groomingFormData}
                  setGroomingFormData={setGroomingFormData}
                  groomingDueAlerts={groomingDueAlerts}
                  setGroomingDueAlerts={setGroomingDueAlerts}
                  groomingRecords={groomingRecords}
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
                />
              )}
              {/* Aba Comida / Food Control */}
              {healthActiveTab === 'food' && (
                <FoodControlTab
                  petId={currentPet?.pet_id || ''}
                  petName={currentPet?.pet_name}
                  species={currentPet?.species as 'dog' | 'cat' | undefined}
                  onSaved={() => { if (currentPet?.pet_id) fetchFeedingPlan(currentPet.pet_id); }}
                />
              )}

              {/* Aba Medicação */}
              {(healthActiveTab === 'medication' || healthActiveTab === 'medications') && (
                <HealthMedicationPanel
                  petName={currentPet?.pet_name}
                  selectedPetId={selectedPetId}
                  eventFormData={eventFormData}
                  setEventFormData={setEventFormData}
                  editingEventId={editingEventId}
                  eventSaving={eventSaving}
                  attachDocFiles={attachDocFiles}
                  setAttachDocFiles={setAttachDocFiles}
                  petEvents={petEvents}
                  eventsLoading={eventsLoading}
                  saveMedication={saveMedication}
                  cancelMedicationForm={cancelMedicationForm}
                  openEditEvent={openEditEvent}
                  handleDeleteEvent={handleDeleteEvent}
                />
              )}

              {/* Aba Consultas */}
              {healthActiveTab === 'appointments' && (
                <div className="space-y-6">
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📅</div>
                    <p>Agendamento de consultas em desenvolvimento</p>
                  </div>
                </div>
              )}

              {/* Aba Exames */}
              {healthActiveTab === 'exams' && (
                <div className="space-y-6">
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">🔬</div>
                    <p>Controle de exames em desenvolvimento</p>
                  </div>
                </div>
              )}

              {/* Aba Eventos — SILENCIADA: bloco legado removido da UI */}
              {false && healthActiveTab === 'eventos' && (
                <HealthEventPanel
                  selectedPetId={selectedPetId}
                  eventFormData={eventFormData}
                  setEventFormData={setEventFormData}
                  editingEventId={editingEventId}
                  eventSaving={eventSaving}
                  attachDocFiles={attachDocFiles}
                  setAttachDocFiles={setAttachDocFiles}
                  petEvents={petEvents}
                  eventsLoading={eventsLoading}
                  eventTypeLocked={eventTypeLocked}
                  vetHistoryDocs={vetHistoryDocs}
                  setDocFolderModal={setDocFolderModal}
                  saveEvent={saveEvent}
                  cancelEventForm={cancelEventForm}
                  openEditEvent={openEditEvent}
                  handleDeleteEvent={handleDeleteEvent}
                />
              )}
            </div>
          </div>
        </div>

    </>
    </ModalPortal>
  );
}
