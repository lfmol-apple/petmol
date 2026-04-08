/**
 * features/shared/hooks/useFormattedDate.ts
 * Hook utilitário de formatação de datas — compartilhado entre features.
 *
 * Centraliza o parse de datas ISO e de datas sem hora ("YYYY-MM-DD"),
 * tratando-as como datas locais (sem UTC shift).
 */

import { useCallback } from 'react';

export function useFormattedDate(locale = 'pt-BR') {
  /** Parse seguro: "YYYY-MM-DD" → data local; ISO completo → data UTC */
  const parseDate = useCallback((dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }, []);

  /** Formata data com opções Intl.DateTimeFormat */
  const format = useCallback(
    (dateStr: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string => {
      const d = parseDate(dateStr);
      if (!d) return '—';
      return d.toLocaleDateString(locale, opts ?? { day: '2-digit', month: 'short', year: 'numeric' });
    },
    [locale, parseDate],
  );

  /** Formato curto: "12 mar" */
  const formatShort = useCallback(
    (dateStr: string | null | undefined): string =>
      format(dateStr, { day: '2-digit', month: 'short' }),
    [format],
  );

  /** Dias a partir de hoje (negativo = passado) */
  const daysFromNow = useCallback(
    (dateStr: string | null | undefined): number | null => {
      const d = parseDate(dateStr);
      if (!d) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
    },
    [parseDate],
  );

  return { parseDate, format, formatShort, daysFromNow };
}
