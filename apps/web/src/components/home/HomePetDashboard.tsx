'use client';

import { useMemo } from 'react';
import { AppleControlButtons } from '@/components/AppleControlButtons';
import { buildPetCareReminders, resolveCareCTA } from '@/lib/petCareDomain';
import type { PetEventRecord } from '@/lib/petEvents';
import type { PetHealthProfile, VaccineRecord } from '@/lib/petHealth';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';
import type { GroomingRecord, ParasiteControl } from '@/lib/types/home';

type CardTone = 'neutral' | 'ok' | 'warning' | 'critical';

const reminderMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function createLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatReminderDate(dateStr: string): string {
  const date = createLocalDate(dateStr);
  return `${date.getDate()} ${reminderMonths[date.getMonth()]}`;
}

function formatReminderBadge(diff: number): string {
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  return `em ${diff}d`;
}

function getReminderTone(diff: number): string {
  if (diff === 0) return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  if (diff <= 3) return 'border-orange-500/30 bg-orange-500/10 text-orange-300';
  if (diff <= 7) return 'border-blue-500/30 bg-blue-500/10 text-blue-300';
  return 'border-white/10 bg-white/5 text-slate-400';
}

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
  colorVacinas?: CardTone;
  alertVermifugo?: boolean;
  colorVermifugo?: CardTone;
  alertAntipulgas?: boolean;
  colorAntipulgas?: CardTone;
  alertColeira?: boolean;
  colorColeira?: CardTone;
  alertGrooming?: boolean;
  colorGrooming?: CardTone;
  alertFood?: boolean;
  colorFood?: CardTone;
  alertMedicacao?: boolean;
  colorMedicacao?: CardTone;
  onOpenVaccines: () => void;
  onOpenVermifugo: () => void;
  onOpenAntipulgas: () => void;
  onOpenColeira: () => void;
  onOpenGrooming: () => void;
  onOpenMedication: () => void;
  onOpenFood: () => void;
  onOpenEvents: () => void;
  onOpenFamily?: () => void;
}

