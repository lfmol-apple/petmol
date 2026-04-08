'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { ParasiteItemSheet } from '@/components/home/ParasiteItemSheet';
import { FoodItemSheet } from '@/components/home/FoodItemSheet';
import type { PetHealthProfile } from '@/lib/petHealth';
import type { ParasiteControl } from '@/lib/types/home';

type StepStatus = 'pending' | 'visiting' | 'none' | 'done' | 'skipped';
type SheetType = 'vermifugo' | 'antipulgas' | 'coleira' | 'food';

interface CheckupState {
  petName: string;
  vaccines: StepStatus;
  vermifugo: StepStatus;
  antipulgas: StepStatus;
  coleira: StepStatus;
  food: StepStatus;
}

const STORAGE_KEY = 'petmol_checkup_v1';

const ITEMS = [
  {
    key: 'vaccines' as const,
    icon: '💉',
    title: 'Vacinas',
    btnLabel: 'Registrar vacina',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    cardBg: 'bg-blue-50/50 border-blue-100',
    btnClass: 'bg-[#0056D2] text-white',
  },
  {
    key: 'vermifugo' as const,
    icon: '🪱',
    title: 'Vermífugo',
    btnLabel: 'Adicionar vermífugo',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    cardBg: 'bg-emerald-50/50 border-emerald-100',
    btnClass: 'bg-emerald-600 text-white',
  },
  {
    key: 'antipulgas' as const,
    icon: '🛡️',
    title: 'Antipulgas',
    btnLabel: 'Adicionar antipulgas',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    cardBg: 'bg-orange-50/50 border-orange-100',
    btnClass: 'bg-orange-500 text-white',
  },
  {
    key: 'coleira' as const,
    icon: '⭕',
    title: 'Coleira',
    btnLabel: 'Adicionar coleira',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-600',
    cardBg: 'bg-purple-50/50 border-purple-100',
    btnClass: 'bg-purple-600 text-white',
  },
  {
    key: 'food' as const,
    icon: '🍖',
    title: 'Alimentação',
    btnLabel: 'Adicionar alimentação',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    cardBg: 'bg-amber-50/50 border-amber-100',
    btnClass: 'bg-amber-500 text-white',
    optional: true,
  },
] as const;

