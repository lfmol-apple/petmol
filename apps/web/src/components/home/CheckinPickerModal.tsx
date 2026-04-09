'use client';
import { ModalPortal } from '@/components/ModalPortal';

interface CheckinPickerModalProps {
  showCheckinPicker: boolean;
  setShowCheckinPicker: (value: boolean) => void;
  petName?: string;
  checkinDayDraft: number;
  setCheckinDayDraft: (value: number) => void;
  checkinPickerSaving: boolean;
  onConfirm: () => void | Promise<void>;
}

export function CheckinPickerModal({
  showCheckinPicker,
  setShowCheckinPicker,
  petName,
  checkinDayDraft,
  setCheckinDayDraft,
  checkinPickerSaving,
  onConfirm,
}: CheckinPickerModalProps) {
  if (!showCheckinPicker) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowCheckinPicker(false);
      }}
    >
      <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">🗓</span>
              <h3 className="text-base font-bold text-gray-800">Check-in mensal</h3>
            </div>
            <button
              onClick={() => setShowCheckinPicker(false)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Neste dia todo mês o sistema envia uma notificação para você atualizar os dados de saúde de {petName}. Escolha o melhor dia:
          </p>
        </div>

        <div className="px-5 pb-4">
          <>
            <p className="text-center text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">{monthNames[month]} {year}</p>
            <div className="grid grid-cols-7 mb-1">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => (
                <div key={index} className="text-center text-[10px] font-bold text-gray-400">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, index) => day === null ? (
                <div key={index} />
              ) : (
                <button
                  key={index}
                  onClick={() => setCheckinDayDraft(day)}
                  className={`aspect-square rounded-xl text-sm font-bold transition-all active:scale-90 ${
                    checkinDayDraft === day
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : now.getDate() === day
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCheckinDayDraft(0)}
              className={`w-full mt-2 rounded-xl py-2 text-xs font-bold transition-all active:scale-95 ${
                checkinDayDraft === 0
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              Último dia do mês
            </button>
          </>

          {checkinDayDraft > 0 && (
            <p className="text-center text-[11px] text-blue-600 font-semibold mb-3">
              📬 Notificação todo dia <strong>{checkinDayDraft}</strong> de cada mês
            </p>
          )}
          {checkinDayDraft === 0 && (
            <p className="text-center text-[11px] text-blue-600 font-semibold mb-3">
              📬 Notificação no último dia de cada mês
            </p>
          )}

          <button
            disabled={checkinPickerSaving}
            onClick={onConfirm}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm"
          >
            {checkinPickerSaving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}