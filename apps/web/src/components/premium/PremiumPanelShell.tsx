'use client';

/**
 * PremiumPanelShell
 * Shell premium para PAINÉIS internos da Home (abas/formulários).
 * NÃO tem botão Voltar — é um painel dentro da Home, não uma tela separada.
 *
 * Fornece:
 * - Header do painel com ícone, título, subtítulo e ação opcional
 * - Área de conteúdo com espaçamento consistente
 * - Footer opcional com até 2 botões (Salvar / Cancelar)
 */
import { type ReactNode } from 'react';
import { tokens } from './premiumTokens';

interface PanelFooterAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface PremiumPanelShellProps {
  /** Título do painel */
  title: string;
  /** Ícone emoji exibido ao lado do título */
  icon?: string;
  /** Subtítulo (ex: nome do pet) */
  subtitle?: string;
  /** Elemento ao extremo direito do header (ex: badge, botão extra) */
  rightAction?: ReactNode;
  /** Botão principal no footer (ex: Salvar) */
  footerPrimary?: PanelFooterAction;
  /** Botão secundário no footer (ex: Cancelar) */
  footerSecondary?: PanelFooterAction;
  /** Classe CSS extra no wrapper */
  className?: string;
  children: ReactNode;
}

const footerVariantClasses: Record<'primary' | 'secondary' | 'danger', string> = {
  primary: tokens.btnPrimary,
  secondary: tokens.btnSecondary,
  danger:
    'w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
};

export function PremiumPanelShell({
  title,
  icon,
  subtitle,
  rightAction,
  footerPrimary,
  footerSecondary,
  className = '',
  children,
}: PremiumPanelShellProps) {
  const hasFooter = footerPrimary || footerSecondary;

  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl shadow-md ${className}`}
    >
      {/* ── Header do painel ── */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 bg-gradient-to-r from-[#0056D2] to-indigo-600 rounded-t-2xl">
        <div className="flex items-center gap-3 min-w-0">
          {icon && (
            <span className="text-2xl flex-shrink-0 leading-none drop-shadow-sm">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white leading-tight truncate drop-shadow-sm">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-blue-100 leading-tight mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {rightAction && (
          <div className="flex-shrink-0 ml-3">{rightAction}</div>
        )}
      </div>

      {/* ── Conteúdo ── */}
      <div className="p-4 sm:p-5 min-w-0">
        {children}
      </div>

      {/* ── Footer com botões ── */}
      {hasFooter && (
        <div
          className="px-4 sm:px-5 pt-2 flex flex-col sm:flex-row gap-3 border-t border-slate-100 bg-slate-50/50"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {footerSecondary && (
            <button
              onClick={footerSecondary.onClick}
              disabled={footerSecondary.disabled || footerSecondary.loading}
              className={footerVariantClasses[footerSecondary.variant ?? 'secondary']}
            >
              {footerSecondary.loading ? 'Aguarde...' : footerSecondary.label}
            </button>
          )}
          {footerPrimary && (
            <button
              onClick={footerPrimary.onClick}
              disabled={footerPrimary.disabled || footerPrimary.loading}
              className={footerVariantClasses[footerPrimary.variant ?? 'primary']}
            >
              {footerPrimary.loading ? 'Salvando...' : footerPrimary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
