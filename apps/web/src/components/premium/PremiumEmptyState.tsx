'use client';

/**
 * PremiumEmptyState — estado vazio humanizado.
 * NÃO usar na home/page.tsx.
 */
import Link from 'next/link';
import { tokens } from './premiumTokens';

interface EmptyAction {
  label: string;
  /** Usar href OU onClick (não ambos) */
  href?: string;
  onClick?: () => void;
}

interface PremiumEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  /** Botão de ação principal */
  primaryAction?: EmptyAction;
  /** Link secundário "fazer depois" */
  secondaryAction?: EmptyAction;
}

function ActionEl({ action, className }: { action: EmptyAction; className: string }) {
  if (action.href) {
    return <Link href={action.href} className={className}>{action.label}</Link>;
  }
  return (
    <button onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export function PremiumEmptyState({
  icon = '📭',
  title,
  description,
  primaryAction,
  secondaryAction,
}: PremiumEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-6xl mb-4 opacity-70">{icon}</div>
      <h3 className="text-lg font-semibold text-slate-700 mb-2">{title}</h3>
      {description && (
        <p className={`${tokens.cardBody} max-w-xs mb-6`}>{description}</p>
      )}
      {primaryAction && (
        <ActionEl action={primaryAction} className={`${tokens.btnPrimary} max-w-xs mb-3`} />
      )}
      {secondaryAction && (
        <ActionEl action={secondaryAction} className={tokens.btnGhost} />
      )}
    </div>
  );
}
