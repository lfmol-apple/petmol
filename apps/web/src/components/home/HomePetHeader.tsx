'use client';

import { useI18n } from '@/lib/I18nContext';
import { HomeAttentionOverlays } from '@/components/home/HomeAttentionOverlays';
import type { PetInteractionItem } from '@/features/interactions/types';
import type { PetHealthProfile } from '@/lib/petHealth';

interface HomePetHeaderProps {
  currentPet: PetHealthProfile;
  pets: PetHealthProfile[];
  selectedPetId: string | null;
  setSelectedPetId: (value: string) => void;
  photoTimestamps: Record<string, number>;
  getPhotoUrl: (photoPath: string | undefined | null, petId?: string, photoTimestamps?: Record<string, number>) => string | null;
  switchPetByOffset: (offset: number) => void;
  onOpenAddPetModal: () => void;
  onOpenEditPetModal: () => void;
  loggedUserId: string;
  familyOwnerNames: Record<string, string>;
  showPetSelector: boolean;
  onTogglePetSelector: () => void;
  onClosePetSelector: () => void;
  onOpenMedicationHistory: () => void;
  activeMedicationCount: number;
  topAttentionPetCount: number;
  onOpenTopAttentionModal: () => void;
  onCloseTopAttentionModal: () => void;
  showTopAttentionModal: boolean;
  topAttentionAlerts: PetInteractionItem[];
  onAlertSelect: (alert: PetInteractionItem) => void;
  selectedPetNeedsAttention: boolean;
  selectedPetCareScore: number;
}

