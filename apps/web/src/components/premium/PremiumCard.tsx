'use client';

/**
 * PremiumCard — card padrão com variantes.
 * NÃO usar na home/page.tsx.
 */
import { type ReactNode, type CSSProperties } from 'react';
import { tokens } from './premiumTokens';

type Variant = 'default' | 'subtle' | 'warning' | 'info' | 'success';

interface PremiumCardProps {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  style?: CSSProperties;
  /** Se fornecido, renderiza como botão clicável */
  onClick?: () => void;
  /** Título optional com borda inferior */
  title?: string;
  /** Ícone ao lado do título */
  titleIcon?: string;
}

const variantClasses: Record<Variant, string> = {
  default: `${tokens.cardBg} ${tokens.cardBorder} ${tokens.cardShadow}`,
  subtle: 'bg-slate-50 border border-slate-100',
  warning: 'bg-amber-50 border border-amber-200',
  info: 'bg-blue-50 border border-blue-200',
  success: 'bg-green-50 border border-green-200',
};

export function PremiumCard({
  children,
  variant = 'default',
  className = '',
  style,
  onClick,
  title,
  titleIcon,
}: PremiumCardProps) {
  const base = `${variantClasses[variant]} ${tokens.cardRadius} ${tokens.cardPadding} ${className}`;

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} w-full text-left hover:shadow-md active:scale-[0.99] transition-all`}
        style={style}
      >
        {title && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
            {titleIcon && <span className="text-lg">{titleIcon}</span>}
            <span className={tokens.cardTitle}>{title}</span>
          </div>
        )}
        {children}
      </button>
    );
  }

  return (
    <div className={base} style={style}>
      {title && (
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          {titleIcon && <span className="text-lg">{titleIcon}</span>}
          <span className={tokens.cardTitle}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );
}
