'use client';
import { getToken } from '@/lib/auth-token';
import { useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { dateToLocalISO } from '@/lib/localDate';

export interface CheckinPet {
  pet_id: string;
  pet_name: string;
}

interface Props {
  pets: CheckinPet[];
  preferredDay?: number;
  preferredHour?: number;
  preferredMinute?: number;
  forceShow?: boolean;
  onVacinas: () => void;
  onParasitas: () => void;
  onMedicacao: () => void;
  onConsultas: () => void;
  onHigiene: () => void;
  onAlimentacao: () => void;
}

type ModalState = 'idle' | 'show' | 'done';
type Step = 'main' | 'saude';

function currentMonthRef(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function snoozeUntil7Days(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return dateToLocalISO(d);
}

export function MonthlyCheckinBanner({
  pets,
  preferredDay = 5,
  preferredHour = 9,
  preferredMinute = 0,
  forceShow = false,
  onVacinas,
  onParasitas,
  onMedicacao,
  onConsultas,
  onHigiene,
  onAlimentacao,
}: Props) {
  const [queue, setQueue] = useState<CheckinPet[]>([]);
  const [state, setState] = useState<ModalState>('idle');
  const [step, setStep] = useState<Step>('main');
  const monthRef = currentMonthRef();

  // ── Verificar se deve mostrar (dia + hora) ─────────────────────────────
  const shouldShowNow = useCallback((): boolean => {
    const now = new Date();
    const todayDay = now.getDate();
    const todayHour = now.getHours();
    const todayMinute = now.getMinutes();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const effectiveDay = preferredDay === 0 ? lastDay : Math.min(preferredDay, lastDay);
    if (todayDay < effectiveDay) return false;
    const timeReached = todayHour > preferredHour || (todayHour === preferredHour && todayMinute >= preferredMinute);
    return timeReached;
  }, [preferredDay, preferredHour, preferredMinute]);

  // ── Montar fila de pets com checkin pendente ───────────────────────────
  const buildQueue = useCallback(async () => {
    if ((!forceShow && !shouldShowNow()) || pets.length === 0) return;
    const token = getToken();
    if (!token) return;

    const pending: CheckinPet[] = [];
    await Promise.all(
      pets.map(async (pet) => {
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/checkins/monthly?month_ref=${monthRef}&pet_id=${pet.pet_id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!res.ok) return;
          const data = await res.json();
          const checkins: Array<{ effective_status: string }> = data.checkins ?? [];
          const isPending =
            checkins.length === 0 || checkins.every((c) => c.effective_status === 'pending');
          if (isPending) pending.push(pet);
        } catch {
          // ignorar erro individual
        }
      })
    );

    // Ordenar pela ordem original de pets
    const ordered = pets.filter((p) => pending.some((pp) => pp.pet_id === p.pet_id));
    if (ordered.length > 0) {
      setQueue(ordered);
      setState('show');
    }
  }, [pets, monthRef, shouldShowNow, forceShow]);

  useEffect(() => {
    buildQueue();
  }, [buildQueue]);

  // ── Pet atual no topo da fila ──────────────────────────────────────────
  const currentPet = queue[0] ?? null;

  const postStatus = useCallback(
    async (petId: string, status: 'nothing' | 'snoozed') => {
      const token = getToken();
      if (!token) return;
      await fetch(`${API_BASE_URL}/api/checkins/monthly`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month_ref: monthRef,
          pet_id: petId,
          status,
          ...(status === 'snoozed' ? { snooze_until: snoozeUntil7Days() } : {}),
        }),
      });
    },
    [monthRef]
  );

  // Avança para o próximo pet ou fecha se acabou
  const advance = useCallback(
    (petId: string, status: 'nothing' | 'snoozed') => {
      postStatus(petId, status);
      setStep('main');
      setQueue((prev) => {
        const next = prev.slice(1);
        if (next.length === 0) setState('done');
        return next;
      });
    },
    [postStatus]
  );

  // Leaf: fechar e abrir o modal de registro
  const handleLeaf = useCallback(
    (cb: () => void) => {
      if (!currentPet) return;
      // Marca como 'nothing' para não voltar neste mês (já que vai registrar)
      postStatus(currentPet.pet_id, 'nothing');
      setStep('main');
      setQueue((prev) => {
        const next = prev.slice(1);
        if (next.length === 0) setState('done');
        return next;
      });
      cb();
    },
    [currentPet, postStatus]
  );

  if (state !== 'show' || !currentPet) return null;

  const mainOptions = [
    { icon: '🏥', label: 'Saúde', sub: 'Vacinas · Consultas', action: () => setStep('saude') },
    { icon: '🛁', label: 'Higiene', sub: 'Banho · Tosa', action: () => handleLeaf(onHigiene) },
    { icon: '🥣', label: 'Alimentação', sub: 'Ração · Consumo', action: () => handleLeaf(onAlimentacao) },
  ];

  const saudeOptions = [
    { icon: '💉', label: 'Vacinas', sub: 'Registrar dose', action: () => handleLeaf(onVacinas) },
    { icon: '🛡️', label: 'Antiparasitários', sub: 'Vermífugos · Pulgas', action: () => handleLeaf(onParasitas) },
    { icon: '💊', label: 'Medicação', sub: 'Tratamentos', action: () => handleLeaf(onMedicacao) },
    { icon: '🩺', label: 'Consultas', sub: 'Visitas · Exames', action: () => handleLeaf(onConsultas) },
  ];

  // Progresso: ex. "Pet 1 de 3"
  const totalPets = queue.length + (state === 'show' ? 0 : 0); // queue já inclui current
  const petIndex = pets.findIndex((p) => p.pet_id === currentPet.pet_id) + 1;
  const petTotal = pets.filter((p) => queue.some((q) => q.pet_id === p.pet_id)).length;
  const showProgress = petTotal > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md backdrop-blur-sm px-4"
      onClick={() => advance(currentPet.pet_id, 'snoozed')}
    >
      <div
        className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-xs overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-orange-400 to-pink-500 px-5 pt-5 pb-4">
          <div className="flex items-start gap-2">
            {step === 'saude' && (
              <button
                onClick={() => setStep('main')}
                className="mt-0.5 text-white/70 hover:text-white transition-colors flex-shrink-0 text-lg leading-none"
                aria-label="Voltar"
              >
                ←
              </button>
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  {step === 'main'
                    ? `Lembrete mensal · ${currentPet.pet_name}`
                    : `Saúde · ${currentPet.pet_name}`}
                </p>
                {showProgress && (
                  <span className="text-[10px] bg-white/20 text-white rounded-full px-2 py-0.5 font-medium">
                    {queue.length} pet{queue.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-white leading-snug">
                {step === 'main'
                  ? 'Este mês teve algum atendimento ou intercorrência?'
                  : 'O que deseja registrar?'}
              </h2>
            </div>
          </div>
        </div>

        {/* Grid */}
        {step === 'main' ? (
          <div className="grid grid-cols-3 gap-2 p-4">
            {mainOptions.map(({ icon, label, sub, action }) => (
              <button
                key={label}
                onClick={action}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 active:scale-95 transition-all py-3 px-1"
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-semibold text-gray-700">{label}</span>
                <span className="text-[10px] text-gray-400 text-center leading-tight">{sub}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-4">
            {saudeOptions.map(({ icon, label, sub, action }) => (
              <button
                key={label}
                onClick={action}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 active:scale-95 transition-all py-3 px-2"
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-xs font-semibold text-gray-700 text-center">{label}</span>
                <span className="text-[10px] text-gray-400 text-center leading-tight">{sub}</span>
              </button>
            ))}
          </div>
        )}

        {/* Ações secundárias */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={() => advance(currentPet.pet_id, 'nothing')}
            className="flex-1 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors border-r border-gray-100"
          >
            Nada a registrar
          </button>
          <button
            onClick={() => advance(currentPet.pet_id, 'snoozed')}
            className="flex-1 py-3 text-xs text-gray-400 hover:bg-gray-50 transition-colors"
          >
            Lembrar depois
          </button>
        </div>
      </div>
    </div>
  );
}
