import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import type { FeedingPlanEntry } from '@/lib/types/homeForms';

export function useFoodPlanSync({ selectedPetId }: { selectedPetId: string | null }) {
  const [feedingPlan, setFeedingPlan] = useState<Record<string, FeedingPlanEntry>>({});

  const fetchFeedingPlan = async (petId: string) => {
    const token = getToken();
    if (!token || !petId) return;

    const readLocalFoodPlan = (): FeedingPlanEntry | null => {
      try {
        const raw = localStorage.getItem(`petmol_food_control_${petId}`);
        if (!raw) return null;
        const local = JSON.parse(raw);
        return {
          ...local,
          food_brand: local.food_brand ?? local.brand ?? null,
          brand: local.brand ?? local.food_brand ?? null,
          next_purchase_date: local.next_purchase_date ?? local.nextPurchaseDate ?? null,
          next_reminder_date: local.next_reminder_date ?? null,
          estimated_end_date: local.estimated_end_date ?? null,
          manual_reminder_days_before:
            local.manual_reminder_days_before ?? local.manualDaysBefore ?? null,
        };
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
        const flat = {
          ...(data.plan ?? {}),
          next_reminder_date: data.estimate?.recommended_alert_date ?? null,
          estimated_end_date: data.estimate?.estimated_end_date ?? null,
        };
        syncFoodPlan(flat);
        try {
          const stored = localStorage.getItem(`petmol_food_control_${petId}`);
          const local = stored ? JSON.parse(stored) : {};
          const merged = {
            ...local,
            next_purchase_date: flat.next_purchase_date ?? local.next_purchase_date,
            next_reminder_date: flat.next_reminder_date ?? local.next_reminder_date,
            estimated_end_date: flat.estimated_end_date ?? local.estimated_end_date,
            manual_reminder_days_before:
              flat.manual_reminder_days_before ??
              local.manual_reminder_days_before ??
              local.manualDaysBefore,
            food_brand: flat.food_brand ?? local.food_brand ?? local.brand,
            brand: flat.food_brand ?? local.food_brand ?? local.brand,
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
