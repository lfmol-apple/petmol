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
  const storageKey = `petmol_food_control_${petId}`;

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
  const [apiEstimate, setApiEstimate] = useState<{ estimated_end_date: string | null; estimated_days_left: number | null } | null>(null);

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
            // Capture API-calculated estimate — no local recalculation
            setApiEstimate({
              estimated_end_date: json.estimate?.estimated_end_date ?? null,
              estimated_days_left: json.estimate?.estimated_days_left ?? null,
            });
            setHasExisting(true);
            setLoadedExisting(true);
            return;
          }
        }
      } catch { /* offline */ }

      // Fallback: localStorage cache (petmol_food_control key — API-format fields)
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const cached = JSON.parse(raw);
          // Handle both API-format (food_brand, package_size_kg) and legacy form-format
          const brand = cached.food_brand ?? cached.brand ?? '';
          const pkgKgNum: number | null = cached.package_size_kg ?? null;
          const dailyGNum: number | null = cached.daily_amount_g ?? null;
          setForm({
            brand,
            packageSizeKg: pkgKgNum != null ? String(pkgKgNum) : (cached.packageSizeKg ?? ''),
            durationDays: cached.durationDays ?? '',
            startDate: ((cached.last_refill_date ?? cached.startDate ?? localTodayISO()) as string).split('T')[0],
            dailyConsumptionG: dailyGNum != null ? String(dailyGNum) : (cached.dailyConsumptionG ?? ''),
            barcode: cached.barcode,
            category: cached.category,
          });
          if (cached.estimated_end_date) {
            setApiEstimate({ estimated_end_date: cached.estimated_end_date, estimated_days_left: null });
          }
          setHasExisting(Boolean(brand || pkgKgNum));
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

    // ── 1. Salvar no localStorage PRIMEIRO (otimista) ─────────────────────
    try {
      const existing = (() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; } })();
      localStorage.setItem(storageKey, JSON.stringify({
        ...existing,
        food_brand: form.brand || '',
        brand: form.brand || '',
        package_size_kg: pkgKg,
        daily_amount_g: dailyG,
        last_refill_date: form.startDate || null,
        barcode: form.barcode,
        category: form.category,
      }));
    } catch { /* silent */ }

    // ── 2. Fechar form e mostrar feedback imediatamente ─────────────────
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
    setTimeout(() => setSavedOk(false), 4000);

    // ── 3. Tentar sincronizar com API (sem bloquear UX) ────────────────
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
        // Atualizar produto no histórico de uso
        try {
          const usageKey = `petmol_product_usage_${petId}`;
          const current = JSON.parse(localStorage.getItem(usageKey) || '[]') as Array<{ name: string; count: number; lastUsed: string }>;
          const name = form.brand.trim();
          if (name) {
            const found = current.find(item => item.name.toLowerCase() === name.toLowerCase());
            if (found) { found.count += 1; found.lastUsed = localTodayISO(); }
            else { current.push({ name, count: 1, lastUsed: localTodayISO() }); }
            current.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
            localStorage.setItem(usageKey, JSON.stringify(current));
            setRecurringProducts(current);
          }
        } catch { /* silent */ }
      }
      // Se não ok: dado já está salvo no localStorage, não mostramos erro ao usuário
    } catch {
      // Offline: dado já está salvo no localStorage — sem ação adicional
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

          {/* Feedback de salvamento — no topo para garantir visibilidade */}
          {savedOk && (
            <div className="bg-green-500 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
              <span className="text-white text-lg">✅</span>
              <span className="text-white text-sm font-bold">Dados salvos!</span>
            </div>
          )}
          {deleteFeedback && (
            <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span>ℹ️</span><span className="text-sm text-slate-700">{deleteFeedback}</span>
            </div>
          )}

          {/* Status card */}
          <div className={`rounded-2xl border p-4 space-y-2 ${
            daysLeft !== null && daysLeft < 0 ? 'bg-red-50 border-red-200' :
            daysLeft !== null && daysLeft <= 5 ? 'bg-orange-50 border-orange-200' :
            'bg-white border-slate-200'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl flex-shrink-0">🥣</span>
                <p className="font-bold text-gray-900 text-sm leading-tight">{form.brand || 'Ração'}</p>
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
            {days != null && daysLeft !== null && (
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    daysLeft < 0 ? 'bg-red-400' :
                    daysLeft <= 5 ? 'bg-orange-400' :
                    'bg-green-400'
                  }`}
                  style={{ width: `${Math.max(4, Math.min(100, Math.round(((days - Math.max(daysLeft, 0)) / days) * 100)))}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 mt-0.5">
              {form.packageSizeKg && <span>📦 {form.packageSizeKg} kg</span>}
              {form.startDate && <span>📅 Início: {fmtDate(form.startDate)}</span>}
              {estimatedEndDate && (
                <span className="col-span-2">⏳ Prev. término: {fmtDate(estimatedEndDate)}</span>
              )}
            </div>
          </div>

          {/* Recomprar — exibido apenas quando há urgência ou atenção */}
          {commerceSnapshot && foodHandoffUrl && commerceSnapshot.status !== 'steady' && (
            <a
              href={foodHandoffUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`w-full flex items-center gap-3 rounded-2xl border p-3 transition-all active:scale-[0.98] ${
                commerceSnapshot.status === 'urgent'
                  ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                  : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
              }`}
            >
              <span className="text-xl flex-shrink-0">{commerceSnapshot.status === 'urgent' ? '🛒' : '⏰'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-slate-900 leading-tight">{commerceSnapshot.title}</p>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-tight">{commerceSnapshot.description}</p>
              </div>
              <span className="flex-shrink-0 text-[12px] font-bold text-slate-700 whitespace-nowrap">{commerceSnapshot.ctaLabel} ›</span>
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

          {pkgKg && dailyConsumptionG && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <span>📦</span>
              <span className="text-xs font-semibold text-amber-800">
                Duração estimada: ~{Math.round((pkgKg * 1000) / dailyConsumptionG)} dias (após salvar, data exata calculada pelo servidor)
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
