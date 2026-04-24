'use client';

import { useEffect, useRef, useState } from 'react';
import { FoodControlTab, type FoodControlTabFormRequest, type FoodControlTabState } from '@/components/FoodControlTab';
import type { PetHealthProfile } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';
import { trackPartnerClicked, trackV1Metric } from '@/lib/v1Metrics';
import { API_BACKEND_BASE } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { localTodayISO } from '@/lib/localDate';
import { resolvePetPhotoUrl } from '@/lib/petPhoto';
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
  petPhotoUrl?: string | null;
}

// Sheet-level navigation (page swaps)
type SheetMode = 'view' | 'edit' | 'buy';

// Internal submodes within view — no router.push, no sheet close
type FoodSubMode = 'main' | 'adjustDuration' | 'finished' | 'channel';

type PreferredStore = 'petz' | 'petlove' | 'cobasi';
type PurchaseChannel = 'petz' | 'cobasi' | 'amazon' | 'petlove' | 'loja_fisica' | 'outro';

const PREFERRED_STORE_KEY = 'petmol_preferred_store';
const STORE_PARTNERS: PreferredStore[] = ['petz', 'petlove', 'cobasi'];

// ── utils ─────────────────────────────────────────────────────────────────────

function isoPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][m - 1]}`;
}

function endISO(daysLeft: number | null): string | null {
  return daysLeft === null ? null : isoPlus(daysLeft);
}

// ── component ─────────────────────────────────────────────────────────────────

export function FoodItemSheet({ pet, onClose, onSaved, initialMode, petPhotoUrl }: FoodItemSheetProps) {
  // Navigation
  const [mode, setMode]           = useState<SheetMode>(initialMode === 'buy' ? 'buy' : 'view');
  const [subMode, setSubMode]     = useState<FoodSubMode>('main');

  // Food data (populated by hidden FoodControlTab)
  const [foodBrand, setFoodBrand] = useState('');
  const [foodState, setFoodState] = useState<FoodControlTabState>({
    showForm: false, commerceStatus: null, foodBrand: '',
    daysLeft: null, restockDate: null, packageSizeKg: null,
    dailyConsumptionG: null, startDate: null,
  });

  // Partner / commerce
  const [preferredStore, setPreferredStore] = useState<PreferredStore | null>(null);
  const [formRequest, setFormRequest]       = useState<FoodControlTabFormRequest | null>(null);

  // Date pickers (shared across submodes — only one active at a time)
  const [customDate, setCustomDate]           = useState(localTodayISO);
  const [showDatePicker, setShowDatePicker]   = useState(false);

  // UI state
  const [busy, setBusy]                           = useState(false);
  const [feedback, setFeedback]                   = useState<{ msg: string; tone: 'green' | 'blue' | 'red' } | null>(null);
  const [showDetails, setShowDetails]             = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed]     = useState(false);
  const [successMessage, setSuccessMessage]       = useState<string | null>(null);
  const [foodStateRefreshKey, setFoodStateRefreshKey] = useState(0);
  const successMessageTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const photoSource = petPhotoUrl
    ?? (pet as { photo_url?: string | null; photo?: string | null }).photo_url
    ?? pet.photo;
  const petPhotoSrc = resolvePetPhotoUrl(photoSource);

  const hasFood  = foodState.commerceStatus !== null;
  const estEnd   = endISO(foodState.daysLeft);

  const clearSuccessMessageTimer = () => {
    if (successMessageTimerRef.current) {
      clearTimeout(successMessageTimerRef.current);
      successMessageTimerRef.current = null;
    }
  };

  const showSuccessAndReturnToMain = (message: string) => {
    clearSuccessMessageTimer();
    setMode('view');
    setSubMode('main');
    setShowDatePicker(false);
    setFeedback(null);
    setSuccessMessage(`✅ ${message}`);
    successMessageTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
      successMessageTimerRef.current = null;
    }, 3000);
  };

  const handleEditBackToView = () => {
    clearSuccessMessageTimer();
    setFormRequest(null);
    setFeedback(null);
    setShowDatePicker(false);
    setSubMode('main');
    setMode('view');
  };

  const handleSubModeBackToMain = () => {
    setSubMode('main');
    setShowDatePicker(false);
    setFeedback(null);
  };

  const reloadFoodState = () => {
    setFoodStateRefreshKey((prev) => prev + 1);
  };

  // ── API ────────────────────────────────────────────────────────────────────

  const authH = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const callRestock = async () => {
    const r = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan/restock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH() },
      credentials: 'include',
      body: JSON.stringify({ refill_date: localTodayISO() }),
    });
    return r.ok;
  };

  const callAdjust = async (targetDate: string) => {
    const r = await fetch(`${API_BACKEND_BASE}/health/pets/${pet.pet_id}/feeding/plan/adjust`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authH() },
      credentials: 'include',
      body: JSON.stringify({ action: 'set_end_date', days: 0, target_date: targetDate }),
    });
    return r.ok;
  };

  // ── Action handlers ────────────────────────────────────────────────────────

  // "✅ Comprei" → restock → channel picker
  const handleComprei = async () => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      trackV1Metric('food_restock_confirmed', { pet_id: pet.pet_id, source: 'sheet' });
      const ok = await callRestock();
      if (ok) { onSaved?.(); reloadFoodState(); showSuccessAndReturnToMain('Compra registrada'); }
      else setFeedback({ msg: 'Não foi possível registrar. Tente novamente.', tone: 'red' });
    } catch {
      setFeedback({ msg: 'Sem conexão. Tente novamente.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  // "📦 Ajustar previsão" → set_end_date from today + days
  const handleAdjustDuration = async (targetDate: string) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const prevEnd = estEnd;
    const prevDailyG = foodState.dailyConsumptionG;
    const daysFromNow = Math.round(
      (new Date(targetDate + 'T00:00:00').getTime() - new Date(localTodayISO() + 'T00:00:00').getTime()) / 86400000
    );
    try {
      trackV1Metric('food_duration_adjusted', {
        pet_id: pet.pet_id,
        new_end_date: targetDate,
        previous_end_date: prevEnd,
        days_from_now: daysFromNow,
        old_daily_consumption_g: prevDailyG,
        package_size_kg: foodState.packageSizeKg,
        old_estimated_end_date: prevEnd,
        new_estimated_end_date: targetDate,
        delta_days: daysFromNow - (foodState.daysLeft ?? 0),
      });
      const ok = await callAdjust(targetDate);
      if (ok) { onSaved?.(); reloadFoodState(); showSuccessAndReturnToMain('Previsão ajustada'); }
      else {
        setFeedback({ msg: 'Não foi possível ajustar. Tente novamente.', tone: 'red' });
      }
    } catch {
      setFeedback({ msg: 'Sem conexão. Tente novamente.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  // "⚠️ Acabou" → set_end_date to a past date
  const handleFinished = async (targetDate: string) => {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const prevEnd = estEnd;
    const prevDailyG = foodState.dailyConsumptionG;
    try {
      trackV1Metric('food_finished_early', {
        pet_id: pet.pet_id,
        finished_date: targetDate,
        old_estimated_end_date: prevEnd,
        new_estimated_end_date: targetDate,
        old_daily_consumption_g: prevDailyG,
        package_size_kg: foodState.packageSizeKg,
        delta_days: -(foodState.daysLeft ?? 0),
      });
      const ok = await callAdjust(targetDate);
      if (ok) { onSaved?.(); reloadFoodState(); showSuccessAndReturnToMain('Ração marcada como finalizada'); }
      else {
        setFeedback({ msg: 'Não foi possível atualizar. Tente novamente.', tone: 'red' });
      }
    } catch {
      setFeedback({ msg: 'Sem conexão. Tente novamente.', tone: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const handleChannelSelect = (channel: PurchaseChannel) => {
    trackV1Metric('purchase_channel_selected', {
      pet_id: pet.pet_id,
      channel,
      channel_type: channel === 'loja_fisica' || channel === 'outro' ? 'physical' : 'online',
      source: 'food_sheet',
    });
    showSuccessAndReturnToMain('Compra registrada');
  };

  const handlePartnerClick = (partnerId: PreferredStore) => {
    try { localStorage.setItem(PREFERRED_STORE_KEY, partnerId); } catch { /* silent */ }
    setPreferredStore(partnerId);
    trackV1Metric('food_partner_selected', { source: 'food_sheet', pet_id: pet.pet_id, store: partnerId });
    trackPartnerClicked({ source: 'food_sheet', partner: partnerId, pet_id: pet.pet_id, control_type: 'food' });
    window.open(buildFoodHandoffUrl(foodBrand || '', pet.pet_id, partnerId as HomeShoppingPartnerId), '_blank', 'noopener,noreferrer');
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFERRED_STORE_KEY) as PreferredStore | null;
      if (raw && STORE_PARTNERS.includes(raw)) setPreferredStore(raw);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      clearSuccessMessageTimer();
    };
  }, []);

  useEffect(() => {
    trackV1Metric('food_alert_opened', {
      source: initialMode === 'buy' ? 'food_push' : 'food_sheet',
      pet_id: pet.pet_id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setPhotoLoadFailed(false); }, [petPhotoSrc]);

  // Reset submode when switching to view
  useEffect(() => { if (mode === 'view') setSubMode('main'); }, [mode]);

  // ── Pet photo ──────────────────────────────────────────────────────────────

  const PhotoBubble = ({ size }: { size: number }) => (
    <div
      className="rounded-full overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {petPhotoSrc && !photoLoadFailed ? (
        <img src={petPhotoSrc} alt={pet.pet_name} className="w-full h-full object-cover" loading="lazy"
          onError={() => setPhotoLoadFailed(true)} />
      ) : (
        <span>{pet.species === 'cat' ? '🐱' : '🐶'}</span>
      )}
    </div>
  );

  // ── Back button (shared) ───────────────────────────────────────────────────

  const BackBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      onTouchEnd={(e) => { e.preventDefault(); onClick(); }}
      className="relative z-10 pointer-events-auto flex items-center gap-1.5 h-10 px-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 text-sm font-semibold"
      aria-label="Voltar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="leading-none">Voltar</span>
    </button>
  );

  // ── Feedback banner ────────────────────────────────────────────────────────

  const FeedbackBanner = () => {
    if (!feedback) return null;
    const cls = feedback.tone === 'green' ? 'border-green-200 bg-green-50 text-green-900'
              : feedback.tone === 'red'   ? 'border-red-200 bg-red-50 text-red-900'
              :                             'border-blue-200 bg-blue-50 text-blue-900';
    const icon = feedback.tone === 'green' ? '✅' : feedback.tone === 'red' ? '⚠️' : 'ℹ️';
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2 ${cls}`}>
        <span className="flex-shrink-0 mt-0.5">{icon}</span>
        <span>{feedback.msg}</span>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ModalPortal>
      <div ref={overlayRef}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} />

        <div
          className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[28px] shadow-2xl border-t border-x sm:border border-gray-200/60 flex flex-col overflow-hidden animate-slideUp sm:animate-scaleIn"
          style={{ maxHeight: '92dvh' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-handle my-3 opacity-40 sm:hidden" />

          {/* ═══════════════════════════════════════════════════════════════
              EDIT / REPLACE MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'edit' && (
            <>
              <div className="relative z-10 flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
                <PhotoBubble size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Editar plano
                  </p>
                  <p className="text-[15px] font-black text-gray-900">{pet.pet_name}</p>
                </div>
                <button
                  type="button"
                  onClick={handleEditBackToView}
                  onTouchEnd={handleEditBackToView}
                  className="pointer-events-auto flex items-center gap-1.5 h-10 px-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 text-sm font-semibold"
                  aria-label="Voltar"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  <span className="leading-none">Voltar</span>
                </button>
              </div>
              <div className="px-4 pt-3 flex-shrink-0">
                <FeedbackBanner />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <FoodControlTab
                  petId={pet.pet_id} petName={pet.pet_name}
                  species={(pet.species as 'dog' | 'cat') || 'dog'}
                  formRequest={formRequest}
                  onStateChange={(s) => { setFoodState(s); setFoodBrand(s.foodBrand); }}
                  onSaved={() => { onSaved?.(); showSuccessAndReturnToMain('Controle atualizado'); }}
                />
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              BUY MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'buy' && (
            <>
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">🛒</div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-gray-900">{foodBrand ? `Comprar ${foodBrand}` : 'Comprar ração'}</h2>
                  <p className="text-xs text-gray-400">{pet.pet_name}</p>
                </div>
                <BackBtn onClick={() => setMode('view')} />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="p-5 pb-8 space-y-4">
                  {preferredStore ? (
                    <>
                      {(() => {
                        const partner = HOME_SHOPPING_PARTNERS.find((p) => p.id === preferredStore);
                        if (!partner) return null;
                        return (
                          <button type="button" onClick={() => handlePartnerClick(preferredStore)}
                            className="w-full flex items-center gap-4 p-5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg active:scale-[0.98] transition-all text-left">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={partner.logoSrc} alt={partner.logoAlt} className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-sm"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            <p className="flex-1 font-bold text-white text-base">Comprar na {partner.name} →</p>
                          </button>
                        );
                      })()}
                      <button type="button" onClick={() => setPreferredStore(null)} className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1">compro em outro lugar ›</button>
                    </>
                  ) : (
                    <>
                      {(() => {
                        const petz = HOME_SHOPPING_PARTNERS.find((p) => p.id === 'petz');
                        if (!petz) return null;
                        return (
                          <button type="button" onClick={() => handlePartnerClick('petz')}
                            className="w-full flex items-center gap-4 p-5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-lg active:scale-[0.98] transition-all text-left">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={petz.logoSrc} alt={petz.logoAlt} className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 flex-shrink-0 shadow-sm"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            <p className="flex-1 font-bold text-white text-base">Comprar na Petz →</p>
                          </button>
                        );
                      })()}
                      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                        {(['cobasi', 'petlove'] as const).map((id) => {
                          const p = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === id);
                          if (!p) return null;
                          return (
                            <button type="button" key={id} onClick={() => handlePartnerClick(id)} className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 decoration-gray-300">
                              {p.name}
                            </button>
                          );
                        })}
                        <button type="button"
                          onClick={() => {
                            trackV1Metric('food_partner_selected', { source: 'food_sheet', pet_id: pet.pet_id, store: 'amazon' });
                            trackPartnerClicked({ source: 'food_sheet', partner: 'amazon', pet_id: pet.pet_id, control_type: 'food' });
                            window.open(buildFoodHandoffUrl(foodBrand || '', pet.pet_id, 'amazon'), '_blank', 'noopener,noreferrer');
                          }}
                          className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 decoration-gray-300"
                        >outro lugar</button>
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setMode('view')}
                    onTouchEnd={(e) => { e.preventDefault(); setMode('view'); }}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200"
                  >
                    ← Voltar
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              VIEW MODE
          ═══════════════════════════════════════════════════════════════ */}
          {mode === 'view' && (
            <>
              {/* Fixed header */}
              <div className="px-4 pt-1 pb-3 flex items-center gap-3 flex-shrink-0">
                <PhotoBubble size={44} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-[18px] font-black text-gray-900 leading-tight">
                    Ração {pet.pet_name.charAt(0).toUpperCase() !== pet.pet_name.charAt(0) ? 'da' : 'do'} {pet.pet_name}
                  </h2>
                </div>
                {subMode !== 'main' ? (
                  <button
                    type="button"
                    onClick={handleSubModeBackToMain}
                    onTouchEnd={(e) => { e.preventDefault(); handleSubModeBackToMain(); }}
                    className="relative z-10 pointer-events-auto flex items-center gap-1.5 h-10 px-3 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-95 transition-all flex-shrink-0 text-sm font-semibold"
                    aria-label="Voltar"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    <span className="leading-none">Voltar</span>
                  </button>
                ) : (
                  <button type="button" onClick={onClose}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 active:scale-90 transition-all flex-shrink-0"
                    aria-label="Fechar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Hidden FoodControlTab — loads API data and fires onStateChange */}
              <div className="hidden" aria-hidden="true">
                <FoodControlTab
                  key={`food-view-state-${foodStateRefreshKey}`}
                  petId={pet.pet_id} petName={pet.pet_name}
                  species={(pet.species as 'dog' | 'cat') || 'dog'}
                  onStateChange={(s) => { setFoodState(s); setFoodBrand(s.foodBrand); }}
                  onSaved={() => onSaved?.()}
                />
              </div>

              {/* Scrollable body */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="px-4 pb-8 space-y-4">
                  {successMessage && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                      {successMessage}
                    </div>
                  )}

                  {/* ── SEM RAÇÃO ──────────────────────────────────────────── */}
                  {!hasFood && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
                      <div>
                        <h3 className="text-[20px] font-black text-gray-900 leading-tight">Vamos começar pela ração</h3>
                        <p className="text-[13px] text-gray-500 mt-1">Registre o produto para saber quando vai acabar.</p>
                      </div>
                      <div className="space-y-2">
                        <button type="button"
                          onClick={() => { setFormRequest({ id: Date.now(), mode: 'add' }); setMode('edit'); }}
                          className="w-full py-3.5 rounded-2xl bg-blue-600 text-white text-[15px] font-black shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                          <span>📷</span> Escanear produto
                        </button>
                        <button type="button"
                          onClick={() => { setFormRequest({ id: Date.now(), mode: 'edit' }); setMode('edit'); }}
                          className="w-full py-3 rounded-2xl bg-white border border-gray-300 text-[14px] font-semibold text-gray-700 active:scale-95 transition-all"
                        >
                          ✏️ Cadastrar manualmente
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-400 text-center">Você pode ajustar depois.</p>
                    </div>
                  )}

                  {/* ── COM RAÇÃO ──────────────────────────────────────────── */}
                  {hasFood && (
                    <>
                      {/* ─── SUBMODE: main ─────────────────────────────────── */}
                      {subMode === 'main' && (
                        <>
                          {/* 1. Status principal */}
                          <div className="pt-1">
                            {foodState.daysLeft !== null ? (
                              <>
                                <p className="text-[56px] font-black text-gray-900 leading-none tracking-tight">
                                  {Math.max(0, foodState.daysLeft)}
                                </p>
                                <p className="text-[17px] font-semibold text-gray-500 mt-1">
                                  {foodState.daysLeft <= 0 ? 'Ração esgotada' : 'dias restantes'}
                                </p>
                                {estEnd && (
                                  <p className="text-[13px] text-gray-400 mt-0.5">
                                    Previsão de acabar: <span className="font-semibold text-gray-700">{fmtDate(estEnd)}</span>
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-[15px] text-gray-400 py-2">Complete o plano para ver a previsão.</p>
                            )}
                          </div>

                          {/* 2. Produto atual */}
                          {foodBrand && (
                            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3">
                              <span className="text-2xl flex-shrink-0">🥣</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-bold text-gray-900 truncate">{foodBrand}</p>
                                <p className="text-[12px] text-gray-400">
                                  {[
                                    foodState.packageSizeKg != null
                                      ? `Pacote: ${foodState.packageSizeKg % 1 === 0 ? foodState.packageSizeKg : foodState.packageSizeKg.toFixed(1)} kg`
                                      : null,
                                    foodState.startDate ? `Início: ${fmtDate(foodState.startDate)}` : null,
                                  ].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Feedback banner */}
                          <FeedbackBanner />

                          {/* 3. CTA principal */}
                          <button type="button"
                            onClick={() => {
                              trackV1Metric('food_buy_clicked', { pet_id: pet.pet_id, days_left: foodState.daysLeft });
                              setMode('buy');
                            }}
                            className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all text-white text-[16px] font-black shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2.5"
                          >
                            <span className="text-xl">🛒</span>
                            Comprar novamente
                          </button>
                          <p className="text-center text-[10px] text-gray-400 -mt-2 select-none">
                            Petz · Cobasi · Amazon · Petlove e mais
                          </p>

                          {/* 4. Ações secundárias */}
                          <div className="grid grid-cols-3 gap-2">
                            <button type="button" onClick={handleComprei} disabled={busy}
                              className="py-3 rounded-2xl bg-green-50 border border-green-200 text-[12px] font-bold text-green-800 active:scale-95 transition-all disabled:opacity-50">
                              ✅ Comprei
                            </button>
                            <button type="button"
                              onClick={() => { setSubMode('adjustDuration'); setShowDatePicker(false); setFeedback(null); }}
                              disabled={busy}
                              className="py-3 rounded-2xl bg-gray-50 border border-gray-200 text-[12px] font-bold text-gray-600 active:scale-95 transition-all disabled:opacity-50">
                              📦 Ajustar
                            </button>
                            <button type="button"
                              onClick={() => { setSubMode('finished'); setShowDatePicker(false); setFeedback(null); }}
                              disabled={busy}
                              className="py-3 rounded-2xl bg-orange-50 border border-orange-200 text-[12px] font-bold text-orange-700 active:scale-95 transition-all disabled:opacity-50">
                              ⚠️ Acabou
                            </button>
                          </div>

                          {/* 5. Detalhes do cálculo — recolhível */}
                          <button type="button" onClick={() => setShowDetails((v) => !v)}
                            className="w-full flex items-center justify-between text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors py-1">
                            <span>Detalhes do cálculo</span>
                            <span className="text-[10px]">{showDetails ? '▲' : '▼'}</span>
                          </button>

                          {showDetails && (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 overflow-hidden -mt-2">
                              {[
                                ['Produto', foodBrand || '—'],
                                ['Pacote', foodState.packageSizeKg != null ? `${foodState.packageSizeKg % 1 === 0 ? foodState.packageSizeKg : foodState.packageSizeKg.toFixed(1)} kg` : '—'],
                                ['Consumo estimado', foodState.dailyConsumptionG != null ? `${Math.round(foodState.dailyConsumptionG)} g/dia` : '—'],
                                ['Início do ciclo', fmtDate(foodState.startDate)],
                                ['Previsão de término', fmtDate(estEnd)],
                                ['Dias restantes', foodState.daysLeft !== null ? `${Math.max(0, foodState.daysLeft)} dias` : '—'],
                              ].map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                                  <span className="text-[12px] text-gray-500">{label}</span>
                                  <span className="text-[12px] font-semibold text-gray-800">{value}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 6. Rodapé administrativo */}
                          <div className="pt-1 pb-1">
                            <button type="button"
                              onClick={() => { setFormRequest({ id: Date.now(), mode: 'edit' }); setMode('edit'); }}
                              className="w-full py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
                            >
                              Editar plano
                            </button>
                          </div>
                        </>
                      )}

                      {/* ─── SUBMODE: adjustDuration ────────────────────────── */}
                      {subMode === 'adjustDuration' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ajustar previsão</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">
                              Por quantos dias a ração ainda deve durar?
                            </h3>
                            <p className="text-[13px] text-gray-500 mt-1">
                              Previsão atual: {fmtDate(estEnd)} ({foodState.daysLeft ?? '—'} dias)
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {[3, 7, 15, 30].map((d) => (
                              <button type="button" key={d} disabled={busy}
                                onClick={() => handleAdjustDuration(isoPlus(d))}
                                className="py-4 rounded-2xl border border-gray-200 bg-white text-[15px] font-bold text-gray-800 hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50">
                                {d} dias
                              </button>
                            ))}
                          </div>

                          {!showDatePicker ? (
                            <button type="button"
                              onClick={() => { setCustomDate(isoPlus(7)); setShowDatePicker(true); }}
                              className="w-full py-3 rounded-2xl border border-dashed border-gray-300 bg-white text-sm font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all">
                              Escolher data específica
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input type="date" value={customDate} min={localTodayISO()}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                              <button type="button" disabled={!customDate || busy}
                                onClick={() => handleAdjustDuration(customDate)}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all">
                                OK
                              </button>
                            </div>
                          )}

                          <FeedbackBanner />
                        </div>
                      )}

                      {/* ─── SUBMODE: finished ──────────────────────────────── */}
                      {subMode === 'finished' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">A ração acabou?</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">
                              Quando acabou?
                            </h3>
                          </div>

                          <div className="space-y-2">
                            {[
                              { label: 'Hoje', iso: localTodayISO() },
                              { label: 'Ontem', iso: isoPlus(-1) },
                              { label: 'Há 3 dias', iso: isoPlus(-3) },
                            ].map(({ label, iso }) => (
                              <button type="button" key={label} disabled={busy}
                                onClick={() => handleFinished(iso)}
                                className="w-full py-3.5 rounded-2xl border border-gray-200 bg-white text-[15px] font-semibold text-gray-800 text-left px-5 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50">
                                {label}
                              </button>
                            ))}
                          </div>

                          {!showDatePicker ? (
                            <button type="button"
                              onClick={() => { setCustomDate(localTodayISO()); setShowDatePicker(true); }}
                              className="w-full py-3 rounded-2xl border border-dashed border-gray-300 bg-white text-sm font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all">
                              Escolher data
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input type="date" value={customDate} max={localTodayISO()}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" />
                              <button type="button" disabled={!customDate || busy}
                                onClick={() => handleFinished(customDate)}
                                className="px-5 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold disabled:opacity-50 active:scale-95 transition-all">
                                OK
                              </button>
                            </div>
                          )}

                          <FeedbackBanner />

                          {/* Suggest buy after finishing */}
                          {feedback?.tone === 'blue' && (
                            <button type="button"
                              onClick={() => { setSubMode('main'); setMode('buy'); }}
                              className="w-full py-4 rounded-2xl bg-blue-600 text-white text-[15px] font-black shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all"
                            >
                              <span className="text-xl">🛒</span>
                              Comprar novamente
                            </button>
                          )}
                        </div>
                      )}

                      {/* ─── SUBMODE: channel ───────────────────────────────── */}
                      {subMode === 'channel' && (
                        <div className="space-y-4 pt-1">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Compra registrada ✅</p>
                            <h3 className="text-[20px] font-black text-gray-900 leading-tight mt-1">Onde você comprou?</h3>
                            <p className="text-[13px] text-gray-400 mt-0.5">Opcional — nos ajuda a melhorar.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                ['petz', 'Petz'],
                                ['cobasi', 'Cobasi'],
                                ['amazon', 'Amazon'],
                                ['petlove', 'Petlove'],
                                ['loja_fisica', 'Loja física'],
                                ['outro', 'Outro'],
                              ] as [PurchaseChannel, string][]
                            ).map(([id, label]) => (
                              <button type="button" key={id} onClick={() => handleChannelSelect(id)}
                                className="py-3.5 rounded-2xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all">
                                {label}
                              </button>
                            ))}
                          </div>
                          <button type="button" onClick={() => showSuccessAndReturnToMain('Compra registrada com sucesso.')}
                            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
                            Pular
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
