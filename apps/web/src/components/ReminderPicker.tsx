'use client';

interface ReminderPickerProps {
  days: string;
  time: string;
  onDaysChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  label?: string;
}

/**
 * Compact inline reminder configurator.
 * Shows: 🔔 Lembrar [X] dias antes às [HH:MM]
 * Default: 3 dias antes às 09:00
 */
export function ReminderPicker({
  days,
  time,
  onDaysChange,
  onTimeChange,
  label,
}: ReminderPickerProps) {
  const parsedDays = Number.isFinite(Number(days)) ? Number(days) : 0;

  const updateDays = (next: number) => {
    const bounded = Math.min(30, Math.max(0, next));
    onDaysChange(String(bounded));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-3 py-3 shadow-sm">
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      )}
      <div className="mb-3 flex items-start gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-base shadow-inner">🔔</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">Lembrete de reposição</p>
          <p className="text-xs leading-relaxed text-slate-500">Escolha quantos dias antes e em qual horário o aviso deve aparecer.</p>
        </div>
      </div>

      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2.5">
        <div className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Dias antes</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateDays(parsedDays - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base font-bold text-slate-600 transition-colors hover:bg-slate-100 active:scale-95"
              aria-label="Diminuir dias do lembrete"
            >
              -
            </button>
            <input
              type="number"
              min="0"
              max="30"
              value={days}
              onChange={(e) => onDaysChange(e.target.value)}
              className="w-full text-center text-base font-bold text-slate-800 outline-none"
            />
            <button
              type="button"
              onClick={() => updateDays(parsedDays + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-base font-bold text-slate-600 transition-colors hover:bg-slate-100 active:scale-95"
              aria-label="Aumentar dias do lembrete"
            >
              +
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Horário</p>
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
            <span className="text-sm">🕘</span>
            <input
              type="time"
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
              className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