export function HomePetHeader({
  currentPet,
  pets,
  selectedPetId,
  setSelectedPetId,
  photoTimestamps,
  getPhotoUrl,
  switchPetByOffset,
  onOpenAddPetModal,
  onOpenEditPetModal,
  loggedUserId,
  familyOwnerNames,
  showPetSelector,
  onTogglePetSelector,
  onClosePetSelector,
  onOpenMedicationHistory,
  activeMedicationCount,
  topAttentionPetCount,
  onOpenTopAttentionModal,
  onCloseTopAttentionModal,
  showTopAttentionModal,
  topAttentionAlerts,
  onAlertSelect,
  selectedPetNeedsAttention,
  selectedPetCareScore,
}: HomePetHeaderProps) {
  const { t } = useI18n();

  const petMeta = [
    currentPet.breed,
    currentPet.birth_date && (() => {
      const birth = new Date(currentPet.birth_date);
      const now = new Date();
      let years = now.getFullYear() - birth.getFullYear();
      let months = now.getMonth() - birth.getMonth();
      if (months < 0) {
        years--;
        months += 12;
      }
      if (years === 0) return `${months}m`;
      if (months === 0) return `${years} ${years === 1 ? t('common.age.year') : t('common.age.years')}`;
      return `${years}a ${months}m`;
    })(),
    currentPet.weight_history?.length ? `${currentPet.weight_history[0].weight} kg` : null,
    currentPet.sex ? (currentPet.sex === 'male' ? t('pet.sex.male') : t('pet.sex.female')) : null,
    currentPet.neutered !== undefined ? (currentPet.neutered ? t('pet.neutered.yes') : t('pet.neutered.no')) : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <div className="relative h-44 sm:h-56 bg-gradient-to-br from-slate-100 to-gray-200 group transition-all duration-300">
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-white text-6xl sm:text-7xl md:text-8xl lg:text-9xl transition-transform duration-300 group-hover:scale-110">
            {currentPet.species === 'dog' ? '🐕' : currentPet.species === 'cat' ? '🐱' : '🐾'}
          </span>
        </div>
        {getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps) && (
          <img
            src={getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps)!}
            alt={currentPet.pet_name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        {selectedPetNeedsAttention && (
          <div className={`pointer-events-none absolute inset-0 z-[1] ${selectedPetCareScore <= 35 ? 'ring-2 ring-red-500/50 animate-pulse' : 'ring-1 ring-amber-400/35'}`} />
        )}

        {pets.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => switchPetByOffset(-1)}
              aria-label="Pet anterior"
              className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/45 text-white border border-white/40 shadow-[0_2px_8px_rgba(0,0,0,0.45)] items-center justify-center hover:bg-black/60 active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => switchPetByOffset(1)}
              aria-label="Próximo pet"
              className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/45 text-white border border-white/40 shadow-[0_2px_8px_rgba(0,0,0,0.45)] items-center justify-center hover:bg-black/60 active:scale-95 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        <div className="absolute bottom-2 right-2 flex gap-1.5 z-10">
          <button
            onClick={onOpenAddPetModal}
            className="flex items-center justify-center w-5 h-5 bg-[#0056D2] text-white rounded-full transition-all shadow-[0_2px_8px_rgba(0,0,0,0.55)] hover:bg-[#0047ad] hover:scale-110 active:scale-95 border border-white/40"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onOpenEditPetModal}
            className="flex items-center justify-center w-5 h-5 bg-white text-gray-800 rounded-full transition-all shadow-[0_2px_8px_rgba(0,0,0,0.55)] hover:bg-gray-100 hover:scale-110 active:scale-95 border border-white/60"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </div>

      {/* V-L: banner de visualização familiar silenciado até relancamento */}

      <div className="mt-1.5 rounded-2xl border border-gray-200 bg-white shadow-sm p-2.5 sm:p-3">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-2 min-w-0">
            <div className="relative flex-shrink-0">
              <button
                onClick={onTogglePetSelector}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-100 border border-blue-300 shadow-sm hover:border-blue-400 hover:bg-blue-200 active:scale-95 transition-all"
              >
                <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none truncate max-w-[180px] sm:max-w-none">
                  {currentPet.pet_name}
                </h2>
                <svg
                  className={`w-4 h-4 text-blue-600 flex-shrink-0 transition-transform ${showPetSelector ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPetSelector && (
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={onClosePetSelector} />
                  <div className="absolute top-full left-0 mt-1 z-[9999] w-[280px] max-w-[calc(100vw-1.5rem)]">
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                      <div className="p-2 max-h-[400px] overflow-y-auto">
                        {pets.map((pet) => {
                          const isActive = pet.pet_id === selectedPetId;
                          return (
                            <button
                              key={pet.pet_id}
                              onClick={() => {
                                setSelectedPetId(pet.pet_id);
                                onClosePetSelector();
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                isActive
                                  ? 'bg-blue-50 border-2 border-blue-400'
                                  : 'hover:bg-gray-50 border-2 border-transparent'
                              }`}
                            >
                              <div
                                className={`relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ${
                                  isActive ? 'ring-2 ring-blue-400 ring-offset-2' : ''
                                }`}
                              >
                                <div className="w-full h-full bg-gradient-to-br from-slate-100 to-gray-200 flex items-center justify-center">
                                  <span className="text-xl">
                                    {pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐱' : '🐾'}
                                  </span>
                                </div>
                                {getPhotoUrl(pet.photo, pet.pet_id, photoTimestamps) && (
                                  <img
                                    src={getPhotoUrl(pet.photo, pet.pet_id, photoTimestamps)!}
                                    alt={pet.pet_name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                )}
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <p className={`font-bold truncate text-sm ${isActive ? 'text-[#0047ad]' : 'text-gray-800'}`}>
                                  {pet.pet_name}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {pet.species === 'dog'
                                    ? `🐕 ${t('pet.species.dog')}`
                                    : pet.species === 'cat'
                                      ? `🐱 ${t('pet.species.cat')}`
                                      : `🐾 ${t('pet.species.generic')}`}
                                </p>
                              </div>
                              {isActive && (
                                <div className="flex-shrink-0">
                                  <svg className="w-5 h-5 text-[#0056D2]" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-gray-600 font-medium leading-tight break-words">{petMeta}</p>
            </div>
          </div>

          {/* Action strip — 2 equal buttons */}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={onOpenMedicationHistory}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-sm transition-all text-left ${
                activeMedicationCount > 0
                  ? 'border-purple-200 bg-gradient-to-r from-purple-50 to-white active:scale-[0.98]'
                  : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                activeMedicationCount > 0 ? 'bg-purple-100' : 'bg-gray-100'
              }`}>
                <span className="text-xs leading-none">💊</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-bold leading-tight ${
                  activeMedicationCount > 0 ? 'text-purple-900' : 'text-gray-600'
                }`}>Administrar medicação</p>
                <p className={`text-[10px] font-medium leading-tight ${
                  activeMedicationCount > 0 ? 'text-purple-600' : 'text-gray-400'
                }`}>
                  {activeMedicationCount > 0
                    ? `${activeMedicationCount} em tratamento`
                    : 'Sem tratamentos ativos'}
                </p>
              </div>
              <span className={`text-xs leading-none flex-shrink-0 ${
                activeMedicationCount > 0 ? 'text-purple-300' : 'text-gray-300'
              }`}>›</span>
            </button>

            <button
              onClick={topAttentionPetCount > 0 ? onOpenTopAttentionModal : undefined}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 shadow-sm transition-all text-left ${
                topAttentionPetCount > 0
                  ? 'border-red-200 bg-gradient-to-r from-red-50 to-white active:scale-[0.98]'
                  : 'border-gray-200 bg-gray-50 opacity-50 cursor-default'
              }`}
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                topAttentionPetCount > 0 ? 'bg-red-100' : 'bg-gray-100'
              }`}>
                <span className="text-xs leading-none">🚨</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] font-bold leading-tight ${
                  topAttentionPetCount > 0 ? 'text-red-900' : 'text-gray-500'
                }`}>Atenção agora</p>
                <p className={`text-[10px] font-medium leading-tight ${
                  topAttentionPetCount > 0 ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {topAttentionPetCount === 0
                    ? 'Tudo em dia'
                    : topAttentionPetCount === 1
                      ? '1 pet'
                      : `${topAttentionPetCount} pets`}
                </p>
              </div>
              {topAttentionPetCount > 0 && (
                <span className="text-red-300 text-xs leading-none flex-shrink-0">›</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <HomeAttentionOverlays
        showTopAttentionModal={showTopAttentionModal}
        onCloseTopAttentionModal={onCloseTopAttentionModal}
        topAttentionPetCount={topAttentionPetCount}
        topAttentionAlerts={topAttentionAlerts}
        onAlertSelect={onAlertSelect}
      />
    </>
  );
}