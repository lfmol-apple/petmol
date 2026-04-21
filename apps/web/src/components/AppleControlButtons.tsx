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
  onMedicacaoClick,
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
  className = '',
}: AppleControlButtonsProps) {
  const { t } = useI18n();
  const [showShoppingSheet, setShowShoppingSheet] = useState(false);


  return (
    <>
      {/* Grid principal — Alimentação em destaque na primeira posição */}
      <div className={`relative pt-1 ${className}`}>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onAlimentacaoClick}
            className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-amber-100 to-orange-100 p-3 min-h-[90px] shadow-sm transition-all duration-300 hover:-translate-y-1 active:scale-95 border-2 border-amber-300/70"
          >
            {shouldShowAlert(colorFood, alertFood) && <AlertBadge tone={colorFood} />}
            <span className="absolute right-3 top-3 opacity-95 pointer-events-none transition-transform group-hover:scale-125 duration-500 text-2xl drop-shadow-sm">🥣</span>
            <div className="flex h-full flex-col justify-end pr-6 pt-3 text-left">
              <h3 className="truncate text-[15px] font-black leading-tight text-amber-950 tracking-tight">{t('home.food.title')}</h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-bold leading-tight text-amber-800 uppercase tracking-wide">{t('home.food.desc')}</p>
            </div>
          </button>

          {/* 2. SAÚDE */}
          <button
            onClick={onHealthClick}
            className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-sky-100 via-blue-100 to-blue-200 p-3 min-h-[90px] shadow-sm transition-all duration-300 hover:-translate-y-1 active:scale-95 border-2 border-blue-300/70"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertBadge tone={colorHealth} />}
            <span className="absolute right-3 top-3 text-xl opacity-90 pointer-events-none transition-transform group-hover:scale-125 duration-500 drop-shadow-sm">🏥</span>
            <div className="flex h-full flex-col justify-end pr-6 pt-3 text-left">
              <h3 className="truncate text-[15px] font-black leading-tight text-blue-950 tracking-tight">
                {t('home.health.title')}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-bold leading-tight text-blue-900 uppercase tracking-wide">{t('home.health.vaccines')}</p>
            </div>
          </button>

          {/* 3. HIGIENE */}
          <button
            onClick={onBanhoTosaClick}
            className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-emerald-100 via-green-100 to-lime-100 p-3 min-h-[84px] shadow-sm transition-all duration-300 hover:-translate-y-1 active:scale-95 border-2 border-emerald-300/70"
          >
            {shouldShowAlert(colorGrooming, alertGrooming) && <AlertBadge tone={colorGrooming} />}
            <span className="absolute right-3 top-3 text-xl opacity-90 pointer-events-none transition-transform group-hover:scale-125 duration-500 drop-shadow-sm">🛁</span>
            <div className="flex h-full flex-col justify-end pr-6 pt-3 text-left">
              <h3 className="truncate text-[15px] font-black leading-tight text-green-950 tracking-tight">
                {t('home.hygiene')}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-bold leading-tight text-green-900 uppercase tracking-wide">{t('home.hygiene.desc')}</p>
            </div>
          </button>

          {/* 4. SCANNER / COMPRAS */}
          <button
            onClick={() => setShowShoppingSheet(true)}
            className="group relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#2563eb] via-[#1e6fd9] to-[#7c3aed] p-3 min-h-[84px] shadow-sm transition-all duration-300 hover:-translate-y-1 active:scale-95 border-2 border-indigo-950/40"
          >
            {alertShopping && <AlertBadge tone="critical" />}
            <span className="absolute right-3 top-3 text-xl pointer-events-none transition-transform group-hover:scale-125 duration-500" style={{ filter: 'brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>🛒</span>
            <div className="flex h-full flex-col justify-end pr-6 pt-3 text-left">
              <h3 className="truncate text-[15px] font-black leading-tight text-white drop-shadow-md tracking-tight">{t('home.shopping.title')}</h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] font-bold leading-tight text-white/80 uppercase tracking-wide">{t('home.shopping.desc')}</p>
            </div>
          </button>

          {/* 5. DOCUMENTOS — full width */}
          <button
            onClick={onDocumentosClick}
            className="group col-span-2 relative overflow-hidden rounded-[24px] bg-gradient-to-r from-slate-700 to-slate-800 p-3 min-h-[64px] shadow-md transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] border border-slate-600"
          >
            <div className="flex h-full items-center gap-3 text-left">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 transition-transform group-hover:scale-110 duration-500 shadow-inner">
                <span className="pointer-events-none text-xl drop-shadow-sm">📁</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[15px] font-black leading-tight text-white tracking-tight">Histórico</h3>
                <p className="mt-0.5 line-clamp-1 text-[11px] font-bold leading-tight text-slate-300 uppercase tracking-wide">Relatórios e Consultas</p>
              </div>
              <span className="text-xl text-white/20 transition-transform group-hover:translate-x-1 duration-300 pr-1">›</span>
            </div>
          </button>
        </div>
      </div>

      <HomeShoppingSheet open={showShoppingSheet} onClose={() => setShowShoppingSheet(false)} />
      
    </>
  );
}
