'use client';

import { getToken } from '@/lib/auth-token';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { trackV1Metric } from '@/lib/v1Metrics';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimpleFoodData {
  brand: string;
  packageSizeKg: string;
  durationDays: string;
  startDate: string;
}

export interface FoodControlTabProps {
  petId: string;
  petName?: string;
  countryCode?: string;
  species?: 'dog' | 'cat';
  onSaved?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateToLocalISO(dt);
}

function fmtDate(s: string): string {
  const [, m, d] = s.split('-').map(Number);
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} de ${MONTHS[m - 1]}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FoodControlTab({ petId, petName: _petName, countryCode, species, onSaved }: FoodControlTabProps) {
  const storageKey = `petmol_food_v2_${petId}`;

  const [form, setForm] = useState<SimpleFoodData>({
    brand: '',
    packageSizeKg: '',
    durationDays: '',
    startDate: localTodayISO(),
  });
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [reminderTime, setReminderTime] = useState('09:00');

  // ─── Load existing plan ───────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE_URL}/api/health/pets/${petId}/feeding/plan`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          const plan = json.plan;
          if (plan?.enabled) {
            const pkgKg = plan.package_size_kg ?? 0;
            const dailyG = plan.daily_amount_g ?? 0;
            const duration = pkgKg && dailyG ? Math.round((pkgKg * 1000) / dailyG) : '';
            setForm({
              brand: plan.food_brand ?? '',
              packageSizeKg: pkgKg ? String(pkgKg) : '',
              durationDays: duration ? String(duration) : '',
              startDate: plan.last_refill_date
                ? plan.last_refill_date.split('T')[0]
                : localTodayISO(),
            });
            setHasExisting(true);
            return;
          }
        }
      } catch { /* offline */ }

      // Fallback: localStorage cache
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const cached = JSON.parse(raw) as Partial<SimpleFoodData>;
          setForm({
            brand: cached.brand ?? '',
            packageSizeKg: cached.packageSizeKg ?? '',
            durationDays: cached.durationDays ?? '',
            startDate: cached.startDate ?? localTodayISO(),
          });
          setHasExisting(Boolean(cached.brand || cached.packageSizeKg));
        }
      } catch { /* silent */ }
    };
    load();
  }, [petId, storageKey]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const pkgKg = parseFloat(form.packageSizeKg) || null;
  const days = parseInt(form.durationDays) || null;
  const estimatedEndDate =
    form.startDate && days ? addDays(form.startDate, days) : null;
  const alertDate = estimatedEndDate ? addDays(estimatedEndDate, -3) : null;

  const set = (key: keyof SimpleFoodData, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSavedOk(false);
    setApiError(null);

    const dailyG =
      pkgKg && days ? Math.round((pkgKg * 1000) / days) : null;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/health/pets/${petId}/feeding/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          species: species ?? 'dog',
          country_code: countryCode ?? 'BR',
          food_brand: form.brand || '',
          package_size_kg: pkgKg,
          daily_amount_g: dailyG,
          last_refill_date: form.startDate || null,
          safety_buffer_days: 3,
          mode: 'kibble',
          enabled: true,
          notes: '',
          no_consumption_control: false,
          next_purchase_date: null,
          manual_reminder_days_before: parseInt(reminderDays) || 3,
          reminder_time: reminderTime || '09:00',
        }),
      });

      if (res.ok) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(form));
        } catch { /* silent */ }

        if (!hasExisting) {
          trackV1Metric('food_cycle_created', {
            pet_id: petId,
            brand: form.brand || null,
            package_size_kg: pkgKg,
          });
        }
        setHasExisting(true);
        setSavedOk(true);
        onSaved?.();
        setTimeout(() => setSavedOk(false), 3000);
      } else {
        setApiError('Erro ao salvar. Tente novamente.');
      }
    } catch {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form));
      } catch { /* silent */ }
      setApiError('Sem conexão. Dados salvos localmente.');
    }

    setSaving(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 pb-8">

      {/* Campos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Marca / Produto
          </label>
          <input
            type="text"
            value={form.brand}
            onChange={e => set('brand', e.target.value)}
            placeholder="Ex: Royal Canin, Guabi Natural..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Pacote (kg)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={form.packageSizeKg}
              onChange={e => set('packageSizeKg', e.target.value)}
              placeholder="Ex: 15"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Duração (dias)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={form.durationDays}
              onChange={e => set('durationDays', e.target.value)}
              placeholder="Ex: 30"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Data de início
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
          />
        </div>
      </div>

      <ReminderPicker
        days={reminderDays}
        time={reminderTime}
        onDaysChange={setReminderDays}
        onTimeChange={setReminderTime}
      />

      {/* Resumo calculado */}
      {estimatedEndDate && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span>📦</span>
            <span className="text-sm font-bold text-amber-800">
              Término estimado: {fmtDate(estimatedEndDate)}
            </span>
          </div>
          {alertDate && (
            <div className="flex items-center gap-2">
              <span>🔔</span>
              <span className="text-xs text-amber-700">
                Aviso de recompra: {fmtDate(alertDate)}{' '}
                <span className="text-amber-500">(3 dias antes)</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      {apiError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 flex items-start gap-2">
          <span>⚠️</span>
          <span>{apiError}</span>
        </div>
      )}
      {savedOk && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-center gap-2">
          <span>✅</span>
          <span>
            Salvo!{' '}
            {alertDate
              ? `Aviso configurado para ${fmtDate(alertDate)} às ${reminderTime}.`
              : `Aviso configurado para ${parseInt(reminderDays) || 3} dias antes do término.`}
          </span>
        </div>
      )}

      {/* Botão */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-[15px] font-bold shadow-md disabled:opacity-50 active:scale-[0.99] transition-all"
      >
        {saving ? 'Salvando...' : hasExisting ? '✅ Atualizar ração' : '✅ Confirmar ração'}
      </button>
    </div>
  );
}
