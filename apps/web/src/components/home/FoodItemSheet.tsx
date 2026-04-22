'use client';

import { useEffect, useRef, useState } from 'react';
import { FoodControlTab, type FoodControlTabState } from '@/components/FoodControlTab';
import type { PetHealthProfile } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';
import { trackPartnerClicked } from '@/lib/v1Metrics';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import {
  HOME_SHOPPING_PARTNERS,
  buildFoodHandoffUrl,
  type HomeShoppingPartnerId,
} from '@/features/commerce/homeShoppingPartners';

export interface FoodItemSheetProps {
  pet: PetHealthProfile;
  onClose: () => void;
  onSaved?: () => void;
  initialMode?: 'view' | 'buy';
}

type PreferredStore = 'petz' | 'petlove' | 'cobasi';

interface PendingPurchase {
  petId: string;
  partner: PreferredStore;
  timestamp: number;
  brand: string;
}

const PREFERRED_STORE_KEY = 'petmol_preferred_store';

const STORE_PARTNERS: PreferredStore[] = ['petz', 'petlove', 'cobasi'];

export function FoodItemSheet({ pet, onClose, onSaved, initialMode }: FoodItemSheetProps) {
  const [mode, setMode] = useState<'view' | 'buy'>(initialMode ?? 'view');
  const [snoozeFeedback, setSnoozeFeedback] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [restockFeedback, setRestockFeedback] = useState<string | null>(null);
  const [foodBrand, setFoodBrand] = useState<string>('');
  const [foodState, setFoodState] = useState<FoodControlTabState>({
    showForm: false,
    commerceStatus: null,
    foodBrand: '',
    daysLeft: null,
    restockDate: null,
  });
  const [preferredStore, setPreferredStore] = useState<PreferredStore | null>(null);
  const [pendingPurchase, setPendingPurchase] = useState<PendingPurchase | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const hasFood = !foodState.showForm && foodState.commerceStatus !== null;
  const shouldShowCommerceActions = hasFood;

  const handleRestock = async () => {
    setRestocking(true);
    setRestockFeedback(null);
    try {
      const token = getToken();
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await fetch(
        `${API_BASE_URL}/api/health/pets/${pet.pet_id}/feeding/plan/restock`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ refill_date: today }),
        },
      );
      if (res.ok) {
        try {
          const key = `petmol_food_control_${pet.pet_id}`;
          const raw = localStorage.getItem(key);
          const data = raw ? JSON.parse(raw) : {};
          data.last_purchase_date = today;
          localStorage.setItem(key, JSON.stringify(data));
        } catch { /* silent */ }
        setRestockFeedback('✅ Compra registrada! Novo ciclo iniciado.');
        setTimeout(() => { onSaved?.(); onClose(); }, 1500);
      } else {
        setRestockFeedback('Não foi possível registrar. Tente novamente.');
      }
    } catch {
      setRestockFeedback('Sem conexão. Tente novamente.');
    } finally {
      setRestocking(false);
    }
  };

  const handleSnooze = async (days: number) => {
    setSnoozing(true);
    setSnoozeFeedback(null);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_BASE_URL}/api/health/pets/${pet.pet_id}/feeding/plan/snooze`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ snooze_days: days }),
        },
      );
      if (res.ok) {
        setSnoozeFeedback(`Lembrete adiado. Você receberá um novo aviso em ${days} dia${days > 1 ? 's' : ''}.`);
      } else {
        setSnoozeFeedback('Não foi possível adiar. Tente novamente.');
      }
    } catch {
      setSnoozeFeedback('Sem conexão. Tente novamente.');
    } finally {
      setSnoozing(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Load food brand + preferred store; detect pending purchase
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`petmol_food_control_${pet.pet_id}`);
      if (raw) {
        const cached = JSON.parse(raw);
        const primaryItem = Array.isArray(cached.items)
          ? cached.items.find((item: { is_primary?: boolean }) => item?.is_primary) ?? cached.items[0]
          : null;
        const brand = cached.food_brand ?? cached.brand ?? primaryItem?.food_brand ?? '';
        if (brand) setFoodBrand(brand);
      }
    } catch { /* silent */ }

    try {
      const stored = localStorage.getItem(PREFERRED_STORE_KEY) as PreferredStore | null;
      if (stored && STORE_PARTNERS.includes(stored)) setPreferredStore(stored);
    } catch { /* silent */ }

    try {
      const pendingRaw = localStorage.getItem(`petmol_pending_purchase_${pet.pet_id}`);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as PendingPurchase;
        const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
        if (Date.now() - pending.timestamp < TWENTY_FOUR_H) {
          setPendingPurchase(pending);
        } else {
          localStorage.removeItem(`petmol_pending_purchase_${pet.pet_id}`);
        }
      }
    } catch { /* silent */ }
  }, [pet.pet_id]);

  const handlePartnerClick = (partnerId: PreferredStore) => {
    try { localStorage.setItem(PREFERRED_STORE_KEY, partnerId); } catch { /* silent */ }
    try {
      localStorage.setItem(
        `petmol_pending_purchase_${pet.pet_id}`,
        JSON.stringify({ petId: pet.pet_id, partner: partnerId, timestamp: Date.now(), brand: foodBrand }),
      );
    } catch { /* silent */ }
    setPreferredStore(partnerId);
    trackPartnerClicked({ source: 'food_sheet', partner: partnerId, pet_id: pet.pet_id, control_type: 'food' });
    const url = buildFoodHandoffUrl(foodBrand || '', pet.pet_id, partnerId as HomeShoppingPartnerId);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <ModalPortal>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden overscroll-x-none touch-pan-y p-3 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md min-h-0 bg-white/95 backdrop-blur-xl rounded-[28px] shadow-premium border border-white/60 flex max-h-[92dvh] flex-col overflow-x-hidden overflow-y-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-700">
              <path d="M3 13h18"/><path d="M5 13a7 7 0 0014 0"/><path d="M8 7V5M12 7V4M16 7V5"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 leading-tight">Alimentação</h2>
            <p className="mt-1">
              <span className="inline-flex max-w-full items-center rounded-full border border-amber-100 bg-white px-2.5 py-1 text-xs font-black leading-tight tracking-[0.04em] text-amber-800 shadow-sm whitespace-normal break-all">
                Pet: {pet.pet_name}
              </span>
            </p>
          </div>
          <button
            onClick={mode === 'buy' ? () => setMode('view') : onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              {mode === 'buy' ? <path d="M15 18l-6-6 6-6"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
            </svg>
          </button>
        </div>

        {/* Content — FoodControlTab scrolls inside */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ scrollPaddingBottom: '320px' }}>
          {mode === 'view' ? (
            <>
              {/* ── Fallback: dado insuficiente para estimar consumo ─────────── */}
              {hasFood && foodState.daysLeft === null && foodState.restockDate === null && (
                <div className="mx-3 mt-3 mb-1 rounded-2xl px-4 py-3 flex items-center gap-3 bg-gray-50 border border-gray-200">
                  <span className="text-xl flex-shrink-0 opacity-50">📦</span>
                  <p className="text-xs text-gray-500 leading-snug">Adicione o tamanho da embalagem para ver o consumo estimado</p>
                </div>
              )}

              {/* ── Consumption estimate banner ─────────────────────────────── */}
              {hasFood && (foodState.daysLeft !== null || foodState.restockDate !== null) && (
                <div className={`mx-3 mt-3 mb-1 rounded-2xl px-4 py-3 flex items-center gap-3 ${
                  foodState.daysLeft !== null && foodState.daysLeft <= 5
                    ? 'bg-red-50 border border-red-200'
                    : foodState.daysLeft !== null && foodState.daysLeft <= 12
                      ? 'bg-orange-50 border border-orange-200'
                      : 'bg-amber-50 border border-amber-100'
                }`}>
                  <span className="text-2xl flex-shrink-0">⏱</span>
                  <div className="min-w-0 flex-1">
                    {foodState.daysLeft !== null && (
                      <p className={`text-base font-bold leading-tight ${
                        foodState.daysLeft <= 5 ? 'text-red-800' :
                        foodState.daysLeft <= 12 ? 'text-orange-800' : 'text-amber-900'
                      }`}>
                        {foodState.daysLeft <= 0
                          ? 'Ração acabou — hora de comprar!'
                          : `Acaba em ~${foodState.daysLeft} dia${foodState.daysLeft === 1 ? '' : 's'}`}
                      </p>
                    )}
                    {foodState.restockDate && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Próxima compra: {(() => {
                          const [, m, d] = foodState.restockDate.split('-').map(Number);
                          const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
                          return `${d} ${months[m - 1]}`;
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <FoodControlTab
                petId={pet.pet_id}
                petName={pet.pet_name}
                species={(pet.species as 'dog' | 'cat') || 'dog'}
                onStateChange={(state) => {
                  setFoodState(state);
                  setFoodBrand(state.foodBrand);
                  if (state.showForm) setMode('view');
                }}
                onSaved={() => {
                  onSaved?.();
                  // Não fechar o modal — o usuário precisa ver o banner de confirmação
                }}
              />

              {/* Snooze feedback */}
              {snoozeFeedback && (
                <div className="mx-4 mb-2 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-center gap-2">
                  <span>⏰</span><span>{snoozeFeedback}</span>
                </div>
              )}

              {/* Pending purchase banner — shown when user returned from a store in the last 24h */}
              {pendingPurchase && (
                <div className="mx-4 mb-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
                  <p className="text-sm font-bold text-amber-900">
                    Você comprou a ração de {pet.pet_name}?
                  </p>
                  <p className="text-xs text-amber-700 leading-snug">
                    Da última vez você foi para a {HOME_SHOPPING_PARTNERS.find(p => p.id === pendingPurchase.partner)?.name ?? pendingPurchase.partner}. Chegou a comprar?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setPendingPurchase(null);
                        try { localStorage.removeItem(`petmol_pending_purchase_${pet.pet_id}`); } catch { /* silent */ }
                        handleRestock();
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold active:scale-95 transition-transform"
                    >
                      Sim, comprei ✅
                    </button>
                    <button
                      onClick={() => {
                        setPendingPurchase(null);
                        try { localStorage.removeItem(`petmol_pending_purchase_${pet.pet_id}`); } catch { /* silent */ }
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-white border border-amber-300 text-sm font-semibold text-amber-800 active:scale-95 transition-transform"
                    >
                      Ainda não
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {shouldShowCommerceActions && (
                <div className="px-4 pb-6 -mt-2 flex flex-col gap-2">
                  {/* Restock feedback */}
                  {restockFeedback && (
                    <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-xs text-green-800 flex items-center gap-2">
                      <span className="flex-shrink-0">🔄</span><span>{restockFeedback}</span>
                    </div>
                  )}

                  {/* Comprei — primary loop-closer */}
                  <button
                    onClick={handleRestock}
                    disabled={restocking}
                    className="w-full flex items-center justify-between rounded-2xl border border-green-300 bg-green-50 px-4 py-3 hover:bg-green-100 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                        ✅
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-green-900">Comprei</p>
                        <p className="text-xs text-green-700/70">Anotar que a ração chegou</p>
                      </div>
                    </div>
                    {restocking
                      ? <div className="h-5 w-5 rounded-full border-2 border-green-500 border-t-transparent animate-spin flex-shrink-0" />
                      : <span className="text-green-500 text-lg font-bold">›</span>
                    }
                  </button>

                  <button
                    onClick={() => setMode('buy')}
                    className="w-full flex items-center justify-between rounded-2xl border border-blue-400/30 bg-blue-300 px-4 py-3 hover:bg-blue-400/40 transition-all active:scale-[0.98] shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                        🛒
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-blue-900">Comprar agora →</p>
                        <p className="text-xs text-blue-700/70">Ir direto para a loja</p>
                      </div>
                    </div>
                    <span className="text-blue-400 text-lg font-bold">›</span>
                  </button>

                  {!snoozeOpen ? (
                    <button
                      onClick={() => setSnoozeOpen(true)}
                      disabled={snoozing}
                      className="w-full flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                          ⏸️
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-gray-700">Adiar lembrete</p>
                          <p className="text-xs text-gray-500">Escolher por quantos dias</p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-lg font-bold">›</span>
                    </button>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
                      <p className="text-base font-semibold text-gray-600 mb-1">Adiar por quantos dias?</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 3, 5, 7].map((days) => (
                          <button
                            key={days}
                            onClick={() => { setSnoozeOpen(false); handleSnooze(days); }}
                            disabled={snoozing}
                            className="min-h-[44px] py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
                          >
                            {days}d
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setSnoozeOpen(false)}
                        className="w-full text-center text-xs text-gray-400 pt-1 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ── BUY MODE ─────────────────────────────────────────────────── */
            <div className="p-5 pb-8 space-y-4">
              <div>
                <p className="text-base font-bold text-gray-900">
                  {foodBrand ? `Comprar ${foodBrand}` : `Comprar ração para ${pet.pet_name}`}
                </p>
                {foodBrand && (
                  <p className="text-xs text-gray-400 mt-0.5">Ração para {pet.pet_name}</p>
                )}
              </div>

              {preferredStore ? (
                /* Has preference — 1 dominant button */
                <>
                  {(() => {
                    const partner = HOME_SHOPPING_PARTNERS.find(p => p.id === preferredStore);
                    if (!partner) return null;
                    return (
                      <button
                        onClick={() => handlePartnerClick(preferredStore)}
                        className="w-full flex items-center gap-4 p-5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg active:scale-[0.98] transition-all text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={partner.logoSrc}
                          alt={partner.logoAlt}
                          className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-sm"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-base leading-tight">Comprar na {partner.name} →</p>
                        </div>
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => setPreferredStore(null)}
                    className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
                  >
                    compro em outro lugar ›
                  </button>
                </>
              ) : (
                /* No preference — Petz as default + Cobasi/Petlove as text links */
                <>
                  {(() => {
                    const petz = HOME_SHOPPING_PARTNERS.find(p => p.id === 'petz');
                    if (!petz) return null;
                    return (
                      <button
                        onClick={() => handlePartnerClick('petz')}
                        className="w-full flex items-center gap-4 p-5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg active:scale-[0.98] transition-all text-left"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={petz.logoSrc}
                          alt={petz.logoAlt}
                          className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-sm"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-white text-base leading-tight">Comprar na Petz →</p>
                        </div>
                      </button>
                    );
                  })()}
                  <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                    {(['cobasi', 'petlove'] as const).map((id) => {
                      const p = HOME_SHOPPING_PARTNERS.find(partner => partner.id === id);
                      if (!p) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => handlePartnerClick(id)}
                          className="text-xs text-gray-400 hover:text-gray-700 transition-colors underline underline-offset-2 decoration-gray-300"
                        >
                          {p.name}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => {
                        trackPartnerClicked({ source: 'food_sheet', partner: 'amazon', pet_id: pet.pet_id, control_type: 'food' });
                        const url = buildFoodHandoffUrl(foodBrand || '', pet.pet_id, 'amazon');
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="text-xs text-gray-400 hover:text-gray-700 transition-colors underline underline-offset-2 decoration-gray-300"
                    >
                      outro lugar
                    </button>
                  </div>
                </>
              )}

              <button
                onClick={() => setMode('view')}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200"
              >
                ← Voltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