export default function CheckupPage() {
  const router = useRouter();
  const [state, setState] = useState<CheckupState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [petId, setPetId] = useState<string | null>(null);
  const [pet, setPet] = useState<PetHealthProfile | null>(null);
  const [parasiteControls, setParasiteControls] = useState<ParasiteControl[]>([]);
  const [openSheet, setOpenSheet] = useState<SheetType | null>(null);

  // Load check-up state from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { router.replace('/home'); return; }
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      setState({
        petName: parsed.petName || '',
        vaccines: (parsed.vaccines as StepStatus) || 'pending',
        vermifugo: (parsed.vermifugo as StepStatus) || 'pending',
        antipulgas: (parsed.antipulgas as StepStatus) || 'pending',
        coleira: (parsed.coleira as StepStatus) || 'pending',
        food: (parsed.food as StepStatus) || 'pending',
      });
      setLoaded(true);
    } catch { router.replace('/home'); }
  }, [router]);

  // Fetch pet from API once loaded
  useEffect(() => {
    if (!loaded) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE_URL}/pets`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((pets: Array<{ id: string | number; name?: string; pet_name?: string; species?: string; }>) => {
        if (!pets.length) return;
        const p = pets[0];
        const id = String(p.id);
        setPetId(id);
        setPet({
          pet_id: id,
          pet_name: p.name || p.pet_name || '',
          species: (p.species as PetHealthProfile['species']) || 'dog',
          vaccines: [], exams: [], prescriptions: [], appointments: [],
          surgeries: [], allergies: [], chronic_conditions: [],
          weight_history: [], dental_records: [], parasite_history: [],
          documents: [], daily_walks: [],
          primary_vet: { name: '', clinic: '', phone: '' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      })
      .catch(() => {});
  }, [loaded]);

  const markDone = useCallback((key: keyof Omit<CheckupState, 'petName'>) => {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: 'done' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const markSkipped = useCallback((key: keyof Omit<CheckupState, 'petName'>) => {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev, [key]: 'skipped' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // After ParasiteItemSheet saves, refresh the list and mark step done
  const handleParasiteRefresh = useCallback(async (step: 'vermifugo' | 'antipulgas' | 'coleira') => {
    markDone(step);
    const token = getToken();
    if (!token || !petId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/pets/${petId}/parasites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setParasiteControls(await res.json());
    } catch {}
  }, [petId, markDone]);

  // When returning from the vaccine modal, check the API to see if a vaccine was actually saved
  useEffect(() => {
    if (!petId || !state || state.vaccines !== 'visiting') return;
    const token = getToken();
    const check = async () => {
      try {
        const res = token
          ? await fetch(`${API_BASE_URL}/pets/${petId}/vaccines`, { headers: { Authorization: `Bearer ${token}` } })
          : null;
        const list: unknown[] = res?.ok ? await res.json() : [];
        const next: StepStatus = list.length > 0 ? 'done' : 'none';
        setState(prev => {
          if (!prev) return prev;
          const updated = { ...prev, vaccines: next };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
      } catch {
        setState(prev => {
          if (!prev) return prev;
          const updated = { ...prev, vaccines: 'none' as StepStatus };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
      }
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, state?.vaccines]);

  // Vaccine click: mark as 'visiting' (not done yet) then navigate to real modal
  const handleVaccineClick = useCallback(() => {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev, vaccines: 'visiting' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    sessionStorage.setItem('petmol_checkup_return', '1');
    router.push('/home?modal=vaccine-sheet');
  }, [router]);

  const handleFinish = useCallback(() => {
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      (['vaccines', 'vermifugo', 'antipulgas', 'coleira', 'food'] as const).forEach(k => {
        if (next[k] === 'pending' || next[k] === 'visiting' || next[k] === 'none') next[k] = 'skipped';
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    router.push('/home');
  }, [router]);

  if (!loaded || !state) return null;

  const petName = state.petName || 'seu pet';
  const doneCount = (['vaccines', 'vermifugo', 'antipulgas', 'coleira', 'food'] as const).filter(k => state[k] === 'done').length;
  const progressPct = Math.round((doneCount / 5) * 100);

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      {/* Header */}
      <div className="w-full max-w-sm mx-auto px-6 pt-12 pb-5">
        <p className="text-xs font-semibold text-[#0056D2] uppercase tracking-wider mb-2">Primeiros cuidados</p>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          Colocar {petName} em dia
        </h1>
        <p className="text-sm text-gray-500 mt-1">Leva menos de 1 minuto</p>

        {/* Progress bar — only shows after first action */}
        {doneCount > 0 && (
          <div className="mt-5">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-gray-400">
                {doneCount} de 5 {doneCount === 1 ? 'cuidado' : 'cuidados'} registrado{doneCount !== 1 ? 's' : ''}
              </span>
              <span className="text-xs font-semibold text-[#0056D2]">{progressPct}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0056D2] rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="w-full max-w-sm mx-auto px-6 space-y-3 flex-1">
        {ITEMS.map(item => {
          const status = state[item.key];
          const isDone = status === 'done';
          const isNone = status === 'none';
          const isVisiting = status === 'visiting';
          const isSkipped = status === 'skipped';

          if (isDone) {
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 py-3.5 px-4 rounded-2xl bg-gray-50 border border-gray-100"
              >
                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-600">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                </div>
                <span className="text-sm text-gray-500 flex-1">{item.title}</span>
                <span className="text-xs font-semibold text-green-600">Registrado</span>
              </div>
            );
          }

          // 'none' or 'skipped' — closed without saving / explicitly skipped
          if (isNone || isSkipped) {
            return (
              <div key={item.key} className="rounded-2xl border px-4 py-4 bg-gray-50 border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-base leading-none opacity-40">{item.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-400">{item.title}</span>
                    <span className="ml-2 text-xs text-gray-400">Sem registro</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (item.key === 'vaccines') {
                        handleVaccineClick();
                      } else {
                        // Reset to pending so the close-without-save handler can fire again
                        setState(prev => {
                          if (!prev) return prev;
                          const next = { ...prev, [item.key]: 'pending' as StepStatus };
                          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                          return next;
                        });
                        setOpenSheet(item.key as SheetType);
                      }
                    }}
                    className="flex-1 py-2.5 text-xs font-semibold rounded-xl active:scale-[0.98] transition-transform bg-gray-200 text-gray-600"
                  >
                    Tentar novamente
                  </button>
                  <button
                    onClick={() => markSkipped(item.key)}
                    className="px-3 py-2.5 text-xs text-gray-400 font-medium rounded-xl active:scale-[0.98] transition-transform"
                  >
                    Pular
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.key}
              className={`rounded-2xl border px-4 py-4 ${item.cardBg} ${isVisiting ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-xl ${item.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-base leading-none">{item.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                  {'optional' in item && item.optional && (
                    <span className="ml-1.5 text-xs text-gray-400 font-normal">(opcional)</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (item.key === 'vaccines') handleVaccineClick();
                    else setOpenSheet(item.key as SheetType);
                  }}
                  className={`flex-1 py-2.5 text-xs font-semibold rounded-xl active:scale-[0.98] transition-transform ${item.btnClass}`}
                >
                  {isVisiting && item.key === 'vaccines' ? 'Abrindo…' : item.btnLabel}
                </button>
                {!isSkipped && !isVisiting && (
                  <button
                    onClick={() => markSkipped(item.key)}
                    className="px-3 py-2.5 text-xs text-gray-400 font-medium rounded-xl active:scale-[0.98] transition-transform"
                  >
                    Pular
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="w-full max-w-sm mx-auto px-6 pt-6 pb-10">
        <button
          onClick={handleFinish}
          className="w-full py-3.5 bg-gray-900 text-white text-sm font-semibold rounded-2xl active:scale-[0.98] transition-transform"
        >
          Entrar no app →
        </button>
        <p className="text-center text-xs text-gray-400 mt-2">
          Você pode adicionar depois, quando quiser.
        </p>
      </div>

      {/* ── Real sheets ────────────────────────────────────────────── */}
      {openSheet === 'vermifugo' && petId && (
        <ParasiteItemSheet
          type="dewormer"
          petId={petId}
          petName={petName}
          parasiteControls={parasiteControls.filter(
            p => ['dewormer', 'heartworm', 'leishmaniasis'].includes(p.type),
          )}
          onClose={() => {
            setOpenSheet(null);
            setState(prev => {
              if (!prev || prev.vermifugo !== 'pending') return prev;
              const next = { ...prev, vermifugo: 'none' as StepStatus };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              return next;
            });
          }}
          onRefresh={() => handleParasiteRefresh('vermifugo')}
        />
      )}

      {openSheet === 'antipulgas' && petId && (
        <ParasiteItemSheet
          type="flea_tick"
          petId={petId}
          petName={petName}
          parasiteControls={parasiteControls.filter(p => p.type === 'flea_tick')}
          onClose={() => {
            setOpenSheet(null);
            setState(prev => {
              if (!prev || prev.antipulgas !== 'pending') return prev;
              const next = { ...prev, antipulgas: 'none' as StepStatus };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              return next;
            });
          }}
          onRefresh={() => handleParasiteRefresh('antipulgas')}
        />
      )}

      {openSheet === 'coleira' && petId && (
        <ParasiteItemSheet
          type="collar"
          petId={petId}
          petName={petName}
          parasiteControls={parasiteControls.filter(p => p.type === 'collar')}
          onClose={() => {
            setOpenSheet(null);
            setState(prev => {
              if (!prev || prev.coleira !== 'pending') return prev;
              const next = { ...prev, coleira: 'none' as StepStatus };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              return next;
            });
          }}
          onRefresh={() => handleParasiteRefresh('coleira')}
        />
      )}

      {openSheet === 'food' && pet && (
        <FoodItemSheet
          pet={pet}
          onClose={() => {
            setOpenSheet(null);
            setState(prev => {
              if (!prev || prev.food !== 'pending') return prev;
              const next = { ...prev, food: 'none' as StepStatus };
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              return next;
            });
          }}
          onSaved={() => {
            markDone('food');
            setOpenSheet(null);
          }}
        />
      )}
    </div>
  );
}
