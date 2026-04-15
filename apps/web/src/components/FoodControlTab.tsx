'use client';

import { getToken } from '@/lib/auth-token';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { trackV1Metric } from '@/lib/v1Metrics';
import { ReminderPicker } from '@/components/ReminderPicker';
import { dateToLocalISO, localTodayISO } from '@/lib/localDate';
import { ProductBarcodeScanner } from '@/components/ProductBarcodeScanner';
import type { ScannedProduct } from '@/lib/productScanner';
import { googleShoppingUrl } from '@/lib/externalShopping';
import { resolveFoodCommerceSnapshot } from '@/features/commerce/homeContextualCommerce';
import { requestUserDecision } from '@/features/interactions/userPromptChannel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimpleFoodData {
  brand: string;
  packageSizeKg: string;
  durationDays: string;
  startDate: string;
  dailyConsumptionG: string;
  barcode?: string;
  category?: string;
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
    dailyConsumptionG: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [recurringProducts, setRecurringProducts] = useState<Array<{ name: string; count: number; lastUsed: string }>>([]);
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);

  const applyScannedProduct = (product: ScannedProduct) => {
    setForm(prev => ({
      ...prev,
      brand: [product.brand, product.name].filter(Boolean).join(' ').trim() || prev.brand,
      packageSizeKg: product.weight?.toLowerCase().includes('kg')
        ? product.weight.replace(/kg/i, '').replace(',', '.').trim()
        : prev.packageSizeKg,
      barcode: product.barcode,
      category: product.category,
    }));
    if (!product.found) setApiError('Não encontramos os dados. Preencha manualmente.');
  };

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
              dailyConsumptionG: dailyG ? String(dailyG) : '',
            });
            setHasExisting(true);
            setLoadedExisting(true);
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
            dailyConsumptionG: cached.dailyConsumptionG ?? '',
            barcode: cached.barcode,
            category: cached.category,
          });
          setHasExisting(Boolean(cached.brand || cached.packageSizeKg));
        }
      } catch { /* silent */ }
      setLoadedExisting(true);
    };
    load();
  }, [petId, storageKey]);

  useEffect(() => {
    if (!loadedExisting) return;
    try {
      const raw = sessionStorage.getItem('petmol_pending_scanned_product');
      if (!raw) return;
      const payload = JSON.parse(raw) as { petId?: string; product?: ScannedProduct };
      if (payload.petId !== petId || !payload.product || payload.product.category !== 'food') return;
      applyScannedProduct(payload.product);
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
  }, [loadedExisting, petId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`petmol_product_usage_${petId}`);
      if (raw) setRecurringProducts(JSON.parse(raw));
    } catch { /* silent */ }
  }, [petId]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const pkgKg = parseFloat(form.packageSizeKg) || null;
  const dailyConsumptionG = parseFloat(form.dailyConsumptionG) || null;
  const days = dailyConsumptionG && pkgKg ? Math.round((pkgKg * 1000) / dailyConsumptionG) : (parseInt(form.durationDays) || null);
  const estimatedEndDate =
    form.startDate && days ? addDays(form.startDate, days) : null;
  const alertDate = estimatedEndDate ? addDays(estimatedEndDate, -3) : null;
  const daysLeft = estimatedEndDate ? Math.round((new Date(estimatedEndDate + 'T00:00:00').getTime() - Date.now()) / 86400000) : null;
  const commerceSnapshot = resolveFoodCommerceSnapshot({
    brand: form.brand,
    packageSizeKg: form.packageSizeKg,
    daysLeft,
    estimatedEndDate: estimatedEndDate ? fmtDate(estimatedEndDate) : null,
  });
  const foodHandoffUrl = commerceSnapshot
    ? `/api/handoff/shopping?query=${encodeURIComponent(commerceSnapshot.searchQuery)}&fallback=${encodeURIComponent(googleShoppingUrl(commerceSnapshot.searchQuery))}`
    : null;

  const set = (key: keyof SimpleFoodData, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSavedOk(false);
    setApiError(null);

    const dailyG = dailyConsumptionG || (pkgKg && days ? Math.round((pkgKg * 1000) / days) : null);

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
          notes: [
            form.barcode ? `EAN/GTIN: ${form.barcode}` : '',
            form.category ? `Categoria: ${form.category}` : '',
          ].filter(Boolean).join('\n'),
          no_consumption_control: false,
          next_purchase_date: null,
          manual_reminder_days_before: parseInt(reminderDays) || 3,
          reminder_time: reminderTime || '09:00',
        }),
      });

      if (res.ok) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(form));
          const usageKey = `petmol_product_usage_${petId}`;
          const current = JSON.parse(localStorage.getItem(usageKey) || '[]') as Array<{ name: string; count: number; lastUsed: string }>;
          const name = form.brand.trim();
          if (name) {
            const found = current.find(item => item.name.toLowerCase() === name.toLowerCase());
            if (found) {
              found.count += 1;
              found.lastUsed = localTodayISO();
            } else {
              current.push({ name, count: 1, lastUsed: localTodayISO() });
            }
            current.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
            localStorage.setItem(usageKey, JSON.stringify(current));
            setRecurringProducts(current);
          }
        } catch { /* silent */ }

        if (!hasExisting) {
          trackV1Metric('food_cycle_created', {
            pet_id: petId,
            brand: form.brand || null,
            package_size_kg: pkgKg,
          });
        }
        setHasExisting(true);
        setFormOpen(false);
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

  const handleDelete = async () => {
    const accepted = await requestUserDecision(
      'Excluir este registro de alimentação? Essa ação remove o ciclo atual e exige novo preenchimento depois.',
      {
        title: 'Excluir controle de alimentação',
        tone: 'danger',
        confirmLabel: 'Excluir registro',
      },
    );
    if (!accepted) return;

    setSaving(true);
    setDeleteFeedback(null);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/health/pets/${petId}/feeding/plan`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: 'include',
      });
      localStorage.removeItem(storageKey);
      setForm({ brand: '', packageSizeKg: '', durationDays: '', startDate: localTodayISO(), dailyConsumptionG: '' });
      setHasExisting(false);
      setSavedOk(false);
      if (!res.ok && res.status !== 404) {
        setApiError('Registro removido localmente. Tente sincronizar depois.');
      } else {
        setDeleteFeedback('Registro removido com sucesso.');
      }
      onSaved?.();
    } catch {
      localStorage.removeItem(storageKey);
      setHasExisting(false);
      setApiError('Sem conexão. Registro removido localmente.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const showForm = !hasExisting || formOpen;

  return (
    <div className="p-4 space-y-3 pb-8">

      {/* ── VIEW MODE ─────────────────────────────────────────────────────── */}
      {!showForm && (
        <div className="space-y-3">

          {/* Status card */}
          <div className={`rounded-2xl border p-4 space-y-2 ${
            daysLeft !== null && daysLeft < 0 ? 'bg-red-50 border-red-200' :
            daysLeft !== null && daysLeft <= 5 ? 'bg-orange-50 border-orange-200' :
            'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl flex-shrink-0">🥣</span>
                <p className="font-bold text-gray-900 text-sm truncate">{form.brand || 'Ração'}</p>
              </div>
              {daysLeft !== null && (
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${
                  daysLeft < 0 ? 'bg-red-100 text-red-700' :
                  daysLeft <= 5 ? 'bg-orange-100 text-orange-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {daysLeft < 0 ? 'Acabou' : daysLeft === 0 ? 'Hoje' : `${daysLeft}d restantes`}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 mt-1">
              {form.packageSizeKg && <span>📦 {form.packageSizeKg} kg</span>}
              {form.startDate && <span>📅 Início: {fmtDate(form.startDate)}</span>}
              {estimatedEndDate && (
                <span className="col-span-2">⏳ Término: <strong>{fmtDate(estimatedEndDate)}</strong></span>
              )}
            </div>
          </div>

          {/* Recomprar */}
          {commerceSnapshot && foodHandoffUrl && (
            <a
              href={foodHandoffUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full rounded-2xl border p-3 transition-all active:scale-[0.98] ${commerceSnapshot.status === 'urgent'
                ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                : commerceSnapshot.status === 'attention'
                  ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                  : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-base">🔄</span>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[13px] font-bold text-slate-900">{commerceSnapshot.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{commerceSnapshot.description}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">Handoff de compra via parceiro / Google Shopping</p>
                  </div>
                </div>
                <span className="flex-shrink-0 text-sm font-bold text-slate-700">{commerceSnapshot.ctaLabel}</span>
              </div>
            </a>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setFormOpen(true)}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 active:opacity-70"
            >
              ✏️ Editar ração
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-50"
            >
              🗑 Excluir
            </button>
          </div>

          {savedOk && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-center gap-2">
              <span>✅</span><span>Salvo!</span>
            </div>
          )}
          {deleteFeedback && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex items-center gap-2">
              <span>ℹ️</span><span>{deleteFeedback}</span>
            </div>
          )}
        </div>
      )}

      {/* ── FORM MODE ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="space-y-3">
          {hasExisting && (
            <button
              onClick={() => setFormOpen(false)}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm font-medium mb-1"
            >
              ‹ Voltar
            </button>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <ProductBarcodeScanner
              expectedCategory="food"
              petId={petId}
              onProductConfirmed={applyScannedProduct}
            />

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Marca / Produto</label>
              <input
                type="text"
                value={form.brand}
                onChange={e => set('brand', e.target.value)}
                placeholder="Ex: Royal Canin, Guabi Natural..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Pacote (kg)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={form.packageSizeKg}
                  onChange={e => set('packageSizeKg', e.target.value)}
                  placeholder="Ex: 15"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Duração (dias)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.durationDays}
                  onChange={e => set('durationDays', e.target.value)}
                  placeholder="Ex: 30"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Consumo/dia (g)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.dailyConsumptionG}
                  onChange={e => set('dailyConsumptionG', e.target.value)}
                  placeholder="Ex: 300"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Data início</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
                />
              </div>
            </div>
          </div>

          <ReminderPicker
            days={reminderDays}
            time={reminderTime}
            onDaysChange={setReminderDays}
            onTimeChange={setReminderTime}
          />

          {estimatedEndDate && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span>📦</span>
              <span className="text-xs font-semibold text-amber-800">
                Término estimado: {fmtDate(estimatedEndDate)}
              </span>
            </div>
          )}

          {alertDate && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span>⏰</span>
              <span className="text-xs font-medium text-slate-700">
                Janela sugerida para agir: {fmtDate(alertDate)}
              </span>
            </div>
          )}

          {apiError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 flex items-start gap-2">
              <span>⚠️</span><span>{apiError}</span>
            </div>
          )}
          {savedOk && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-center gap-2">
              <span>✅</span><span>Salvo!</span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-[15px] font-bold shadow-md disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {saving ? 'Salvando...' : hasExisting ? '✅ Atualizar ração' : '✅ Confirmar ração'}
          </button>
        </div>
      )}
    </div>
  );
}
