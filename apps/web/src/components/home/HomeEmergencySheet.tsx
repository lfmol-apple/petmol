'use client';

interface HomeEmergencySheetProps {
  open: boolean;
  onClose: () => void;
}

export function HomeEmergencySheet({ open, onClose }: HomeEmergencySheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl p-5 pb-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🚨</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Emergência Veterinária</h2>
            <p className="text-xs text-gray-500">Selecione o tipo de atendimento</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <a
            href="https://www.google.com/maps/search/clinica+veterinaria+24+horas+perto+de+mim"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🏥</span>
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-900 text-sm">Clínicas Veterinárias</div>
              <div className="text-xs text-gray-500 mt-0.5">Atendimento <span className="font-bold text-red-600">24h</span> · Consultas e urgências</div>
            </div>
            <span className="text-red-400 text-lg">›</span>
          </a>

          <a
            href="https://www.google.com/maps/search/hospital+veterinario+24+horas+perto+de+mim"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl hover:shadow-md active:scale-[0.98] transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🏨</span>
            </div>
            <div className="flex-1">
              <div className="font-bold text-gray-900 text-sm">Hospitais Veterinários</div>
              <div className="text-xs text-gray-500 mt-0.5">Internação e cirurgia <span className="font-bold text-red-600">24h</span></div>
            </div>
            <span className="text-orange-400 text-lg">›</span>
          </a>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4">Abre Google Maps com estabelecimentos próximos a você</p>
      </div>
    </div>
  );
}