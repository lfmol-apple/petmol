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

  const cardBaseClass = 'group relative overflow-hidden rounded-2xl px-3.5 py-2.5 h-[80px] border transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30';
  const iconWrapClass = 'absolute top-2 right-2 w-8 h-8 rounded-xl bg-white/95 ring-1 ring-slate-200/80 shadow-sm flex items-center justify-center pointer-events-none';
  const emojiIconClass = 'text-[20px] leading-none';
  const titleClass = 'text-[15px] font-bold font-outfit text-slate-900 leading-tight tracking-tight truncate';
  const descBaseClass = 'text-[13px] truncate mt-0.5 leading-tight font-medium';
  const alertCardClass = 'bg-gradient-to-br from-rose-100 via-red-50 to-white border-red-300 border-l-4 border-l-red-600 shadow-[0_6px_16px_rgba(220,38,38,0.15)]';
  const okCardClass = 'bg-emerald-50/50 border-emerald-200 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md hover:border-emerald-300';
  const warningCardClass = 'bg-amber-50/60 border-amber-200 border-l-4 border-l-amber-500 shadow-sm hover:shadow-md hover:border-amber-300';
  const neutralCardClass = 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 hover:bg-slate-50/40';
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

  const dockableCards = [
    {
      id: 'vaccines' as const,
      title: 'Vacinas',
      description: isEmptyCard(colorVacinas) ? 'Sem registros — toque para iniciar' : 'Carteira e lembretes',
      isEmpty: isEmptyCard(colorVacinas),
      icon: '💉',
      onClick: onVacinasClick,
      alert: alertVacinas,
      toneClass: toneByStatus(colorVacinas),
    },
    {
      id: 'dewormer' as const,
      title: 'Vermífugo',
      description: isEmptyCard(colorVermifugo) ? 'Sem controle — registrar agora' : 'Controle de vermes',
      isEmpty: isEmptyCard(colorVermifugo),
      icon: '🪱',
      onClick: onVermifugoClick,
      alert: alertVermifugo,
      toneClass: toneByStatus(colorVermifugo),
    },
    {
      id: 'flea_tick' as const,
      title: 'Antipulgas',
      description: isEmptyCard(colorAntipulgas) ? 'Sem controle — registrar agora' : 'Pulgas e carrapatos',
      isEmpty: isEmptyCard(colorAntipulgas),
      icon: '🛡️',
      onClick: onAntipulgasClick,
      alert: alertAntipulgas,
      toneClass: toneByStatus(colorAntipulgas),
    },
    {
      id: 'shopping' as const,
      title: 'Shopping',
      description: 'Cobasi · Petz · Petlove',
      isEmpty: false,
      icon: '🛒',
      onClick: () => setShowShoppingSheet(true),
      alert: false,
      toneClass: 'bg-blue-50 border-blue-200 border-l-4 border-l-[#0056D2] shadow-sm hover:shadow-md hover:bg-blue-100/60 hover:border-blue-300',
    },
    {
      id: 'food' as const,
      title: 'Alimentação',
      description: isEmptyCard(colorFood) ? 'Sem plano — configurar agora' : 'Ração e recompra',
      isEmpty: isEmptyCard(colorFood),
      icon: '🥣',
      onClick: onAlimentacaoClick ?? (() => {}),
      alert: alertFood,
      toneClass: toneByStatus(colorFood),
    },
    // V-L: Banho/Tosa removido da superfície de lançamento (V1)
    // V-L: Medicação movida para posição estática (abaixo de Documentos), Shopping assume posição V-line
  ];

  const activeDockableCards = dockableCards.filter((card) => !inactiveSet.has(card.id as any));

  const renderDockableCard = (card: typeof dockableCards[number]) => (
    <button
      key={card.id}
      onClick={() => {
        card.onClick?.();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onDeactivateControl?.(card.id as any);
      }}
      onDoubleClick={() => {
        onDeactivateControl?.(card.id as any);
      }}
      className={`${cardBaseClass} ${card.toneClass}`}
    >
      {renderAlertBadge(card.alert)}
      <span className={iconWrapClass}><span className={emojiIconClass}>{card.icon}</span></span>
      <div className={`flex flex-col justify-center h-full pr-9 text-left ${card.alert ? 'pt-3' : ''}`}>
        <h3 className={titleClass}>{card.title}</h3>
        <p className={`${descBaseClass} ${card.alert ? 'text-red-700' : card.isEmpty ? 'text-slate-400' : 'text-slate-500'}`}>{card.description}</p>
      </div>
    </button>
  );

  return (
    <>
      {/* Grade 2 colunas */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {activeDockableCards.map(renderDockableCard)}

        {/* COLEIRA (LEISHMANIOSE) — Nova posição fixa sugerida pelo usuário */}
        <button
          onClick={onColeiraClick}
          onContextMenu={(e) => { e.preventDefault(); onDeactivateControl?.('collar'); }}
          onDoubleClick={() => onDeactivateControl?.('collar')}
          className={`${cardBaseClass} ${toneByStatus(colorColeira)}`}
        >
          {renderAlertBadge(alertColeira)}
          <span className={iconWrapClass}><span className={emojiIconClass}>📿</span></span>
          <div className={`flex flex-col justify-center h-full pr-9 text-left ${alertColeira ? 'pt-3' : ''}`}>
            <h3 className={titleClass}>Coleira (Leish)</h3>
            <p className={`${descBaseClass} ${alertColeira ? 'text-red-700' : isEmptyCard(colorColeira) ? 'text-slate-400' : 'text-slate-500'}`}>
              Leishmaniose e parasitas
            </p>
          </div>
        </button>

        {/* DOCUMENTOS */}
        <button
          onClick={onDocumentosClick}
          className={`${cardBaseClass} ${neutralCardClass}`}
        >
          <span className={iconWrapClass}><span className={emojiIconClass}>📄</span></span>
          <div className="flex flex-col justify-center h-full pr-9 text-left">
            <h3 className={titleClass}>Documentos</h3>
            <p className={`${descBaseClass} text-slate-500`}>Guardar arquivos</p>
          </div>
        </button>

        {/* MEDICAÇÃO — posição anterior de Shopping, com alerta e desativação */}
        {!inactiveSet.has('medication') && (
          <button
            onClick={onMedicacaoClick ?? (() => {})}
            onContextMenu={(e) => { e.preventDefault(); onDeactivateControl?.('medication'); }}
            onDoubleClick={() => onDeactivateControl?.('medication')}
            className={`${cardBaseClass} ${toneByStatus(colorMedicacao)}`}
          >
            {renderAlertBadge(alertMedicacao)}
            <span className={iconWrapClass}><span className={emojiIconClass}>💊</span></span>
            <div className={`flex flex-col justify-center h-full pr-9 text-left ${alertMedicacao ? 'pt-3' : ''}`}>
              <h3 className={titleClass}>Medicação</h3>
              <p className={`${descBaseClass} ${alertMedicacao ? 'text-red-700' : isEmptyCard(colorMedicacao) ? 'text-slate-400' : 'text-slate-500'}`}>
                {isEmptyCard(colorMedicacao) ? 'Sem tratamentos ativos' : colorMedicacao === 'ok' ? 'Em dia hoje ✓' : 'Doses pendentes hoje'}
              </p>
            </div>
          </button>
        )}
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