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
  if (diff === 0) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (diff <= 3) return 'border-orange-200 bg-orange-50 text-orange-800';
  if (diff <= 7) return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-white text-slate-700';
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
  onOpenEmergency: () => void;
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
  onOpenEmergency,
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
      onOpenVaccines: onOpenHealth,
      onOpenVermifugo: onOpenHealth,
      onOpenAntipulgas: onOpenHealth,
      onOpenColeira: onOpenHealth,
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
    onOpenGrooming,
    onOpenFood,
    onOpenMedication,
    onOpenEvents,
  ]);
  
  return (
    <div className="relative px-2 pt-0 space-y-3 -mt-6">
      <AppleControlButtons
        onHealthClick={onOpenHealth}
        onEmergencyClick={onOpenEmergency}
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
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-3 shadow-sm backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Próximos lembretes</p>
              <p className="text-[13px] font-semibold text-slate-700">O que vem pela frente para {currentPet.pet_name}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{upcomingReminders.length}</span>
          </div>

          <div className="space-y-2">
            {upcomingReminders.map((reminder) => (
              <button
                key={reminder.key}
                onClick={reminder.action}
                className="flex w-full items-center gap-2.5 rounded-xl border border-transparent bg-slate-50/70 px-2.5 py-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm">
                  {reminder.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-slate-800">{reminder.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-slate-500">
                    {reminder.sublabel || 'Toque para abrir o cuidado'}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-[11px] font-semibold text-slate-500">{formatReminderDate(reminder.due_date)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${getReminderTone(reminder.diff)}`}>
                    {formatReminderBadge(reminder.diff)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
