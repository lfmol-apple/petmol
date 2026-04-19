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
}

export function FoodItemSheet({ pet, onClose, onSaved }: FoodItemSheetProps) {
  const [mode, setMode] = useState<'view' | 'buy'>('view');
  const [snoozeFeedback, setSnoozeFeedback] = useState<string | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [foodBrand, setFoodBrand] = useState<string>('');
  const [foodState, setFoodState] = useState<FoodControlTabState>({
    showForm: false,
    commerceStatus: null,
    foodBrand: '',
  });
  const overlayRef = useRef<HTMLDivElement>(null);
  const shouldShowCommerceActions = !foodState.showForm && foodState.commerceStatus !== null && foodState.commerceStatus !== 'steady';

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

  // Load food brand for contextual buy mode
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
  }, [pet.pet_id]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 flex flex-col overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-1 border-b border-gray-100 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-700">
              <path d="M3 13h18"/><path d="M5 13a7 7 0 0014 0"/><path d="M8 7V5M12 7V4M16 7V5"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-gray-900 leading-tight">Alimentação</h2>
            <p className="text-[12px] text-gray-500 leading-tight truncate">{pet.pet_name}</p>
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
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {mode === 'view' ? (
            <>
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

              {/* Action buttons */}
              {shouldShowCommerceActions && (
                <div className="px-4 pb-8 -mt-4 flex flex-col gap-2">
                  <button
                    onClick={() => setMode('buy')}
                    className="w-full flex items-center justify-between p-4 bg-blue-300 border border-blue-400/30 rounded-2xl hover:bg-blue-400/40 transition-all active:scale-[0.98] shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                        🛒
                      </div>
                      <div className="text-left">
                        <p className="text-[14px] font-bold text-blue-900">Preciso comprar</p>
                        <p className="text-[12px] text-blue-700/70">Ver onde encontrar ração</p>
                      </div>
                    </div>
                    <span className="text-blue-400 text-lg font-bold">›</span>
                  </button>

                  {!snoozeOpen ? (
                    <button
                      onClick={() => setSnoozeOpen(true)}
                      disabled={snoozing}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-2xl hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-sm">
                          ⏸️
                        </div>
                        <div className="text-left">
                          <p className="text-[14px] font-bold text-gray-700">Adiar lembrete</p>
                          <p className="text-[12px] text-gray-500">Escolher por quantos dias</p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-lg font-bold">›</span>
                    </button>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
                      <p className="text-[13px] font-semibold text-gray-600 mb-1">Adiar por quantos dias?</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[1, 3, 5, 7].map((days) => (
                          <button
                            key={days}
                            onClick={() => { setSnoozeOpen(false); handleSnooze(days); }}
                            disabled={snoozing}
                            className="py-2 rounded-xl bg-white border border-gray-200 text-[13px] font-bold text-gray-700 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-50"
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
              <h3 className="text-[16px] font-bold text-gray-900">Onde comprar</h3>
              <p className="text-sm text-gray-500">
                Escolha onde encontrar ração{foodBrand ? ` (${foodBrand})` : ''}:
              </p>

              <div className="space-y-3">
                {HOME_SHOPPING_PARTNERS.filter(
                  (p) => p.id === 'petz' || p.id === 'cobasi' || p.id === 'petlove',
                ).map((partner) => {
                  const url = buildFoodHandoffUrl(
                    foodBrand || '',
                    pet.pet_id,
                    partner.id as HomeShoppingPartnerId,
                  );
                  return (
                    <button
                      key={partner.id}
                      onClick={() => {
                        trackPartnerClicked({
                          source: 'food_sheet',
                          partner: partner.id,
                          pet_id: pet.pet_id,
                          control_type: 'food',
                        });
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                      className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all text-left"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={partner.logoSrc}
                        alt={partner.logoAlt}
                        className="w-10 h-10 rounded-xl object-contain bg-gray-50 p-1 flex-shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 text-sm">{partner.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{partner.description}</p>
                      </div>
                      <span className="text-gray-400 text-lg">›</span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setMode('view')}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200"
              >
                Voltar para controle
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
