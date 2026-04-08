'use client';
/**
 * features/shared/components/SeverityBadge.tsx
 * Componente de badge de severidade compartilhado entre features.
 *
 * Usa a severidade canônica de interações (InteractionSeverity),
 * alinhada ao modelo factual de CanonicalPetEvent.
 */

import type { InteractionSeverity } from '@/features/interactions/types';

// --------------------------------------------------------------------------
// SeverityDot — bolinha colorida de status
// --------------------------------------------------------------------------

const dotColor: Record<InteractionSeverity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
};

interface SeverityDotProps {
  severity: InteractionSeverity;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SeverityDot({ severity, size = 'sm', className = '' }: SeverityDotProps) {
  const sz = size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${sz} ${dotColor[severity]} ${className}`}
    />
  );
}

// --------------------------------------------------------------------------
// SeverityBadge — tag com texto e cor
// --------------------------------------------------------------------------

const badgeStyle: Record<InteractionSeverity, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  info: 'bg-blue-50 text-blue-600 border border-blue-200',
};

const badgeLabel: Record<InteractionSeverity, string> = {
  critical: 'Crítico',
  warning: 'Atenção',
  info: 'Info',
};

interface SeverityBadgeProps {
  severity: InteractionSeverity;
  className?: string;
}

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyle[severity]} ${className}`}
    >
      <SeverityDot severity={severity} />
      {badgeLabel[severity]}
    </span>
  );
}
