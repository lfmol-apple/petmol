'use client';

/**
 * PremiumButton — botão padrão com variantes.
 * Use dentro de painéis e formulários.
 */
import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface PremiumButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Ícone/emoji antes do texto */
  icon?: ReactNode;
  /** Ocupa 100% da largura */
  fullWidth?: boolean;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0056D2] hover:bg-[#0047ad] active:bg-[#003889] text-white font-semibold shadow-sm hover:shadow-md disabled:opacity-50',
  secondary:
    'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium disabled:opacity-50',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-[#0056D2] hover:text-[#0047ad] font-medium disabled:opacity-50',
  danger:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold shadow-sm hover:shadow-md disabled:opacity-50',
  success:
    'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold shadow-sm hover:shadow-md disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export function PremiumButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  children,
  disabled,
  className = '',
  ...props
}: PremiumButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="leading-none">{icon}</span>
      ) : null}
      {loading ? 'Aguarde...' : children}
    </button>
  );
}
