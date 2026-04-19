import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { FeedingPlanEntry, FeedingPlanItemEntry } from '@/lib/types/homeForms';

function normalizeFoodItems(raw: unknown): FeedingPlanItemEntry[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => ({
      ...item,
      id: typeof item.id === 'string' ? item.id : `food-item-${index + 1}`,
      label: typeof item.label === 'string' ? item.label : null,
      food_brand: typeof item.food_brand === 'string' ? item.food_brand : null,
      package_size_kg: typeof item.package_size_kg === 'number' ? item.package_size_kg : null,
      daily_amount_g: typeof item.daily_amount_g === 'number' ? item.daily_amount_g : null,
      last_refill_date: typeof item.last_refill_date === 'string' ? item.last_refill_date : null,
      mode: typeof item.mode === 'string' ? item.mode : null,
      barcode: typeof item.barcode === 'string' ? item.barcode : null,
      category: typeof item.category === 'string' ? item.category : null,
      notes: typeof item.notes === 'string' ? item.notes : null,
      is_primary: Boolean(item.is_primary),
    }));

  if (!parsed.length) return [];
  const primaryIndex = parsed.findIndex((item) => item.is_primary);
  return parsed.map((item, index) => ({ ...item, is_primary: index === (primaryIndex >= 0 ? primaryIndex : 0) }));
}

function flattenFeedingPlan(raw: Record<string, unknown>): FeedingPlanEntry {
  const items = normalizeFoodItems(raw.items);
  const primary = items.find((item) => item.is_primary) ?? items[0] ?? null;
  return {
    ...raw,
    items,
    food_brand:
      (typeof raw.food_brand === 'string' ? raw.food_brand : null) ??
      primary?.food_brand ??
      (typeof raw.brand === 'string' ? raw.brand : null),
    brand:
      (typeof raw.brand === 'string' ? raw.brand : null) ??
      primary?.food_brand ??
      (typeof raw.food_brand === 'string' ? raw.food_brand : null),
    package_size_kg:
      (typeof raw.package_size_kg === 'number' ? raw.package_size_kg : null) ??
      primary?.package_size_kg ??
      null,
    daily_amount_g:
      (typeof raw.daily_amount_g === 'number' ? raw.daily_amount_g : null) ??
      primary?.daily_amount_g ??
      null,
    last_refill_date:
      (typeof raw.last_refill_date === 'string' ? raw.last_refill_date : null) ??
      primary?.last_refill_date ??
      null,
    next_purchase_date:
      (typeof raw.next_purchase_date === 'string' ? raw.next_purchase_date : null) ??
      (typeof raw.nextPurchaseDate === 'string' ? raw.nextPurchaseDate : null) ??
      null,
    next_reminder_date: typeof raw.next_reminder_date === 'string' ? raw.next_reminder_date : null,
    estimated_end_date: typeof raw.estimated_end_date === 'string' ? raw.estimated_end_date : null,
    manual_reminder_days_before:
      (typeof raw.manual_reminder_days_before === 'number' ? raw.manual_reminder_days_before : null) ??
      (typeof raw.manualDaysBefore === 'number' ? raw.manualDaysBefore : null) ??
      null,
  };
}

export function useFoodPlanSync({ selectedPetId }: { selectedPetId: string | null }) {
  const [feedingPlan, setFeedingPlan] = useState<Record<string, FeedingPlanEntry>>({});

  const fetchFeedingPlan = async (petId: string) => {
    const token = getToken();
    if (!token || !petId) return;

    const readLocalFoodPlan = (): FeedingPlanEntry | null => {
      try {
        const raw = localStorage.getItem(`petmol_food_control_${petId}`);
        if (!raw) return null;
        return flattenFeedingPlan(JSON.parse(raw));
      } catch {
        return null;
      }
    };

    const syncFoodPlan = (entry: FeedingPlanEntry | null) => {
      setFeedingPlan((prev) => {
        if (!entry) {
          const next = { ...prev };
          delete next[petId];
          return next;
        }
        return { ...prev, [petId]: entry };
      });
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/health/pets/${petId}/feeding/plan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const flat = flattenFeedingPlan({
          ...(data.plan ?? {}),
          next_reminder_date: data.estimate?.recommended_alert_date ?? null,
          estimated_end_date: data.estimate?.estimated_end_date ?? null,
        });
        syncFoodPlan(flat);
        try {
          const stored = localStorage.getItem(`petmol_food_control_${petId}`);
          const local = stored ? JSON.parse(stored) : {};
          const merged = {
            ...local,
            ...flat,
            next_purchase_date: flat.next_purchase_date ?? local.next_purchase_date,
            next_reminder_date: flat.next_reminder_date ?? local.next_reminder_date,
            estimated_end_date: flat.estimated_end_date ?? local.estimated_end_date,
            manual_reminder_days_before:
              (flat.manual_reminder_days_before as number | null | undefined) ??
              local.manual_reminder_days_before ??
              local.manualDaysBefore,
            food_brand: flat.food_brand ?? local.food_brand ?? local.brand,
            brand: flat.brand ?? local.brand ?? local.food_brand,
          };
          localStorage.setItem(`petmol_food_control_${petId}`, JSON.stringify(merged));
        } catch {}
        return;
      }

      const fallback = readLocalFoodPlan();
      syncFoodPlan(fallback);
    } catch (e) {
      console.error('Erro ao carregar plano alimentar:', e);
      const fallback = readLocalFoodPlan();
      syncFoodPlan(fallback);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedPetId) fetchFeedingPlan(selectedPetId);
  }, [selectedPetId]);

  return { feedingPlan, setFeedingPlan, fetchFeedingPlan };
}
