'use client';

import { useMemo } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
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
  onOpenHealth: () => void;
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
  onOpenFamily?: () => void;
}

export function HomePetDashboard({
  onOpenHealth,
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
  onOpenFamily,
}: HomePetDashboardProps) {

  const alertHealth = alertVacinas || alertVermifugo || alertAntipulgas || alertColeira || alertMedicacao;
  
  return (
    <div className="relative px-2 pt-0 space-y-3 -mt-6">
      <AppleControlButtons
        onHealthClick={onOpenHealth}
        onDocumentosClick={onOpenDocuments}
        onAlimentacaoClick={onOpenFood}
        onBanhoTosaClick={onOpenGrooming}
        onMedicacaoClick={onOpenMedication}
        onFamilyClick={onOpenFamily}
        alertHealth={alertHealth}
        alertGrooming={alertGrooming}
        alertFood={alertFood}
        alertMedicacao={alertMedicacao}
      />
    </div>
  );
}