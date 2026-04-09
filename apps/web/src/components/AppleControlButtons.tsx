'use client';

import { useState } from 'react';
import { HomeShoppingSheet } from '@/features/commerce/HomeShoppingSheet';
import { HomeEmergencySheet } from '@/components/home/HomeEmergencySheet';
import { type HomeInactiveEligibleControlId } from '@/lib/homeControlPreferences';

// ── Props ─────────────────────────────────────────────────────────────────────
interface AppleControlButtonsProps {
  onVacinasClick: () => void;
  onVermifugoClick: () => void;
  onAntipulgasClick: () => void;
  onColeiraClick: () => void;
  onDocumentosClick: () => void;
  // Operational domain callbacks
  onAlimentacaoClick?: () => void;
  onBanhoTosaClick?: () => void;
  onMedicacaoClick?: () => void;
  // Alert overrides from engine
  alertVacinas?: boolean;
  colorVacinas?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertVermifugo?: boolean;
  colorVermifugo?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertAntipulgas?: boolean;
  colorAntipulgas?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertColeira?: boolean;
  colorColeira?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertGrooming?: boolean;
  colorGrooming?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertFood?: boolean;
  colorFood?: 'neutral' | 'ok' | 'warning' | 'critical';
  alertMedicacao?: boolean;
  colorMedicacao?: 'neutral' | 'ok' | 'warning' | 'critical';
  inactiveControls?: HomeInactiveEligibleControlId[];
  onDeactivateControl?: (controlId: HomeInactiveEligibleControlId) => void;
}

