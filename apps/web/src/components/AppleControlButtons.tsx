'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { HomeShoppingSheet } from '@/features/commerce/HomeShoppingSheet';
import { type HomeInactiveEligibleControlId } from '@/lib/homeControlPreferences';

// ── Props H1 logic preserved ──────────────────────────────────────────────────
interface AppleControlButtonsProps {
  onHealthClick: () => void;
  onDocumentosClick: () => void;
  onAlimentacaoClick?: () => void;
  onBanhoTosaClick?: () => void;
  onMedicacaoClick?: () => void;
  onFamilyClick?: () => void; // Added from reference pattern
  
  // Alert overrides from engine H1
  alertHealth?: boolean;
  alertGrooming?: boolean;
  alertFood?: boolean;
  alertMedicacao?: boolean;
  alertShopping?: boolean;
  
  colorHealth?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorGrooming?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorFood?: 'neutral' | 'ok' | 'warning' | 'critical';
  colorMedicacao?: 'neutral' | 'ok' | 'warning' | 'critical';
  
  inactiveControls?: HomeInactiveEligibleControlId[];
  onDeactivateControl?: (controlId: HomeInactiveEligibleControlId) => void;
}

type ControlTone = 'neutral' | 'ok' | 'warning' | 'critical';

function shouldShowAlert(tone?: ControlTone, fallbackAlert?: boolean) {
  if (tone) return tone === 'warning' || tone === 'critical';
  return fallbackAlert === true;
}

function AlertBadge({ tone = 'critical' }: { tone?: ControlTone }) {
  if (tone === 'warning') {
    return (
      <span className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center w-6 h-6 animate-pulse">
        <span
          className="absolute inset-0 bg-amber-400 shadow-md ring-2 ring-white"
          style={{ clipPath: 'polygon(50% 0%, 100% 92%, 0% 92%)' }}
        />
        <span className="relative mt-1 text-amber-950 font-black leading-none" style={{ fontSize: '11px' }}>!</span>
      </span>
    );
  }

  return (
    <span className="absolute top-1.5 left-1.5 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-red-500 shadow-md ring-2 ring-white animate-pulse">
      <span className="text-white font-black leading-none" style={{ fontSize: '10px' }}>!</span>
    </span>
  );
}

export function AppleControlButtons({
  onHealthClick,
  onDocumentosClick,
  onAlimentacaoClick,
  onBanhoTosaClick,
  onFamilyClick,
  alertHealth,
  alertGrooming,
  alertFood,
  alertMedicacao,
  alertShopping,
  colorHealth,
  colorGrooming,
  colorFood,
  colorMedicacao,
  inactiveControls = [],
}: AppleControlButtonsProps) {
  const { t } = useI18n();
  const [showShoppingSheet, setShowShoppingSheet] = useState(false);


  return (
    <>
      {/* Grid principal — Alimentação em destaque na primeira posição */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. ALIMENTAÇÃO — hero card, primeira posição */}
          <button
            onClick={onAlimentacaoClick}
            className="group relative overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-100 to-orange-200 p-3 min-h-[80px] shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95"
          >
            {shouldShowAlert(colorFood, alertFood) && <AlertBadge tone={colorFood} />}
            <span className="absolute right-2 top-2 opacity-95 pointer-events-none transition-transform group-hover:scale-110">
              <span className="text-2xl">🥣</span>
            </span>
            <div className="flex h-full flex-col justify-center pr-8 pt-3 text-left">
              <h3 className="truncate text-base font-bold leading-tight text-amber-950">{t('home.food.title')}</h3>
              <p className="mt-0.5 line-clamp-1 text-xs leading-tight text-amber-800">{t('home.food.desc')}</p>
            </div>
          </button>

          {/* 2. SAÚDE */}
          <button
            onClick={onHealthClick}
            className="group relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-100 p-3 min-h-[80px] shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertBadge tone={colorHealth} />}
            <span className="absolute right-2 top-2 text-xl opacity-80 pointer-events-none transition-transform group-hover:scale-110">🏥</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-base font-semibold leading-tight text-blue-900">
                {t('home.health.title')}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs leading-tight text-blue-600 opacity-80">{t('home.health.vaccines')}</p>
            </div>
          </button>

          {/* 3. HIGIENE */}
          <button
            onClick={onBanhoTosaClick}
            className="group relative overflow-hidden rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-100 p-3 min-h-[74px] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95"
          >
            {shouldShowAlert(colorGrooming, alertGrooming) && <AlertBadge tone={colorGrooming} />}
            <span className="absolute right-2 top-2 text-xl opacity-80 pointer-events-none transition-transform group-hover:scale-110">🛁</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-base font-semibold leading-tight text-green-900">
                {t('home.hygiene')}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-xs leading-tight text-green-700 opacity-80">{t('home.hygiene.desc')}</p>
            </div>
          </button>

          {/* 4. SCANNER / COMPRAS */}
          <button
            onClick={() => setShowShoppingSheet(true)}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-[#2563eb] via-[#1e6fd9] to-[#7c3aed] p-3 min-h-[74px] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95 hover:from-[#1d4ed8] hover:to-[#6d28d9]"
          >
            {alertShopping && <AlertBadge tone="critical" />}
            <span className="absolute right-2 top-2 text-xl pointer-events-none transition-transform group-hover:scale-110" style={{ filter: 'brightness(0) invert(1)' }}>🛒</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-base font-bold leading-tight text-white drop-shadow-sm">{t('home.shopping.title')}</h3>
              <p className="mt-0.5 line-clamp-1 text-xs leading-tight text-white/80">{t('home.shopping.desc')}</p>
            </div>
          </button>

          {/* 5. DOCUMENTOS — full width */}
          <button
            onClick={onDocumentosClick}
            className="group col-span-2 relative overflow-hidden rounded-xl border border-slate-600/50 bg-gradient-to-r from-slate-700 to-slate-800 p-3 min-h-[56px] transition-all duration-300 hover:shadow-xl active:scale-[0.98]"
          >
            <div className="flex h-full items-center gap-2.5 text-left">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-transform group-hover:scale-110">
                <span className="pointer-events-none text-lg">📁</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold leading-tight text-white">Histórico</h3>
                <p className="mt-0.5 line-clamp-1 text-xs font-semibold leading-tight text-slate-300 opacity-80">Leve o histórico do pet para cada consulta</p>
              </div>
              <span className="text-lg text-white/30 transition-transform group-hover:translate-x-1">›</span>
            </div>
          </button>
        </div>
      </div>

      <HomeShoppingSheet open={showShoppingSheet} onClose={() => setShowShoppingSheet(false)} />
      
    </>
  );
}
