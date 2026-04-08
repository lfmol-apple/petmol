/**
 * Local civil calendar (YYYY-MM-DD) vs UTC instants.
 *
 * Never use toISOString().split('T')[0] or slice(0,10) for "today" or day-based logic:
 * that is the UTC calendar date and shifts the civil day in most timezones.
 */

export function dateToLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTodayISO(): string {
  return dateToLocalISO(new Date());
}

/** Parse YYYY-MM-DD (or prefix) as local calendar midnight. */
export function parseLocalDateOnly(yyyyMmDd: string): Date {
  const s = yyyyMmDd.trim().split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

/** Display a date-only string in the user's locale without UTC midnight shift. */
export function formatLocalDateOnly(
  yyyyMmDd: string,
  locale = 'pt-BR',
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = parseLocalDateOnly(yyyyMmDd);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return d.toLocaleDateString(locale, options ?? { day: '2-digit', month: 'short', year: 'numeric' });
}