export function AppleControlButtons({
  onVacinasClick,
  onVermifugoClick,
  onAntipulgasClick,
  onColeiraClick,
  onDocumentosClick,
  onAlimentacaoClick,
  onBanhoTosaClick,
  onMedicacaoClick,
  alertVacinas,
  colorVacinas,
  alertVermifugo,
  colorVermifugo,
  alertAntipulgas,
  colorAntipulgas,
  alertColeira,
  colorColeira,
  alertGrooming,
  colorGrooming,
  alertFood,
  colorFood,
  alertMedicacao,
  colorMedicacao,
  inactiveControls = [],
  onDeactivateControl,
}: AppleControlButtonsProps) {

  const [showShoppingSheet, setShowShoppingSheet] = useState(false);
  const [showEmergencySheet, setShowEmergencySheet] = useState(false);

  const cardBaseClass = 'group relative overflow-hidden rounded-2xl px-3.5 py-3 h-[86px] border transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30';
  const iconWrapClass = 'absolute top-2.5 right-2.5 w-8.5 h-8.5 rounded-xl bg-white/95 ring-1 ring-slate-200/80 shadow-sm flex items-center justify-center pointer-events-none';
  const emojiIconClass = 'text-[22px] leading-none';
  const titleClass = 'text-[15px] font-bold font-outfit text-slate-900 leading-tight tracking-tight truncate';
  const descBaseClass = 'text-[11.5px] sm:text-[12.5px] mt-1 leading-[1.2] font-medium';
  const alertCardClass = 'bg-gradient-to-br from-rose-100 via-red-50 to-white border-red-300 border-l-4 border-l-red-600 shadow-[0_6px_16px_rgba(220,38,38,0.15)]';
  const okCardClass = 'bg-emerald-50/50 border-emerald-200 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md hover:border-emerald-300';
  const warningCardClass = 'bg-amber-50/60 border-amber-200 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md hover:border-amber-300';
  const neutralCardClass = 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 hover:bg-slate-50/40';
  const bluePremiumClass = 'bg-blue-100/70 border-blue-200 border-l-4 border-l-blue-600 shadow-sm hover:shadow-md hover:border-blue-300';
  const pardaPremiumClass = 'bg-amber-100/40 border-amber-200 border-l-4 border-l-amber-600/60 shadow-sm hover:shadow-md hover:border-amber-300';
  const inactiveSet = new Set<HomeInactiveEligibleControlId>(inactiveControls);
  const isEmptyCard = (color: typeof colorVacinas) => !color || color === 'neutral';

  const toneByStatus = (status: 'neutral' | 'ok' | 'warning' | 'critical' | undefined) => {
    if (status === 'critical') return alertCardClass;
    if (status === 'warning') return warningCardClass;
    if (status === 'ok') return okCardClass;
    return neutralCardClass;
  };

  const renderAlertBadge = (show?: boolean) => show ? (
    <span className="absolute left-2.5 top-2.5 z-[1] flex h-4 w-4 items-center justify-center">
      <span className="absolute inset-0 rounded-full bg-red-500/55 animate-ping motion-reduce:hidden" />
      <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white shadow-[0_3px_8px_rgba(220,38,38,0.28)] ring-1 ring-white animate-pulse motion-reduce:animate-none">
        !
      </span>
    </span>
  ) : null;

  const healthCards = [
    {
      id: 'vaccines' as const,
      title: 'Vacinas',
      description: isEmptyCard(colorVacinas) ? 'Sem registro' : 'Carteirinha Pet',
      isEmpty: isEmptyCard(colorVacinas),
      icon: '💉',
      onClick: onVacinasClick,
      alert: alertVacinas,
      toneClass: toneByStatus(colorVacinas),
    },
    {
      id: 'dewormer' as const,
      title: 'Vermífugo',
      description: isEmptyCard(colorVermifugo) ? 'Sem controle' : 'Vermes e Parasit.',
      isEmpty: isEmptyCard(colorVermifugo),
      icon: '🪱',
      onClick: onVermifugoClick,
      alert: alertVermifugo,
      toneClass: toneByStatus(colorVermifugo),
    },
    {
      id: 'flea_tick' as const,
      title: 'Antipulgas',
      description: isEmptyCard(colorAntipulgas) ? 'Sem controle' : 'Pulgas e Carr.',
      isEmpty: isEmptyCard(colorAntipulgas),
      icon: '🛡️',
      onClick: onAntipulgasClick,
      alert: alertAntipulgas,
      toneClass: toneByStatus(colorAntipulgas),
    },
    {
      id: 'collar' as const,
      title: 'Coleira',
      description: isEmptyCard(colorColeira) ? 'Sem controle' : 'Leish e Parasit.',
      isEmpty: isEmptyCard(colorColeira),
      icon: '📿',
      onClick: onColeiraClick,
      alert: alertColeira,
      toneClass: toneByStatus(colorColeira),
    },
    {
      id: 'medication' as const,
      title: 'Medicação',
      description: isEmptyCard(colorMedicacao) ? 'Sem tratamento' : colorMedicacao === 'ok' ? 'Em dia' : 'Pendente',
      isEmpty: isEmptyCard(colorMedicacao),
      icon: '💊',
      onClick: onMedicacaoClick ?? (() => {}),
      alert: alertMedicacao,
      toneClass: toneByStatus(colorMedicacao),
    },
    {
      id: 'food' as const,
      title: 'Alimentação',
      description: isEmptyCard(colorFood) ? 'Sem registro' : 'Ração e Compras',
      isEmpty: isEmptyCard(colorFood),
      icon: '🥣',
      onClick: onAlimentacaoClick ?? (() => {}),
      alert: alertFood,
      toneClass: toneByStatus(colorFood),
    },
  ];

  const utilityCards = [
    {
      id: 'documents' as const,
      title: 'Documentos',
      description: 'Guardar arquivos',
      isEmpty: false,
      icon: '📄',
      onClick: onDocumentosClick,
      toneClass: pardaPremiumClass,
    },
    {
      id: 'shopping' as const,
      title: 'Shopping',
      description: 'Petlove · Petz · Amazon',
      isEmpty: false,
      icon: '🛒',
      onClick: () => setShowShoppingSheet(true),
      toneClass: bluePremiumClass,
    },
  ];

  const activeHealthCards = healthCards.filter((card) => !inactiveSet.has(card.id as any));
  const activeUtilityCards = utilityCards.filter((card) => !inactiveSet.has(card.id as any));

  const renderHealthCard = (card: typeof healthCards[number]) => (
    <button
      key={card.id}
      onClick={card.onClick}
      onContextMenu={(e) => { e.preventDefault(); onDeactivateControl?.(card.id as any); }}
      onDoubleClick={() => onDeactivateControl?.(card.id as any)}
      className={`${cardBaseClass} ${card.toneClass}`}
    >
      {renderAlertBadge(card.alert)}
      <span className={iconWrapClass}><span className={emojiIconClass}>{card.icon}</span></span>
      <div className={`flex flex-col justify-center h-full pr-11 text-left ${card.alert ? 'pt-3' : ''}`}>
        <h3 className={titleClass}>{card.title}</h3>
        <p className={`${descBaseClass} ${card.alert ? 'text-red-700' : card.isEmpty ? 'text-slate-400' : 'text-slate-500'}`}>{card.description}</p>
      </div>
    </button>
  );

  const renderUtilityCard = (card: any) => (
    <button
      key={card.id}
      onClick={card.onClick}
      onContextMenu={(e) => { e.preventDefault(); onDeactivateControl?.(card.id as any); }}
      onDoubleClick={() => onDeactivateControl?.(card.id as any)}
      className={`${cardBaseClass} ${card.toneClass || neutralCardClass}`}
    >
      {renderAlertBadge(card.alert)}
      <span className={iconWrapClass}>
        <span className={emojiIconClass}>{card.icon}</span>
      </span>
      <div className={`flex flex-col justify-center h-full pr-11 text-left ${card.alert ? 'pt-3' : ''}`}>
        <h3 className={titleClass}>{card.title}</h3>
        <p className={`${descBaseClass} ${card.alert ? 'text-red-700' : card.isEmpty ? 'text-slate-400' : 'text-slate-500'} font-medium truncate`}>{card.description}</p>
      </div>
    </button>
  );

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 px-1 mb-3.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          <h4 className="text-[13px] font-black text-slate-900 uppercase tracking-wider">Saúde e Prevenção</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeHealthCards.map(renderHealthCard)}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 px-1 mb-3.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
          <h4 className="text-[13px] font-black text-slate-900 uppercase tracking-wider">Mais Recursos</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {activeUtilityCards.map(renderUtilityCard)}
        </div>
      </div>

      {/* ── Emergência Vet ── */}
      <button
        onClick={() => setShowEmergencySheet(true)}
        className="w-full flex items-center gap-3 px-3 py-2.5 h-[56px] rounded-2xl border border-red-200/80 bg-gradient-to-r from-red-50 to-rose-50/60 hover:from-red-100/70 hover:to-rose-100/60 active:scale-[0.99] transition-all duration-200 shadow-sm hover:shadow-md text-left mb-3"
      >
        <div className="w-8 h-8 rounded-xl bg-white/95 ring-1 ring-red-200 shadow-sm flex items-center justify-center flex-shrink-0">
          <span className="text-[18px] leading-none">🚨</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-red-900 leading-tight tracking-[-0.01em]">Emergência Vet</p>
          <p className="text-[12px] text-red-500 font-medium mt-0.5 leading-tight">Clínicas/Hosp 24h</p>
        </div>
        <svg className="w-4 h-4 text-red-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <HomeShoppingSheet open={showShoppingSheet} onClose={() => setShowShoppingSheet(false)} />
      <HomeEmergencySheet open={showEmergencySheet} onClose={() => setShowEmergencySheet(false)} />
    </>
  );
}