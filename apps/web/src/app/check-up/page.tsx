'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { FoodItemSheet } from '@/components/home/FoodItemSheet';
import type { PetHealthProfile } from '@/lib/petHealth';

type StepStatus = 'pending' | 'visiting' | 'none' | 'done' | 'skipped';

interface CheckupState {
  petName: string;
  vaccines: StepStatus;
  vermifugo: StepStatus;
  antipulgas: StepStatus;
  coleira: StepStatus;
  food: StepStatus;
}

const STORAGE_KEY = 'petmol_checkup_v1';

function markAllSkipped(state: CheckupState): CheckupState {
  const next = { ...state };
  (['vaccines', 'vermifugo', 'antipulgas', 'coleira', 'food'] as const).forEach(k => {
    if (next[k] === 'pending' || next[k] === 'none' || next[k] === 'visiting') next[k] = 'skipped';
  });
  return next;
}

export default function CheckupPage() {
  const router = useRouter();
  const [state, setState] = useState<CheckupState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pet, setPet] = useState<PetHealthProfile | null>(null);
  const [openFood, setOpenFood] = useState(false);

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

  useEffect(() => {
    if (!loaded) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API_BASE_URL}/pets`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((pets: Array<{ id: string | number; name?: string; pet_name?: string; species?: string }>) => {
        if (!pets.length) return;
        const p = pets[0];
        const id = String(p.id);
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

  const goHome = useCallback((foodDone?: boolean) => {
    setState(prev => {
      if (!prev) return prev;
      const next = markAllSkipped(prev);
      if (foodDone) next.food = 'done';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    router.push('/home');
  }, [router]);

  const handleFoodSaved = useCallback(() => {
    setOpenFood(false);
    setState(prev => {
      if (!prev) return prev;
      const next = { ...prev, food: 'done' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleFoodClosed = useCallback(() => {
    setOpenFood(false);
    setState(prev => {
      if (!prev || prev.food !== 'pending') return prev;
      const next = { ...prev, food: 'none' as StepStatus };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  if (!loaded || !state) return null;

  const petName = state.petName || 'seu pet';
  const foodDone = state.food === 'done';

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      {/* Header */}
      <div className="w-full max-w-sm mx-auto px-6 pt-14 pb-4 text-center">
        <p className="text-5xl mb-5">🐾</p>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          Vamos cuidar de {petName}
        </h1>
        <p className="text-sm text-gray-500 mt-2.5 leading-relaxed">
          Escaneie a ração e o PETMOL calcula<br />quando vai acabar e te avisa antes.
        </p>
      </div>

      {/* Main content */}
      <div className="w-full max-w-sm mx-auto px-6 flex-1 flex flex-col gap-3 pt-4">
        {foodDone ? (
          <>
            <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-6 text-center">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-base font-bold text-green-800">Alimentação configurada!</p>
              <p className="text-sm text-green-600 mt-1.5 leading-snug">
                O PETMOL já está monitorando.<br />Você vai receber alertas antes de acabar.
              </p>
            </div>

            <button
              onClick={() => goHome(false)}
              className="w-full py-4 bg-gray-900 text-white text-sm font-semibold rounded-2xl active:scale-[0.98] transition-transform"
            >
              Entrar no app →
            </button>
          </>
        ) : (
          <>
            {/* Primary CTA */}
            <button
              onClick={() => { if (pet) setOpenFood(true); }}
              disabled={!pet}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-100 to-orange-200 px-5 py-5 active:scale-[0.98] transition-transform disabled:opacity-50 text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-amber-200 flex items-center justify-center text-3xl flex-shrink-0 shadow-sm">
                📷
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-amber-950">Escanear a ração agora</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-snug">
                  Aponte a câmera para a embalagem
                </p>
              </div>
              <span className="text-amber-600 text-xl font-semibold flex-shrink-0">›</span>
            </button>

            {/* What happens next */}
            <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4 space-y-2.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">O que acontece depois</p>
              {[
                { icon: '⏱', text: 'Calculamos quando a ração vai acabar' },
                { icon: '🔔', text: 'Você recebe um aviso antes de faltar' },
                { icon: '🛒', text: 'Um toque para comprar onde quiser' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">{icon}</span>
                  <p className="text-xs text-gray-600 leading-snug">{text}</p>
                </div>
              ))}
            </div>

            {/* Secondary action */}
            <button
              onClick={() => goHome(false)}
              className="w-full py-4 bg-gray-900 text-white text-sm font-semibold rounded-2xl active:scale-[0.98] transition-transform"
            >
              Configurar depois →
            </button>

            <p className="text-center text-xs text-gray-400 pb-2">
              Você pode escanear a qualquer momento pelo app.
            </p>
          </>
        )}
      </div>

      <div className="pb-10" />

      {openFood && pet && (
        <FoodItemSheet
          pet={pet}
          onClose={handleFoodClosed}
          onSaved={handleFoodSaved}
        />
      )}
    </div>
  );
}
