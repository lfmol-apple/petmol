/**
 * Componentes base de UI reutilizáveis
 * 
 * - PrimaryButton: Botão de ação principal
 * - SecondaryButton: Botão de ação secundária
 * - Field: Input com label, helper text e mensagem de erro
 * - LoadingSpinner: Indicador de carregamento simples
 */

import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

// ─── Buttons ─────────────────────────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function PrimaryButton({ 
  children, 
  loading, 
  icon, 
  fullWidth,
  className = '', 
  disabled,
  ...props 
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 
        px-4 sm:px-5 py-2.5 sm:py-3 
        bg-gradient-to-r from-[#0056D2] to-[#0047ad] 
        hover:from-[#0047ad] hover:to-[#003889]
        text-white font-semibold rounded-xl 
        shadow-sm hover:shadow-md
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-95
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner size="sm" />
          <span>Processando...</span>
        </>
      ) : (
        <>
          {icon && <span className="text-lg">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}

export function SecondaryButton({ 
  children, 
  loading, 
  icon, 
  fullWidth,
  className = '', 
  disabled,
  ...props 
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 
        px-4 sm:px-5 py-2.5 sm:py-3 
        bg-white hover:bg-gray-50
        text-gray-700 font-semibold rounded-xl 
        border-2 border-gray-200 hover:border-gray-300
        shadow-sm hover:shadow-md
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-95
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner size="sm" />
          <span>Processando...</span>
        </>
      ) : (
        <>
          {icon && <span className="text-lg">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}

export function DangerButton({ 
  children, 
  loading, 
  icon, 
  fullWidth,
  className = '', 
  disabled,
  ...props 
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 
        px-4 sm:px-5 py-2.5 sm:py-3 
        bg-gradient-to-r from-red-600 to-red-700 
        hover:from-red-700 hover:to-red-800
        text-white font-semibold rounded-xl 
        shadow-sm hover:shadow-md
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-95
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <>
          <LoadingSpinner size="sm" color="white" />
          <span>Processando...</span>
        </>
      ) : (
        <>
          {icon && <span className="text-lg">{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}

// ─── Field (Input with label) ────────────────────────────────────────────────

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  containerClassName?: string;
}

export function Field({ 
  label, 
  helperText, 
  error, 
  containerClassName = '',
  className = '',
  ...props 
}: FieldProps) {
  const hasError = !!error;

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        className={`
          w-full px-3 sm:px-4 py-2.5 
          border rounded-xl
          text-sm sm:text-base
          focus:outline-none focus:ring-2 
          transition-all duration-200
          disabled:bg-gray-50 disabled:cursor-not-allowed
          ${hasError 
            ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
            : 'border-gray-200 focus:border-[#0056D2] focus:ring-blue-200'
          }
          ${className}
        `}
        {...props}
      />
      {helperText && !error && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <span>⚠️</span>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Textarea Field ─────────────────────────────────────────────────────────

interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helperText?: string;
  error?: string;
  containerClassName?: string;
}

export function TextareaField({ 
  label, 
  helperText, 
  error, 
  containerClassName = '',
  className = '',
  ...props 
}: TextareaFieldProps) {
  const hasError = !!error;

  return (
    <div className={`space-y-1.5 ${containerClassName}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {props.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        className={`
          w-full px-3 sm:px-4 py-2.5 
          border rounded-xl
          text-sm sm:text-base
          focus:outline-none focus:ring-2 
          transition-all duration-200
          disabled:bg-gray-50 disabled:cursor-not-allowed
          resize-none
          ${hasError 
            ? 'border-red-300 focus:border-red-500 focus:ring-red-200' 
            : 'border-gray-200 focus:border-[#0056D2] focus:ring-blue-200'
          }
          ${className}
        `}
        {...props}
      />
      {helperText && !error && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <span>⚠️</span>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Loading Spinner ────────────────────────────────────────────────────────

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export function LoadingSpinner({ size = 'md', color = 'blue' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const colorClasses = color === 'white' ? 'border-white' : 'border-[#0056D2]';

  return (
    <div
      className={`
        ${sizeClasses[size]} 
        border-2 ${colorClasses} border-t-transparent 
        rounded-full animate-spin
      `}
      role="status"
      aria-label="Carregando"
    />
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-6xl mb-4 opacity-50">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-gray-600 mb-6 max-w-md">{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
