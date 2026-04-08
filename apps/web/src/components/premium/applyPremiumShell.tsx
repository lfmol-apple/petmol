'use client';

/**
 * applyPremiumShell
 * Helper convenience wrapper around PremiumScreenShell.
 * Usar em telas secundárias (nunca na home).
 *
 * Garante visual premium consistente:
 * - Header com título / subtítulo / botão Voltar
 * - Footer sticky com até 2 CTAs
 * - Estado de loading (skeleton com card)
 * - Estado de vazio (PremiumEmptyState)
 * - Estado de erro (PremiumCard variant="warning")
 */

import { type ReactNode } from 'react';
import { PremiumScreenShell } from './PremiumScreenShell';
import { PremiumCard } from './PremiumCard';
import { PremiumEmptyState } from './PremiumEmptyState';

interface FooterAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}

interface EmptyAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ApplyPremiumShellProps {
  title: string;
  subtitle?: string;
  rightAction?: ReactNode;
  footerPrimary?: FooterAction;
  footerSecondary?: FooterAction;
  hideBack?: boolean;
  backHref?: string;

  /** Estado de carregamento — exibe skeleton/spinner */
  isLoading?: boolean;

  /** Estado de erro — exibe card warning com mensagem */
  errorMessage?: string | null;

  /** Estado vazio — configurar para exibir PremiumEmptyState */
  empty?: {
    icon?: string;
    title: string;
    description?: string;
    primaryAction?: EmptyAction;
    secondaryAction?: EmptyAction;
  };

  children: ReactNode;
}

/**
 * Componente de estado de loading padrão.
 */
function LoadingShell({ title }: { title: string }) {
  return (
    <PremiumScreenShell title={title} hideBack={false}>
      <div className="px-4 py-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    </PremiumScreenShell>
  );
}

/**
 * Componente de estado de erro padrão.
 */
function ErrorShell({ title, message }: { title: string; message: string }) {
  return (
    <PremiumScreenShell title={title}>
      <div className="px-4 py-6">
        <PremiumCard variant="warning">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800 mb-1">Algo deu errado</p>
              <p className="text-sm text-amber-700">{message}</p>
            </div>
          </div>
        </PremiumCard>
      </div>
    </PremiumScreenShell>
  );
}

/**
 * Wrapper principal premium para qualquer tela secundária.
 */
export function ApplyPremiumShell({
  title,
  subtitle,
  rightAction,
  footerPrimary,
  footerSecondary,
  hideBack = false,
  backHref,
  isLoading,
  errorMessage,
  empty,
  children,
}: ApplyPremiumShellProps) {
  if (isLoading) {
    return <LoadingShell title={title} />;
  }

  if (errorMessage) {
    return <ErrorShell title={title} message={errorMessage} />;
  }

  return (
    <PremiumScreenShell
      title={title}
      subtitle={subtitle}
      rightAction={rightAction}
      footerPrimary={footerPrimary}
      footerSecondary={footerSecondary}
      hideBack={hideBack}
      backHref={backHref}
    >
      {empty ? (
        <PremiumEmptyState
          icon={empty.icon}
          title={empty.title}
          description={empty.description}
          primaryAction={empty.primaryAction}
          secondaryAction={empty.secondaryAction}
        />
      ) : (
        children
      )}
    </PremiumScreenShell>
  );
}
