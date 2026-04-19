'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { HomeShoppingSheet } from '@/features/commerce/HomeShoppingSheet';
import { HomeEmergencySheet } from '@/components/home/HomeEmergencySheet';
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
  const [showEmergencySheet, setShowEmergencySheet] = useState(false);
  const [showTrainingSheet, setShowTrainingSheet] = useState(false);
  const [showHealthPlanSheet, setShowHealthPlanSheet] = useState(false);


  return (
    <>
      {/* 6 Botões Principais - Grid 2x3 compacto para caber na primeira dobra */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. SAÚDE - Azul Vacina (Mais Vivo) / Fixo */}
          <button
            onClick={onHealthClick}
            className="group relative overflow-hidden rounded-xl border border-blue-300 bg-gradient-to-br from-blue-100 to-blue-200 p-3 min-h-[74px] shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertBadge tone={colorHealth} />}
            <span className="absolute right-2 top-2 text-xl opacity-80 pointer-events-none transition-transform group-hover:scale-110">🏥</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[15px] font-semibold leading-tight text-sky-900">
                {t('home.health.title')}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-sky-700 opacity-70">{t('home.health.vaccines')}</p>
            </div>
          </button>

          {/* 2. HIGIENE - Verde Vibrante (Original) */}
          <button
            onClick={onBanhoTosaClick}
            className="group relative overflow-hidden rounded-xl border border-green-300 bg-gradient-to-br from-green-100 to-green-200 p-3 min-h-[74px] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95 hover:from-green-200 hover:to-green-300"
          >
            {shouldShowAlert(colorGrooming, alertGrooming) && <AlertBadge tone={colorGrooming} />}
            <span className="absolute right-2 top-2 text-xl opacity-80 pointer-events-none transition-transform group-hover:scale-110">🛁</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[15px] font-semibold leading-tight text-green-900">
                {t('home.hygiene')}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-green-700 opacity-70">{t('home.hygiene.desc')}</p>
            </div>
          </button>

          {/* 3. ALIMENTAÇÃO - Laranja Vibrante (Original) */}
          <button
            onClick={onAlimentacaoClick}
            className="group relative overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-100 to-amber-200 p-3 min-h-[74px] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95 hover:from-orange-200 hover:to-amber-300"
          >
            {shouldShowAlert(colorFood, alertFood) && <AlertBadge tone={colorFood} />}
            <span className="absolute right-2 top-2 opacity-95 pointer-events-none transition-transform group-hover:scale-110">
              <span className="text-xl">🥣</span>
            </span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[15px] font-bold leading-tight text-amber-950">{t('home.food.title')}</h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-amber-800">{t('home.food.desc')}</p>
            </div>
          </button>

          {/* 4. SHOPPING - Azul Marca (Original) */}
          <button
            onClick={() => setShowShoppingSheet(true)}
            className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-[#2563eb] via-[#1e6fd9] to-[#7c3aed] p-3 min-h-[74px] transition-all duration-200 hover:-translate-y-1 hover:shadow-lg active:scale-95 hover:from-[#1d4ed8] hover:to-[#6d28d9]"
          >
            {alertShopping && <AlertBadge tone="critical" />}
            <span className="absolute right-2 top-2 text-xl pointer-events-none transition-transform group-hover:scale-110" style={{ filter: 'brightness(0) invert(1)' }}>🛒</span>
            <div className="flex h-full flex-col justify-center pr-7 pt-3 text-left">
              <h3 className="truncate text-[15px] font-bold leading-tight text-white drop-shadow-sm">{t('home.shopping.title')}</h3>
              <p className="mt-0.5 line-clamp-1 text-[11px] leading-tight text-white/80">{t('home.shopping.desc')}</p>
            </div>
          </button>

        <button
          onClick={() => setShowEmergencySheet(true)}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-rose-500 p-3 min-h-[68px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] shadow-md shadow-red-200 hover:from-red-700 hover:via-red-600 hover:to-rose-600"
        >
          <span className="absolute left-2.5 top-2.5 flex items-center justify-center">
            <span className="absolute h-7 w-7 rounded-full bg-white/20 animate-ping"></span>
            <span className="relative text-lg">🚨</span>
          </span>
          <div className="flex h-full flex-col justify-center pl-7 pr-6 text-left">
            <h3 className="truncate text-[14px] font-bold leading-tight text-white drop-shadow">Emergência</h3>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-white/80">Clínicas e hospitais 24h perto de você</p>
          </div>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-lg text-white/70 transition-transform group-hover:translate-x-1">›</span>
        </button>

        <button
          onClick={onDocumentosClick}
          className="group relative overflow-hidden rounded-xl border border-slate-600/50 bg-gradient-to-r from-slate-700 to-slate-800 p-3 min-h-[68px] transition-all duration-300 hover:shadow-xl active:scale-[0.98]"
        >
          <div className="flex h-full items-center gap-2.5 text-left">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-transform group-hover:scale-110">
              <span className="pointer-events-none text-lg">📁</span>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14px] font-bold leading-tight text-white">Documentos</h3>
              <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-tight text-slate-300 opacity-80">Seu cofre digital de saúde pet</p>
            </div>
            <span className="text-lg text-white/30 transition-transform group-hover:translate-x-1">›</span>
          </div>
        </button>
        </div>
      </div>

      <HomeShoppingSheet open={showShoppingSheet} onClose={() => setShowShoppingSheet(false)} />
      <HomeEmergencySheet open={showEmergencySheet} onClose={() => setShowEmergencySheet(false)} />
      
      {/* Informação sobre itens indisponíveis no MVP H1 mas presentes no visual */}
      {(showTrainingSheet || showHealthPlanSheet) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => { setShowTrainingSheet(false); setShowHealthPlanSheet(false); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">{showTrainingSheet ? '🐾' : '🩺'}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Em breve</h2>
            <p className="text-gray-500 text-sm mb-6">
              Esta funcionalidade está sendo preparada para o PETMOL. Continue usando os recursos de Saúde e Higiene disponíveis!
            </p>
            <button 
              onClick={() => { setShowTrainingSheet(false); setShowHealthPlanSheet(false); }}
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold active:scale-95 transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
