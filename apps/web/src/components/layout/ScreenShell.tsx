/**
 * ScreenShell - Container reutilizável para telas secundárias
 * 
 * Padroniza:
 * - Layout centralizado com padding consistente
 * - Card principal com bordas e sombras
 * - Header com título, subtítulo e área de ações
 * - Espaçamento uniforme
 */

import { ReactNode } from 'react';

interface ScreenShellProps {
  /** Título principal da tela */
  title: string;
  /** Subtítulo opcional (descrição ou contexto) */
  subtitle?: string;
  /** Botões ou ações no header (alinhados à direita) */
  actions?: ReactNode;
  /** Conteúdo principal */
  children: ReactNode;
  /** Classe CSS adicional para o container */
  className?: string;
  /** Classe CSS adicional para o card interno */
  cardClassName?: string;
}

export function ScreenShell({ 
  title, 
  subtitle, 
  actions, 
  children,
  className = '',
  cardClassName = ''
}: ScreenShellProps) {
  return (
    <div className={`w-full min-h-screen bg-gray-50 py-4 sm:py-6 px-3 sm:px-4 ${className}`}>
      {/* Container centralizado */}
      <div className="max-w-6xl mx-auto">
        {/* Card principal */}
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden ${cardClassName}`}>
          {/* Header */}
          <div className="border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {actions}
                </div>
              )}
            </div>
          </div>

          {/* Conteúdo */}
          <div className="p-4 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
