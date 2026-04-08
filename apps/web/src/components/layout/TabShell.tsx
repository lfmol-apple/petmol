/**
 * TabShell - Container para conteúdo de tabs dentro de modais ou seções
 * 
 * Versão simplificada do ScreenShell para uso em contextos onde já existe um container pai.
 * Ideal para tabs em modais, seções aninhadas, etc.
 */

import { ReactNode } from 'react';

interface TabShellProps {
  /** Título da seção (opcional se já houver no header do modal) */
  title?: string;
  /** Descrição ou contexto */
  description?: string;
  /** Botões ou ações no header */
  actions?: ReactNode;
  /** Conteúdo principal */
  children: ReactNode;
  /** Classe CSS adicional */
  className?: string;
}

export function TabShell({ 
  title, 
  description, 
  actions, 
  children,
  className = ''
}: TabShellProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header opcional (se a tab precisar de título próprio) */}
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 pb-2 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-gray-600">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Conteúdo */}
      {children}
    </div>
  );
}
