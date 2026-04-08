'use client';

/**
 * ResponsivePanel
 * Painel de conteúdo otimizado para mobile-first.
 *
 * - No mobile:  largura 100%, sem scroll horizontal, 1 coluna implícita
 * - No desktop: max-w-3xl centralizado, sem limite de altura
 * - Scroll:     somente vertical, gerenciado pelo pai (overflow-y-auto no modal)
 * - Footer:     sticky interno com safe-area iOS (env(safe-area-inset-bottom))
 */
import { type ReactNode } from 'react';

interface PanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

interface ResponsivePanelProps {
  title?: string;
  icon?: string;
  subtitle?: string;
  /** Elemento posicionado à direita do header (ex: toggle) */
  rightAction?: ReactNode;
  /** Botão principal do footer (ex: Salvar) */
  footerPrimary?: PanelAction;
  /** Botão secundário do footer (ex: Cancelar) */
  footerSecondary?: PanelAction;
  className?: string;
  children: ReactNode;
}

const variantClass: Record<'primary' | 'secondary' | 'danger', string> = {
  primary:
    'w-full bg-[#0056D2] hover:bg-[#0047ad] active:bg-[#003889] text-white font-bold py-3 px-6 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'w-full bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold py-3 px-6 rounded-xl border border-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed',
};

export function ResponsivePanel({
  title,
  icon,
  subtitle,
  rightAction,
  footerPrimary,
  footerSecondary,
  className = '',
  children,
}: ResponsivePanelProps) {
  const hasHeader = title || icon || subtitle || rightAction;
  const hasFooter = footerPrimary || footerSecondary;

  return (
    <div
      className={`
        w-full max-w-3xl mx-auto
        bg-white border border-slate-200 rounded-2xl shadow-sm
        overflow-x-hidden
        flex flex-col
        ${className}
      `}
    >
      {/* ── Header ── */}
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {icon && (
              <span className="text-2xl flex-shrink-0 leading-none">{icon}</span>
            )}
            <div className="min-w-0">
              {title && (
                <h2 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 leading-tight mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {rightAction && (
            <div className="flex-shrink-0 ml-2">{rightAction}</div>
          )}
        </div>
      )}

      {/* ── Conteúdo scrollável ── */}
      <div className="flex-1 p-4 sm:p-5 overflow-x-hidden min-w-0">
        {children}
      </div>

      {/* ── Footer sticky com safe-area iOS ── */}
      {hasFooter && (
        <div
          className="flex flex-col sm:flex-row gap-2 sm:gap-3 px-4 sm:px-5 pt-3 border-t border-slate-100 bg-slate-50/50 flex-shrink-0"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {footerSecondary && (
            <button
              type="button"
              onClick={footerSecondary.onClick}
              disabled={footerSecondary.disabled || footerSecondary.loading}
              className={variantClass[footerSecondary.variant ?? 'secondary']}
            >
              {footerSecondary.loading ? 'Aguarde...' : footerSecondary.label}
            </button>
          )}
          {footerPrimary && (
            <button
              type="button"
              onClick={footerPrimary.onClick}
              disabled={footerPrimary.disabled || footerPrimary.loading}
              className={variantClass[footerPrimary.variant ?? 'primary']}
            >
              {footerPrimary.loading ? 'Salvando...' : footerPrimary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
