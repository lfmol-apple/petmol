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
      {/* 4 Botões Principais - Grid 2x2 (Visual Simplificado Baby) */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* 1. SAÚDE - Azul Vacina (Mais Vivo) / Fixo */}
          <button
            onClick={onHealthClick}
            className="group relative overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200 border-blue-300 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-95 border rounded-xl p-3 h-[82px]"
          >
            {shouldShowAlert(colorHealth, alertHealth) && <AlertBadge tone={colorHealth} />}
            <span className="absolute top-2 right-2 text-2xl opacity-80 pointer-events-none transition-transform group-hover:scale-110">🏥</span>
            <div className="flex flex-col justify-center h-full pr-8 text-left pt-4">
              <h3 className="text-base font-semibold leading-tight truncate text-sky-900">
                {t('home.health.title')}
              </h3>
              <p className="text-[10px] text-sky-700 opacity-70 truncate mt-0.5 leading-tight">{t('home.health.vaccines')}</p>
            </div>
          </button>

          {/* 2. HIGIENE - Verde Vibrante (Original) */}
          <button
            onClick={onBanhoTosaClick}
            className="group relative overflow-hidden bg-gradient-to-br from-green-100 to-green-200 hover:from-green-200 hover:to-green-300 border border-green-300 rounded-xl p-3 h-[82px] transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-95"
          >
            {shouldShowAlert(colorGrooming, alertGrooming) && <AlertBadge tone={colorGrooming} />}
            <span className="absolute top-2 right-2 text-2xl opacity-80 pointer-events-none transition-transform group-hover:scale-110">🛁</span>
            <div className="flex flex-col justify-center h-full pr-8 text-left pt-4">
              <h3 className="text-base font-semibold text-green-900 leading-tight truncate">
                {t('home.hygiene')}
              </h3>
              <p className="text-[10px] text-green-700 opacity-70 truncate mt-0.5 leading-tight">{t('home.hygiene.desc')}</p>
            </div>
          </button>

          {/* 3. ALIMENTAÇÃO - Laranja Vibrante (Original) */}
          <button
            onClick={onAlimentacaoClick}
            className="group relative overflow-hidden bg-gradient-to-br from-orange-100 to-amber-200 hover:from-orange-200 hover:to-amber-300 border border-orange-200 rounded-xl p-3 h-[82px] transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-95"
          >
            {shouldShowAlert(colorFood, alertFood) && <AlertBadge tone={colorFood} />}
            <span className="absolute top-2 right-2 opacity-95 pointer-events-none transition-transform group-hover:scale-110">
              <span className="text-2xl">🥣</span>
            </span>
            <div className="flex flex-col justify-center h-full pr-8 text-left pt-4">
              <h3 className="text-base font-bold text-amber-950 leading-tight truncate">{t('home.food.title')}</h3>
              <p className="text-[10px] text-amber-800 truncate mt-0.5 leading-tight">{t('home.food.desc')}</p>
            </div>
          </button>

          {/* 4. SHOPPING - Azul Marca (Original) */}
          <button
            onClick={() => setShowShoppingSheet(true)}
            className="group relative overflow-hidden bg-gradient-to-br from-[#2563eb] via-[#1e6fd9] to-[#7c3aed] hover:from-[#1d4ed8] hover:to-[#6d28d9] rounded-xl p-3 h-[82px] transition-all duration-200 hover:shadow-lg hover:-translate-y-1 active:scale-95"
          >
            {alertShopping && <AlertBadge tone="critical" />}
            <span className="absolute top-2 right-2 text-2xl pointer-events-none transition-transform group-hover:scale-110" style={{ filter: 'brightness(0) invert(1)' }}>🛒</span>
            <div className="flex flex-col justify-center h-full pr-8 text-left pt-4">
              <h3 className="text-base font-bold text-white leading-tight truncate drop-shadow-sm">{t('home.shopping.title')}</h3>
              <p className="text-[10px] text-white/80 truncate mt-0.5 leading-tight">{t('home.shopping.desc')}</p>
            </div>
          </button>
        </div>
      </div>

      {/* EMERGÊNCIA VETERINÁRIA - Full Width (Visual Referência) */}
      <button
        onClick={() => setShowEmergencySheet(true)}
        className="group relative w-full overflow-hidden bg-gradient-to-r from-red-600 via-red-500 to-rose-500 hover:from-red-700 hover:via-red-600 hover:to-rose-600 rounded-xl p-3 h-[56px] mt-3 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] shadow-red-200 shadow-md mb-4"
      >
        <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
          <span className="absolute w-8 h-8 rounded-full bg-white/20 animate-ping"></span>
          <span className="relative text-xl">🚨</span>
        </span>
        <div className="flex flex-col justify-center h-full pl-10 pr-12 text-left">
          <h3 className="text-sm font-bold text-white leading-tight tracking-wide drop-shadow">Emergência Veterinária</h3>
          <p className="text-[10px] text-white/80 mt-0.5 leading-tight">Clínicas e hospitais abertos <span className="font-bold text-yellow-200">24h</span> perto de você</p>
        </div>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 text-lg transition-transform group-hover:translate-x-1">›</span>
      </button>

      {/* Botões inferiores: Histórico (Ref Pattern) */}
      <div className="mt-3">
        {/* GUARDAR DOCUMENTOS (Antigo Histórico) */}
        <button
          onClick={onDocumentosClick}
          className="group relative w-full overflow-hidden bg-gradient-to-r from-slate-700 to-slate-800 rounded-2xl p-2.5 h-[60px] flex items-center gap-3 hover:shadow-xl active:scale-[0.98] transition-all duration-300 border border-slate-600/50"
        >
          <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm transition-transform group-hover:scale-110">
            <span className="text-xl pointer-events-none">📁</span>
          </div>
          <div className="flex flex-col text-left">
            <h3 className="text-sm font-bold text-white leading-tight">Guardar Documentos</h3>
            <p className="text-[10px] text-slate-300 font-bold opacity-80 mt-0.5">Seu cofre digital de saúde pet</p>
          </div>
          <span className="ml-auto text-white/30 text-xl group-hover:translate-x-1 transition-transform">›</span>
        </button>
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