export function HomePetDashboard({
  petEvents,
  vaccines,
  parasiteControls,
  groomingRecords,
  feedingPlan,
  currentPet,
  tutorCheckinDay,
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
  onOpenVaccines,
  onOpenVermifugo,
  onOpenAntipulgas,
  onOpenColeira,
  onOpenGrooming,
  onOpenMedication,
  onOpenFood,
  onOpenEvents,
  onOpenFamily,
}: HomePetDashboardProps) {

  const healthTones = [colorVacinas, colorVermifugo, colorAntipulgas, colorColeira, colorMedicacao];
  const colorHealth: CardTone = healthTones.includes('critical')
    ? 'critical'
    : healthTones.includes('warning')
      ? 'warning'
      : healthTones.includes('ok')
        ? 'ok'
        : 'neutral';
  const alertHealth = colorHealth === 'warning' || colorHealth === 'critical' || alertVacinas || alertVermifugo || alertAntipulgas || alertColeira || alertMedicacao;
  const upcomingReminders = useMemo(() => {
    if (!currentPet?.pet_id) return [];

    const reminders = buildPetCareReminders(
      {
        pet_id: currentPet.pet_id,
        pet_name: currentPet.pet_name,
        vaccines,
        parasiteControls,
        groomingRecords,
        feedingPlan: feedingPlan[currentPet.pet_id] ?? null,
        petEvents,
      },
    );

    // Injetar lembrete de check-up mensal a partir do dia configurado pelo tutor
    if (tutorCheckinDay > 0) {
      const todayMs = new Date();
      todayMs.setHours(0, 0, 0, 0);
      const todayDay = todayMs.getDate();
      let targetYear = todayMs.getFullYear();
      let targetMonth = todayMs.getMonth(); // 0-based
      if (todayDay > tutorCheckinDay) {
        targetMonth += 1;
        if (targetMonth > 11) { targetMonth = 0; targetYear += 1; }
      }
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const effectiveDay = Math.min(tutorCheckinDay, lastDayOfMonth);
      const dueDate = new Date(targetYear, targetMonth, effectiveDay);
      const diff = Math.round((dueDate.getTime() - todayMs.getTime()) / 86400000);
      const dueDateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`;
      if (diff >= 0) {
        reminders.push({
          key: `${currentPet.pet_id}|monthly_checkin|${dueDateStr}`,
          pet_id: currentPet.pet_id,
          domain: 'event' as const,
          label: 'Check-up mensal',
          sublabel: 'Revisão geral de saúde',
          icon: '📋',
          due_date: dueDateStr,
          diff,
          status: diff === 0 ? ('today' as const) : ('upcoming' as const),
          action_target: 'health/events' as const,
          is_derived: true,
        });
      }
    }

    const careHandlers = {
      onOpenVaccines,
      onOpenVermifugo,
      onOpenAntipulgas,
      onOpenColeira,
      onOpenGrooming,
      onOpenFood,
      onOpenMedication,
      onOpenEvents,
    };

    return reminders
      .filter((reminder) => {
        if (reminder.diff < 0) return false;
        // Alimentação só aparece quando está próxima (≤ 14 dias)
        if (reminder.domain === 'food' && reminder.diff > 14) return false;
        return true;
      })
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .map((reminder) => ({
        ...reminder,
        action: resolveCareCTA(reminder.action_target, careHandlers),
      }));
  }, [
    currentPet,
    tutorCheckinDay,
    vaccines,
    parasiteControls,
    groomingRecords,
    feedingPlan,
    petEvents,
    onOpenHealth,
    onOpenVaccines,
    onOpenVermifugo,
    onOpenAntipulgas,
    onOpenColeira,
    onOpenGrooming,
    onOpenFood,
    onOpenMedication,
    onOpenEvents,
  ]);
  return (
    <div className="relative px-3 pt-1 space-y-4 screen-optimized pb-10">
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
        colorHealth={colorHealth}
        colorGrooming={colorGrooming}
        colorFood={colorFood}
        colorMedicacao={colorMedicacao}
      />

      {upcomingReminders.length > 0 && (
        <section className="rounded-[32px] bg-white px-4 py-6 shadow-sm border border-slate-200">
          {/* Header do Quadro de Lembretes */}
          <div className="mb-6 flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 bg-blue-600 rounded-full shadow-sm" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-0.5">Próximos lembretes</p>
                <p className="text-[17px] font-black text-slate-900 tracking-tight leading-none italic">Agenda de {currentPet.pet_name}</p>
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-blue-50 text-[13px] font-black text-blue-600 border border-blue-100">
              {upcomingReminders.length}
            </div>
          </div>

          {/* Lista de Itens com fundo branco interno */}
          <div className="space-y-1">
            {upcomingReminders.map((reminder) => {
              // Cor única padronizada para todos os títulos para clareza e uniformidade
              const labelColor = 'text-slate-800';

              return (
                <button
                  key={reminder.key}
                  onClick={reminder.action}
                  className="flex w-full items-center gap-3 rounded-[20px] bg-slate-100/60 px-3 py-2 text-left transition-all hover:bg-white hover:shadow-sm hover:border-slate-300 active:scale-[0.98] border border-slate-200/60"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] bg-white border border-slate-200 shadow-sm text-xl">
                    {reminder.icon}
                  </span>
                  
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-black leading-tight tracking-tight ${labelColor}`}>
                      {reminder.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-bold leading-tight text-slate-600 uppercase tracking-widest">
                      {reminder.sublabel || 'Confirmar'}
                    </span>
                  </span>
                  
                  <span className="flex flex-col items-end gap-1.5 flex-shrink-0 px-1">
                    <span className="text-[12px] font-black text-slate-700 tracking-tight uppercase tabular-nums">
                      {formatReminderDate(reminder.due_date)}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider shadow-md ${getReminderTone(reminder.diff)}`}>
                      {formatReminderBadge(reminder.diff)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
