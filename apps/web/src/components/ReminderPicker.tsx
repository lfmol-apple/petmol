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
    <div className="rounded-[20px] border border-[#d9e6f7] bg-[#eef4fb] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      {label && (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[15px] shadow-[0_1px_2px_rgba(15,23,42,0.08)]">🔔</span>
        <span className="font-medium text-slate-600">Lembrar</span>

        <div className="flex h-11 items-center overflow-hidden rounded-xl border border-[#bfd4f3] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <button
            type="button"
            onClick={() => updateDays(parsedDays - 1)}
            className="flex h-full w-9 items-center justify-center border-r border-slate-100 text-base font-medium text-slate-500 transition-colors hover:bg-slate-50 active:scale-95"
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
            className="w-12 bg-transparent text-center text-lg font-semibold text-slate-800 outline-none"
          />
          <button
            type="button"
            onClick={() => updateDays(parsedDays + 1)}
            className="flex h-full w-9 items-center justify-center border-l border-slate-100 text-base font-medium text-slate-500 transition-colors hover:bg-slate-50 active:scale-95"
            aria-label="Aumentar dias do lembrete"
          >
            +
          </button>
        </div>

        <span className="font-medium text-slate-600">dias antes às</span>

        <div className="flex h-11 min-w-[122px] items-center gap-2 rounded-xl border border-[#bfd4f3] bg-white px-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <span className="text-[14px] text-slate-500">◔</span>
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-full bg-transparent text-base font-semibold text-slate-800 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
