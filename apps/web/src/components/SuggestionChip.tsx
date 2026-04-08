/**
 * SuggestionChip – exibe a sugestão canônica com opções de aceitar/rejeitar.
 *
 * Props:
 *   suggestion    – resultado de useSuggest
 *   loading       – boolean (mostra spinner sutil)
 *   onApply(canonical, code) – callback quando usuário aceita
 *   onDismiss()   – callback quando usuário rejeita
 *   className     – classes extras para o wrapper
 */

'use client';

import type { SuggestionResult } from '@/hooks/useSuggest';

interface Props {
  suggestion: SuggestionResult | null;
  loading?: boolean;
  onApply: (canonical: string, code: string | null) => void;
  onDismiss: () => void;
  className?: string;
}

/** Largura da barra de confiança (visual) */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.95 ? 'bg-emerald-500' :
    value >= 0.80 ? 'bg-blue-500' :
    'bg-amber-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-400">{pct}%</span>
    </div>
  );
}

export function SuggestionChip({
  suggestion,
  loading = false,
  onApply,
  onDismiss,
  className = '',
}: Props) {
  // Loading indicator (subtle spinner)
  if (loading && !suggestion) {
    return (
      <div className={`flex items-center gap-1.5 text-xs text-gray-400 mt-1 ${className}`}>
        <span className="inline-block w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
        <span>Verificando catálogo…</span>
      </div>
    );
  }

  if (!suggestion || !suggestion.canonical) return null;

  const methodLabel = suggestion.method === 'dictionary' ? 'catálogo' : 'similar';
  const isHighConfidence = suggestion.confidence >= 0.95;

  return (
    <div
      className={`mt-1.5 rounded-xl border px-3 py-2 text-xs flex flex-col gap-1.5
        ${isHighConfidence
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-blue-200 bg-blue-50'}
        ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`font-semibold ${isHighConfidence ? 'text-emerald-700' : 'text-[#0047ad]'}`}>
          💡 Sugestão ({methodLabel}):
        </span>
        <span className={`font-bold ${isHighConfidence ? 'text-emerald-900' : 'text-blue-900'}`}>
          {suggestion.canonical}
        </span>
        <ConfidenceBar value={suggestion.confidence} />
      </div>

      {/* Alternativas (compacto, só se > 1 candidato) */}
      {suggestion.candidates.length > 1 && (
        <div className="text-gray-500 text-[10px]">
          Outros: {suggestion.candidates.slice(1, 3).map(c => c.canonical).join(', ')}
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 mt-0.5">
        <button
          type="button"
          onClick={() => onApply(suggestion.canonical!, suggestion.code)}
          className={`px-2.5 py-1 rounded-lg text-white text-xs font-semibold transition-all active:scale-95
            ${isHighConfidence
              ? 'bg-emerald-500 hover:bg-emerald-600'
              : 'bg-blue-500 hover:bg-[#0056D2]'}`}
        >
          ✓ Aplicar
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 text-xs hover:bg-gray-100 transition-all active:scale-95"
        >
          Manter como digitado
        </button>
      </div>
    </div>
  );
}
