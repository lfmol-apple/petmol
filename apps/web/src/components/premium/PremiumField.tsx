'use client';

/**
 * PremiumField — wrapper premium para campos de formulário.
 * Envolve qualquer input/select/textarea com label, helper e error.
 */
import { type ReactNode } from 'react';
import { tokens } from './premiumTokens';

interface PremiumFieldProps {
  /** Label do campo */
  label: string;
  /** Texto de ajuda abaixo do campo */
  helper?: string;
  /** Mensagem de erro (substitui helper quando presente) */
  error?: string;
  /** htmlFor — liga o label ao input */
  htmlFor?: string;
  /** Obrigatório */
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function PremiumField({
  label,
  helper,
  error,
  htmlFor,
  required,
  children,
  className = '',
}: PremiumFieldProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold text-slate-700 uppercase tracking-wide"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      ) : helper ? (
        <p className="text-xs text-slate-500 leading-relaxed">{helper}</p>
      ) : null}
    </div>
  );
}

/**
 * Estilos prontos para inputs comuns (reutilizável em className do input)
 */
export const premiumInputClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0056D2] focus:border-[#0056D2] transition-all bg-slate-50 focus:bg-white';

export const premiumSelectClass =
  'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0056D2] focus:border-[#0056D2] transition-all bg-slate-50 focus:bg-white appearance-none';
