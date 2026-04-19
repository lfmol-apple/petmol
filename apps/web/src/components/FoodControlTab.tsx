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
  id: string;
  brand: string;
  packageSizeKg: string;
  durationDays: string;
  startDate: string;
  dailyConsumptionG: string;
  barcode?: string;
  category?: string;
  isPrimary: boolean;
}

interface PersistedFoodItem {
  id?: string;
  label?: string;
  food_brand?: string | null;
  package_size_kg?: number | null;
  daily_amount_g?: number | null;
  last_refill_date?: string | null;
  mode?: string | null;
  barcode?: string | null;
  category?: string | null;
  notes?: string | null;
  is_primary?: boolean;
}

export interface FoodControlTabState {
  showForm: boolean;
  commerceStatus: 'steady' | 'attention' | 'urgent' | null;
  foodBrand: string;
}

export interface FoodControlTabProps {
  petId: string;
  petName?: string;
  countryCode?: string;
  species?: 'dog' | 'cat';
  onSaved?: () => void;
  onStateChange?: (state: FoodControlTabState) => void;
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

function makeItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `food-item-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function createEmptyFoodItem(isPrimary = false): SimpleFoodData {
  return {
    id: makeItemId(),
    brand: '',
    packageSizeKg: '',
    durationDays: '',
    startDate: localTodayISO(),
    dailyConsumptionG: '',
    barcode: undefined,
    category: undefined,
    isPrimary,
  };
}

function ensurePrimaryItem(items: SimpleFoodData[]): SimpleFoodData[] {
  if (!items.length) return [createEmptyFoodItem(true)];
  const primaryIndex = items.findIndex((item) => item.isPrimary);
  const resolvedPrimaryIndex = primaryIndex >= 0 ? primaryIndex : 0;
  return items.map((item, index) => ({ ...item, isPrimary: index === resolvedPrimaryIndex }));
}

function hasUsefulFoodItem(item: SimpleFoodData): boolean {
  return Boolean(
    item.brand.trim() ||
    item.packageSizeKg.trim() ||
    item.durationDays.trim() ||
    item.dailyConsumptionG.trim() ||
    item.barcode ||
    item.category,
  );
}

function orderPrimaryFirst(items: SimpleFoodData[]): SimpleFoodData[] {
  return [...items].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

function getPrimaryItem(items: SimpleFoodData[]): SimpleFoodData {
  const normalized = ensurePrimaryItem(items);
  return normalized.find((item) => item.isPrimary) ?? normalized[0];
}

function getResolvedDailyConsumption(item: SimpleFoodData): number | null {
  const dailyConsumption = parseFloat(item.dailyConsumptionG);
  if (Number.isFinite(dailyConsumption) && dailyConsumption > 0) return dailyConsumption;
  const packageSizeKg = parseFloat(item.packageSizeKg);
  const durationDays = parseInt(item.durationDays, 10);
  if (Number.isFinite(packageSizeKg) && packageSizeKg > 0 && Number.isFinite(durationDays) && durationDays > 0) {
    return Math.round((packageSizeKg * 1000) / durationDays);
  }
  return null;
}

function getItemMetrics(item: SimpleFoodData): {
  packageSizeKg: number | null;
  dailyConsumptionG: number | null;
  days: number | null;
  localEndDate: string | null;
  localDaysLeft: number | null;
} {
  const packageSizeKg = parseFloat(item.packageSizeKg);
  const parsedPackageSizeKg = Number.isFinite(packageSizeKg) && packageSizeKg > 0 ? packageSizeKg : null;
  const dailyConsumptionG = getResolvedDailyConsumption(item);
  const manualDays = parseInt(item.durationDays, 10);
  const days = dailyConsumptionG && parsedPackageSizeKg
    ? Math.round((parsedPackageSizeKg * 1000) / dailyConsumptionG)
    : (Number.isFinite(manualDays) && manualDays > 0 ? manualDays : null);
  const localEndDate = item.startDate && days ? addDays(item.startDate, days) : null;
  const localDaysLeft = localEndDate
    ? Math.round((new Date(`${localEndDate}T00:00:00`).getTime() - Date.now()) / 86400000)
    : null;
  return {
    packageSizeKg: parsedPackageSizeKg,
    dailyConsumptionG,
    days,
    localEndDate,
    localDaysLeft,
  };
}

function normalizeLoadedItems(source: unknown): SimpleFoodData[] {
  if (!source || typeof source !== 'object') return [createEmptyFoodItem(true)];
  const record = source as { items?: PersistedFoodItem[]; [key: string]: unknown };
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const fromItems = rawItems.map((item) => ({
    id: item.id || makeItemId(),
    brand: item.food_brand ?? '',
    packageSizeKg: item.package_size_kg != null ? String(item.package_size_kg) : '',
    durationDays:
      item.package_size_kg && item.daily_amount_g
        ? String(Math.round((item.package_size_kg * 1000) / item.daily_amount_g))
        : '',
    startDate: (item.last_refill_date ?? localTodayISO()).split('T')[0],
    dailyConsumptionG: item.daily_amount_g != null ? String(item.daily_amount_g) : '',
    barcode: item.barcode ?? undefined,
    category: item.category ?? undefined,
    isPrimary: Boolean(item.is_primary),
  }));

  if (fromItems.length) return ensurePrimaryItem(fromItems);

  const legacy = {
    id: makeItemId(),
    brand: typeof record.food_brand === 'string'
      ? record.food_brand
      : (typeof record.brand === 'string' ? record.brand : ''),
    packageSizeKg:
      typeof record.package_size_kg === 'number'
        ? String(record.package_size_kg)
        : (typeof record.packageSizeKg === 'string' ? record.packageSizeKg : ''),
    durationDays: typeof record.durationDays === 'string' ? record.durationDays : '',
    startDate:
      typeof record.last_refill_date === 'string'
        ? record.last_refill_date.split('T')[0]
        : (typeof record.startDate === 'string' ? record.startDate.split('T')[0] : localTodayISO()),
    dailyConsumptionG:
      typeof record.daily_amount_g === 'number'
        ? String(record.daily_amount_g)
        : (typeof record.dailyConsumptionG === 'string' ? record.dailyConsumptionG : ''),
    barcode: typeof record.barcode === 'string' ? record.barcode : undefined,
    category: typeof record.category === 'string' ? record.category : undefined,
    isPrimary: true,
  };

  return [legacy];
}

function buildItemsPayload(items: SimpleFoodData[]): PersistedFoodItem[] {
  return ensurePrimaryItem(items).map((item, index) => ({
    id: item.id,
    label: item.brand.trim() || `Produto ${index + 1}`,
    food_brand: item.brand.trim() || null,
    package_size_kg: getItemMetrics(item).packageSizeKg,
    daily_amount_g: getItemMetrics(item).dailyConsumptionG,
    last_refill_date: item.startDate || null,
    mode: 'kibble',
    barcode: item.barcode ?? null,
    category: item.category ?? null,
    notes: null,
    is_primary: item.isPrimary,
  }));
}

function buildNotes(items: PersistedFoodItem[]): string {
  return items
    .map((item, index) => {
      const parts = [
        item.food_brand ? `Produto ${index + 1}: ${item.food_brand}` : `Produto ${index + 1}`,
        item.barcode ? `EAN/GTIN: ${item.barcode}` : '',
        item.category ? `Categoria: ${item.category}` : '',
      ].filter(Boolean);
      return parts.join('\n');
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 1000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FoodControlTab({ petId, petName: _petName, countryCode, species, onSaved, onStateChange }: FoodControlTabProps) {
  const storageKey = `petmol_food_control_${petId}`;

  const [items, setItems] = useState<SimpleFoodData[]>([createEmptyFoodItem(true)]);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('Dados salvos com sucesso.');
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasExisting, setHasExisting] = useState(false);
  const [reminderDays, setReminderDays] = useState('3');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [recurringProducts, setRecurringProducts] = useState<Array<{ name: string; count: number; lastUsed: string }>>([]);
  const [loadedExisting, setLoadedExisting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);
  const [restockFeedback, setRestockFeedback] = useState<string | null>(null);
  const [apiEstimate, setApiEstimate] = useState<{ estimated_end_date: string | null; estimated_days_left: number | null } | null>(null);

  const applyScannedProduct = (itemId: string, product: ScannedProduct) => {
    setItems((current) => ensurePrimaryItem(current.map((item) => (
      item.id === itemId
        ? {
            ...item,
            brand: [product.brand, product.name].filter(Boolean).join(' ').trim() || item.brand,
            packageSizeKg: product.weight?.toLowerCase().includes('kg')
              ? product.weight.replace(/kg/i, '').replace(',', '.').trim()
              : item.packageSizeKg,
            barcode: product.barcode,
            category: product.category,
          }
        : item
    ))));
    if (!product.found) setApiError('Não encontramos os dados. Preencha manualmente.');
  };

  const updateItem = (itemId: string, updater: (item: SimpleFoodData) => SimpleFoodData) => {
    setItems((current) => ensurePrimaryItem(current.map((item) => (item.id === itemId ? updater(item) : item))));
  };

  const addFoodItem = () => {
    setItems((current) => [...ensurePrimaryItem(current), createEmptyFoodItem(false)]);
  };

  const removeFoodItem = (itemId: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== itemId);
      return ensurePrimaryItem(next);
    });
  };

  const setPrimaryItem = (itemId: string) => {
    setItems((current) => current.map((item) => ({ ...item, isPrimary: item.id === itemId })));
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
            const loadedItems = normalizeLoadedItems(plan);
            setReminderDays(String(plan.manual_reminder_days_before ?? 3));
            setReminderTime(plan.reminder_time ?? '09:00');
            setItems(loadedItems);
            // Capture API-calculated estimate — no local recalculation
            setApiEstimate({
              estimated_end_date: json.estimate?.estimated_end_date ?? null,
              estimated_days_left: json.estimate?.estimated_days_left ?? null,
            });
            setHasExisting(loadedItems.some(hasUsefulFoodItem));
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
          const loadedItems = normalizeLoadedItems(cached);
          setReminderDays(String(cached.manual_reminder_days_before ?? cached.reminderDays ?? 3));
          setReminderTime(cached.reminder_time ?? cached.reminderTime ?? '09:00');
          setItems(loadedItems);
          if (cached.estimated_end_date) {
            setApiEstimate({ estimated_end_date: cached.estimated_end_date, estimated_days_left: null });
          }
          setHasExisting(loadedItems.some(hasUsefulFoodItem));
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
      const primary = getPrimaryItem(items);
      applyScannedProduct(primary.id, payload.product);
      sessionStorage.removeItem('petmol_pending_scanned_product');
    } catch { /* silent */ }
  }, [items, loadedExisting, petId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`petmol_product_usage_${petId}`);
      if (raw) setRecurringProducts(JSON.parse(raw));
    } catch { /* silent */ }
  }, [petId]);

  // ─── Derived values ───────────────────────────────────────────────────────

  const normalizedItems = ensurePrimaryItem(items);
  const primaryItem = getPrimaryItem(normalizedItems);
  const primaryMetrics = getItemMetrics(primaryItem);
  const pkgKg = primaryMetrics.packageSizeKg;
  const dailyConsumptionG = primaryMetrics.dailyConsumptionG;
  const days = primaryMetrics.days;
  // Local estimates — used only for form preview (pre-save) and progress bar denominator
  const localEndDate = primaryMetrics.localEndDate;
  const localDaysLeft = primaryMetrics.localDaysLeft;
  // Display values: backend is authoritative; local is fallback before first save
  const displayDaysLeft = apiEstimate?.estimated_days_left ?? localDaysLeft;
  const displayEndDate = apiEstimate?.estimated_end_date ?? localEndDate;
  const commerceSnapshot = resolveFoodCommerceSnapshot({
    brand: primaryItem.brand,
    packageSizeKg: primaryItem.packageSizeKg,
    daysLeft: displayDaysLeft,
    estimatedEndDate: displayEndDate ? fmtDate(displayEndDate) : null,
  });
  const foodHandoffUrl = commerceSnapshot
    ? `/api/handoff/shopping?query=${encodeURIComponent(commerceSnapshot.searchQuery)}&fallback=${encodeURIComponent(googleShoppingUrl(commerceSnapshot.searchQuery))}`
    : null;

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSavedOk(false);
    setSaveFeedback(hasExisting ? 'Alteracoes salvas com sucesso.' : 'Controle de alimentacao salvo com sucesso.');
    setApiError(null);

    const requestItems = buildItemsPayload(normalizedItems);
    const primaryRequestItem = requestItems.find((item) => item.is_primary) ?? requestItems[0];
    const dailyG = primaryRequestItem?.daily_amount_g ?? null;
    const localPayload = {
      food_brand: primaryRequestItem?.food_brand ?? '',
      brand: primaryRequestItem?.food_brand ?? '',
      package_size_kg: primaryRequestItem?.package_size_kg ?? null,
      daily_amount_g: dailyG,
      last_refill_date: primaryRequestItem?.last_refill_date ?? null,
      manual_reminder_days_before: parseInt(reminderDays, 10) || 3,
      reminder_time: reminderTime || '09:00',
      barcode: primaryRequestItem?.barcode ?? null,
      category: primaryRequestItem?.category ?? null,
      items: requestItems,
    };

    // ── 1. Salvar no localStorage PRIMEIRO (otimista) ─────────────────────
    try {
      const existing = (() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; } })();
      localStorage.setItem(storageKey, JSON.stringify({
        ...existing,
        ...localPayload,
        manual_reminder_days_before: parseInt(reminderDays, 10) || 3,
        reminder_time: reminderTime || '09:00',
      }));
    } catch { /* silent */ }

    // ── 2. Fechar form e mostrar feedback imediatamente ─────────────────
    if (!hasExisting) {
      trackV1Metric('food_cycle_created', {
        pet_id: petId,
        brand: primaryRequestItem?.food_brand ?? null,
        package_size_kg: primaryRequestItem?.package_size_kg ?? null,
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
          food_brand: primaryRequestItem?.food_brand ?? '',
          package_size_kg: primaryRequestItem?.package_size_kg ?? null,
          daily_amount_g: dailyG,
          last_refill_date: primaryRequestItem?.last_refill_date ?? null,
          safety_buffer_days: 3,
          mode: 'kibble',
          enabled: true,
          notes: buildNotes(requestItems),
          no_consumption_control: false,
          next_purchase_date: null,
          manual_reminder_days_before: parseInt(reminderDays, 10) || 3,
          reminder_time: reminderTime || '09:00',
          items: requestItems,
        }),
      });

      if (res.ok) {
        // Atualizar produto no histórico de uso
        try {
          const usageKey = `petmol_product_usage_${petId}`;
          const current = JSON.parse(localStorage.getItem(usageKey) || '[]') as Array<{ name: string; count: number; lastUsed: string }>;
          for (const item of requestItems) {
            const name = item.food_brand?.trim();
            if (!name) continue;
            const found = current.find(entry => entry.name.toLowerCase() === name.toLowerCase());
            if (found) {
              found.count += 1;
              found.lastUsed = localTodayISO();
            } else {
              current.push({ name, count: 1, lastUsed: localTodayISO() });
            }
          }
          current.sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed));
          localStorage.setItem(usageKey, JSON.stringify(current));
          setRecurringProducts(current);
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
      setItems([createEmptyFoodItem(true)]);
      setReminderDays('3');
      setReminderTime('09:00');
      setHasExisting(false);
      setSavedOk(false);
      setApiEstimate(null);
      if (!res.ok && res.status !== 404) {
        setApiError('Registro removido localmente. Tente sincronizar depois.');
      } else {
        setDeleteFeedback('Registro removido com sucesso.');
      }
      onSaved?.();
    } catch {
      localStorage.removeItem(storageKey);
      setItems([createEmptyFoodItem(true)]);
      setReminderDays('3');
      setReminderTime('09:00');
      setHasExisting(false);
      setApiEstimate(null);
      setApiError('Sem conexão. Registro removido localmente.');
    } finally {
      setSaving(false);
    }
  };

  const handleRegisterNextFeeding = async () => {
    const today = localTodayISO();
    const nextItems = ensurePrimaryItem(normalizedItems.map((item) => (
      item.isPrimary ? { ...item, startDate: today } : item
    )));
    const nextPrimaryItem = getPrimaryItem(nextItems);
    const nextRequestItems = buildItemsPayload(nextItems);
    const nextPrimaryRequestItem = nextRequestItems.find((item) => item.is_primary) ?? nextRequestItems[0];

    setSaving(true);
    setApiError(null);
    setDeleteFeedback(null);
    setRestockFeedback(null);
    setItems(nextItems);
    setApiEstimate(null);

    try {
      const existing = (() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; } })();
      localStorage.setItem(storageKey, JSON.stringify({
        ...existing,
        food_brand: nextPrimaryRequestItem?.food_brand ?? '',
        brand: nextPrimaryRequestItem?.food_brand ?? '',
        package_size_kg: nextPrimaryRequestItem?.package_size_kg ?? null,
        daily_amount_g: nextPrimaryRequestItem?.daily_amount_g ?? null,
        last_refill_date: today,
        manual_reminder_days_before: parseInt(reminderDays, 10) || 3,
        reminder_time: reminderTime || '09:00',
        barcode: nextPrimaryRequestItem?.barcode ?? null,
        category: nextPrimaryRequestItem?.category ?? null,
        items: nextRequestItems,
      }));
    } catch { /* silent */ }

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/api/health/pets/${petId}/feeding/plan/restock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ refill_date: today }),
      });

      if (res.ok) {
        const json = await res.json();
        setApiEstimate({
          estimated_end_date: json.estimated_end_date ?? null,
          estimated_days_left: json.estimated_days_left ?? null,
        });
        setRestockFeedback(`Novo ciclo registrado para ${nextPrimaryItem.brand || 'o produto principal'}.`);
      } else {
        setRestockFeedback('Novo ciclo registrado localmente. Tente sincronizar depois.');
      }
      onSaved?.();
    } catch {
      setRestockFeedback('Novo ciclo registrado localmente. Tente sincronizar depois.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const showForm = !hasExisting || formOpen;

  useEffect(() => {
    onStateChange?.({
      showForm,
      commerceStatus: commerceSnapshot?.status ?? null,
      foodBrand: primaryItem.brand.trim(),
    });
  }, [commerceSnapshot?.status, onStateChange, primaryItem.brand, showForm]);

  return (
    <div className="p-3 space-y-3 pb-6 sm:p-4 sm:pb-8">

      {/* ── VIEW MODE ─────────────────────────────────────────────────────── */}
      {!showForm && (
        <div className="space-y-3">

          {/* Feedback de salvamento — no topo para garantir visibilidade */}
          {savedOk && (
            <div className="bg-green-500 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-sm">
              <span className="text-white text-lg">✅</span>
              <span className="text-white text-sm font-bold">{saveFeedback}</span>
            </div>
          )}
          {deleteFeedback && (
            <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span>ℹ️</span><span className="text-sm text-slate-700">{deleteFeedback}</span>
            </div>
          )}
          {restockFeedback && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span>🥣</span><span className="text-sm text-amber-900">{restockFeedback}</span>
            </div>
          )}

          {/* Status card */}
          <div className="space-y-2">
            {orderPrimaryFirst(normalizedItems).map((item, index) => {
              const itemMetrics = getItemMetrics(item);
              const isTracked = item.isPrimary;
              const currentDaysLeft = isTracked ? displayDaysLeft : itemMetrics.localDaysLeft;
              const currentEndDate = isTracked ? displayEndDate : itemMetrics.localEndDate;
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-3 space-y-2 ${
                    isTracked && currentDaysLeft !== null && currentDaysLeft < 0 ? 'bg-red-50 border-red-200' :
                    isTracked && currentDaysLeft !== null && currentDaysLeft <= 5 ? 'bg-orange-50 border-orange-200' :
                    isTracked ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 text-lg flex-shrink-0">🥣</span>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-sm leading-tight">{item.brand || `Produto ${index + 1}`}</p>
                        <p className="text-[11px] text-gray-500">
                          {isTracked ? 'Produto principal monitorado' : 'Produto adicional'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        isTracked ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {isTracked ? 'Principal' : 'Adicional'}
                      </span>
                      {isTracked && currentDaysLeft !== null && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                          currentDaysLeft < 0 ? 'bg-red-100 text-red-700' :
                          currentDaysLeft <= 5 ? 'bg-orange-100 text-orange-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {currentDaysLeft < 0 ? 'Acabou' : currentDaysLeft === 0 ? 'Hoje' : `${currentDaysLeft}d restantes`}
                        </span>
                      )}
                    </div>
                  </div>
                  {isTracked && itemMetrics.days != null && currentDaysLeft !== null && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          currentDaysLeft < 0 ? 'bg-red-400' :
                          currentDaysLeft <= 5 ? 'bg-orange-400' :
                          'bg-green-400'
                        }`}
                        style={{ width: `${Math.max(4, Math.min(100, Math.round(((itemMetrics.days - Math.max(currentDaysLeft, 0)) / itemMetrics.days) * 100)))}%` }}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-0.5">
                    {item.packageSizeKg && <span>📦 {item.packageSizeKg} kg</span>}
                    {item.startDate && <span>📅 Início: {fmtDate(item.startDate)}</span>}
                    {currentEndDate && isTracked && (
                      <span>⏳ Prev. término: {fmtDate(currentEndDate)}</span>
                    )}
                    {!isTracked && item.category && <span>🏷️ {item.category}</span>}
                  </div>
                </div>
              );
            })}
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
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleRegisterNextFeeding}
              disabled={saving}
              className="min-h-[56px] rounded-2xl border border-emerald-200 bg-emerald-50 px-2 py-2.5 text-[11px] font-semibold leading-tight text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              📦 Adicionar alimento
            </button>
            <button
              onClick={() => setFormOpen(true)}
              className="min-h-[56px] rounded-2xl border border-amber-200 bg-amber-50 px-2 py-2.5 text-[11px] font-semibold leading-tight text-amber-800 hover:bg-amber-100 active:opacity-70"
            >
              ✏️ Editar alimentação
            </button>
            <button
              onClick={handleDelete}
              disabled={saving}
              className="min-h-[56px] rounded-2xl border border-red-200 bg-red-50 px-2 py-2.5 text-[11px] font-semibold leading-tight text-red-700 hover:bg-red-100 disabled:opacity-50"
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

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 space-y-3 sm:p-4">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              Você pode cadastrar vários produtos ao mesmo tempo. O item marcado como principal controla a previsão e os lembretes.
            </div>

            {orderPrimaryFirst(normalizedItems).map((item, index) => {
              const itemMetrics = getItemMetrics(item);
              return (
                <div key={item.id} className="rounded-2xl border border-slate-200 p-3 space-y-2.5 bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{item.brand || `Produto ${index + 1}`}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.isPrimary ? 'Produto principal monitorado' : 'Produto adicional'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {!item.isPrimary && (
                        <button
                          type="button"
                          onClick={() => setPrimaryItem(item.id)}
                          className="min-h-[36px] px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-amber-200 text-amber-800 hover:bg-amber-50"
                        >
                          Usar no monitoramento
                        </button>
                      )}
                      {normalizedItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFoodItem(item.id)}
                          className="min-h-[36px] px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>

                  <ProductBarcodeScanner
                    label="📷 Fotografar ou escolher foto"
                    expectedCategory="food"
                    petId={petId}
                    defaultMode="photo"
                    allowScanning={false}
                    onProductConfirmed={(product) => applyScannedProduct(item.id, product)}
                  />

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Marca / Produto</label>
                    <input
                      type="text"
                      value={item.brand}
                      onChange={e => updateItem(item.id, (current) => ({ ...current, brand: e.target.value }))}
                      placeholder="Ex: Royal Canin, Guabi Natural, petisco..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Pacote (kg)</label>
                      <input
                        type="number"
                        min={0.1}
                        step={0.5}
                        value={item.packageSizeKg}
                        onChange={e => updateItem(item.id, (current) => ({ ...current, packageSizeKg: e.target.value }))}
                        placeholder="Ex: 15"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Duração (dias)</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={item.durationDays}
                        onChange={e => updateItem(item.id, (current) => ({ ...current, durationDays: e.target.value }))}
                        placeholder="Ex: 30"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
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
                        value={item.dailyConsumptionG}
                        onChange={e => updateItem(item.id, (current) => ({ ...current, dailyConsumptionG: e.target.value }))}
                        placeholder="Ex: 300"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Data início</label>
                      <input
                        type="date"
                        value={item.startDate}
                        onChange={e => updateItem(item.id, (current) => ({ ...current, startDate: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                      />
                    </div>
                  </div>

                  {item.isPrimary && pkgKg && dailyConsumptionG && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <span>📦</span>
                      <span className="text-xs font-semibold text-amber-800">
                        Duração estimada: ~{Math.round((pkgKg * 1000) / dailyConsumptionG)} dias (após salvar, data exata calculada pelo servidor)
                      </span>
                    </div>
                  )}

                  {!item.isPrimary && itemMetrics.days != null && (
                    <div className="text-[11px] text-slate-500">
                      Previsão local deste item: cerca de {itemMetrics.days} dias.
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addFoodItem}
              className="w-full min-h-[52px] rounded-2xl text-sm font-semibold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200"
            >
              + Adicionar outro produto
            </button>
          </div>

          <ReminderPicker
            days={reminderDays}
            time={reminderTime}
            onDaysChange={setReminderDays}
            onTimeChange={setReminderTime}
          />

          {apiError && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800 flex items-start gap-2">
              <span>⚠️</span><span>{apiError}</span>
            </div>
          )}
          {savedOk && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 flex items-center gap-2">
              <span>✅</span><span>{saveFeedback}</span>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-[15px] font-bold shadow-md disabled:opacity-50 active:scale-[0.99] transition-all"
          >
            {saving ? 'Salvando...' : hasExisting ? '✅ Atualizar alimentação' : '✅ Confirmar alimentação'}
          </button>
        </div>
      )}
    </div>
  );
}
