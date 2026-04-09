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
      <div className="px-4 pt-4">
        <div className="relative w-full h-[240px] sm:h-[280px] bg-gradient-to-br from-brand-DEFAULT to-blue-800 group rounded-[32px] overflow-hidden shadow-premium border border-white/20 transition-all duration-500">
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-white text-6xl sm:text-7xl transition-transform duration-500 group-hover:scale-110 opacity-50">
            {currentPet.species === 'dog' ? '🐕' : currentPet.species === 'cat' ? '🐱' : '🐾'}
          </span>
        </div>
        {getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps) && (
          <img
            src={getPhotoUrl(currentPet.photo, currentPet.pet_id, photoTimestamps)!}
            alt={currentPet.pet_name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {/* Overlay premium gradient na parte inferior da foto */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-900/40 to-transparent pointer-events-none" />

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

        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={onOpenAddPetModal}
            className="flex items-center justify-center w-10 h-10 bg-black/30 backdrop-blur-md text-white rounded-full transition-all shadow-lg hover:bg-slate-900/60 backdrop-blur-md hover:scale-105 active:scale-95 border border-white/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onOpenEditPetModal}
            className="flex items-center justify-center w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full transition-all shadow-lg hover:bg-white/30 hover:scale-105 active:scale-95 border border-white/30"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    {/* Overlay de informações integrado na base da foto */}
      <div className="relative mx-4 -mt-12 z-30">
        <div className="rounded-[32px] bg-white/95 shadow-premium p-5 sm:p-6 backdrop-blur-3xl border border-white/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <button
                onClick={onTogglePetSelector}
                className="group flex items-center gap-3 mb-1.5 transition-all active:scale-95"
              >
                <h2 className="text-3xl sm:text-4xl font-black font-outfit text-slate-800 tracking-tighter leading-none truncate">
                  {currentPet.pet_name}
                </h2>
                <div className={`w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center transition-transform duration-300 ${showPetSelector ? 'rotate-180 bg-brand-light text-brand-DEFAULT' : 'text-slate-400'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              
              <div className="flex items-center gap-2 text-[13px] font-bold text-slate-500/80 uppercase tracking-wider">
                <span className="bg-brand-DEFAULT/10 text-brand-DEFAULT px-2 py-0.5 rounded-md">
                   {currentPet.species === 'dog' ? '🐕' : '🐱'} {currentPet.breed}
                </span>
                <span>•</span>
                <span>{petMeta.split(' · ').slice(1).join(' · ')}</span>
              </div>

              {showPetSelector && (
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={onClosePetSelector} />
                  <div className="absolute top-full left-0 mt-3 z-[9999] w-[300px] max-w-[calc(100vw-2rem)] animate-fadeIn">
                    <div className="bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden ring-1 ring-black/5">
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
                              className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                                isActive
                                  ? 'bg-brand-DEFAULT/5 ring-1 ring-brand-DEFAULT/20'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-slate-100 shadow-sm">
                                {getPhotoUrl(pet.photo, pet.pet_id, photoTimestamps) ? (
                                  <img
                                    src={getPhotoUrl(pet.photo, pet.pet_id, photoTimestamps)!}
                                    alt={pet.pet_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xl">
                                    {pet.species === 'dog' ? '🐕' : '🐱'}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <p className={`font-bold truncate text-sm ${isActive ? 'text-brand-DEFAULT' : 'text-slate-700'}`}>
                                  {pet.pet_name}
                                </p>
                                <p className="text-xs text-slate-400 truncate uppercase tracking-tighter font-semibold">
                                  {pet.breed}
                                </p>
                              </div>
                              {isActive && (
                                <div className="w-2 h-2 rounded-full bg-brand-DEFAULT"></div>
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

            {/* Alerta de Atenção compacto à direita */}
            <button
              onClick={topAttentionPetCount > 0 ? onOpenTopAttentionModal : undefined}
              className={`flex items-center gap-3 rounded-[24px] px-4 py-3 transition-all ${
                topAttentionPetCount > 0
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-200 active:scale-95'
                  : 'bg-slate-100/50 text-slate-400 cursor-default p-0 flex-row-reverse sm:flex-row'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-white/20`}>
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                 </svg>
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-0.5">Status</p>
                <p className="text-sm font-bold leading-none">
                   {topAttentionPetCount === 0 ? 'Tudo OK' : `${topAttentionPetCount} Pendente${topAttentionPetCount > 1 ? 's' : ''}`}
                </p>
              </div>
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