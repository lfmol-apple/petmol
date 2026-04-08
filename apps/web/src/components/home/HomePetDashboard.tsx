'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { RemindersSection } from '@/components/home/RemindersSection';
import {
  HOME_CONTROL_LABELS,
  loadInactiveHomeControls,
  saveInactiveHomeControls,
  type HomeInactiveEligibleControlId,
} from '@/lib/homeControlPreferences';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';

interface HomePetDashboardProps {
  petEvents: PetEventRecord[];
  vaccines: VaccineRecord[];
  parasiteControls: ParasiteControl[];
  groomingRecords: GroomingRecord[];
  feedingPlan: Record<string, FeedingPlanEntry>;
  viewerPreferenceId: string;
  currentPet: PetHealthProfile;
  tutorCheckinDay: number;
  selectedPetId: string | null;
  quickMarkId: string | null;
  setQuickMarkId: (value: string | null) => void;
  quickMarkDate: string;
  setQuickMarkDate: (value: string) => void;
  quickMarkNotes: string;
  setQuickMarkNotes: (value: string) => void;
  quickMarkSaving: boolean;
  setQuickMarkSaving: (value: boolean) => void;
  quickMarkToast: string | null;
  setQuickMarkToast: (value: string | null) => void;
  fetchPetEvents: (petId: string) => Promise<void>;
  onOpenVaccines: () => void;
  onOpenVermifugo: () => void;
  onOpenAntipulgas: () => void;
  onOpenColeira: () => void;
  onOpenDocuments: () => void;
  alertVacinas?: boolean;
  colorVacinas?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertVermifugo?: boolean;
  colorVermifugo?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertAntipulgas?: boolean;
  colorAntipulgas?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertColeira?: boolean;
  colorColeira?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertGrooming?: boolean;
  colorGrooming?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertFood?: boolean;
  colorFood?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertMedicacao?: boolean;
  colorMedicacao?: 'neutral' | 'ok' | 'warning' | 'critical';
  onOpenGrooming: () => void;
  onOpenMedication: () => void;
  onOpenFood: () => void;
  onOpenEvents: () => void;
}

export function HomePetDashboard({
  petEvents,
  vaccines,
  parasiteControls,
  groomingRecords,
  feedingPlan,
  viewerPreferenceId,
  currentPet,
  tutorCheckinDay,
  selectedPetId,
  quickMarkId,
  setQuickMarkId,
  quickMarkDate,
  setQuickMarkDate,
  quickMarkNotes,
  setQuickMarkNotes,
  quickMarkSaving,
  setQuickMarkSaving,
  quickMarkToast,
  setQuickMarkToast,
  fetchPetEvents,
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenDocuments,
  alertVacinas,
  colorVacinas,
  alertVermifugo,
  colorVermifugo,
  alertAntipulgas,
  colorAntipulgas,
  alertColeira,
  colorColeira,
  alertGrooming,
  colorGrooming,
  alertFood,
  colorFood,
  alertMedicacao,
  colorMedicacao,
  onOpenGrooming,
  onOpenMedication,
  onOpenFood,
  onOpenEvents,
}: HomePetDashboardProps) {
  const [inactiveControls, setInactiveControls] = useState<HomeInactiveEligibleControlId[]>([]);

  useEffect(() => {
    setInactiveControls(loadInactiveHomeControls(viewerPreferenceId, currentPet.pet_id));
  }, [viewerPreferenceId, currentPet.pet_id]);

  const persistInactiveControls = (nextInactive: HomeInactiveEligibleControlId[]) => {
    setInactiveControls(nextInactive);
    saveInactiveHomeControls(viewerPreferenceId, currentPet.pet_id, nextInactive);
  };

  const handleDeactivateControl = (controlId: HomeInactiveEligibleControlId) => {
    if (inactiveControls.includes(controlId)) return;
    persistInactiveControls([...inactiveControls, controlId]);
  };

  const controlOpenHandlers: Record<HomeInactiveEligibleControlId, () => void> = {
    vaccines: onOpenVaccines,
    dewormer: onOpenVermifugo,
    flea_tick: onOpenAntipulgas,
    collar: onOpenColeira,
    food: onOpenFood,
    grooming: onOpenGrooming,
    medication: onOpenMedication,
  };

  const handleReactivateControl = (controlId: HomeInactiveEligibleControlId) => {
    persistInactiveControls(inactiveControls.filter((item) => item !== controlId));
    controlOpenHandlers[controlId]?.();
  };

  const inactiveItems = useMemo(
    () => inactiveControls.map((controlId) => ({ id: controlId, label: HOME_CONTROL_LABELS[controlId] })),
    [inactiveControls]
  );

  return (
    <div className="relative rounded-2xl bg-gray-100/40 p-3 mt-0 border border-gray-200/50">
      <AppleControlButtons
        onVacinasClick={onOpenVaccines}
        onVermifugoClick={onOpenVermifugo}
        onAntipulgasClick={onOpenAntipulgas}
        onColeiraClick={onOpenColeira}
        onDocumentosClick={onOpenDocuments}
        onAlimentacaoClick={onOpenFood}
        onBanhoTosaClick={onOpenGrooming}
        onMedicacaoClick={onOpenMedication}
        alertVacinas={alertVacinas}
        colorVacinas={colorVacinas}
        alertVermifugo={alertVermifugo}
        colorVermifugo={colorVermifugo}
        alertAntipulgas={alertAntipulgas}
        colorAntipulgas={colorAntipulgas}
        alertColeira={alertColeira}
        colorColeira={colorColeira}
        alertGrooming={alertGrooming}
        colorGrooming={colorGrooming}
        alertFood={alertFood}
        colorFood={colorFood}
        alertMedicacao={alertMedicacao}
        colorMedicacao={colorMedicacao}
        inactiveControls={inactiveControls}
        onDeactivateControl={handleDeactivateControl}
      />

      {inactiveItems.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-300/80 bg-white/75 px-3 py-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2 text-left">
            <span className="text-[13px] text-slate-500">⌄</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-700">Controles inativos ({inactiveItems.length})</p>
              <p className="text-[11px] text-slate-500 truncate">Eles ficam sem cor para incentivar o clique. Toque para reativar e abrir.</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {inactiveItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleReactivateControl(item.id)}
                className="rounded-xl border border-slate-300 bg-slate-100/90 px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] hover:bg-white transition-colors"
              >
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Inativo</p>
                <p className="mt-1 text-[13px] font-semibold text-slate-700 truncate">{item.label}</p>
                <p className="mt-1 text-[11px] text-slate-500">Toque para abrir</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <RemindersSection
        petEvents={petEvents}
        vaccines={vaccines}
        parasiteControls={parasiteControls}
        groomingRecords={groomingRecords}
        feedingPlan={feedingPlan}
        currentPet={currentPet}
        inactiveControls={inactiveControls}
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
        onOpenVaccines={onOpenVaccines}
        onOpenVermifugo={onOpenVermifugo}
        onOpenAntipulgas={onOpenAntipulgas}
        onOpenColeira={onOpenColeira}
        onOpenGrooming={onOpenGrooming}
        onOpenMedication={onOpenMedication}
        onOpenFood={onOpenFood}
        onOpenEvents={onOpenEvents}
      />
    </div>
  );
}