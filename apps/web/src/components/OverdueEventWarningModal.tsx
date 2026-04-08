'use client';

import { useEffect } from 'react';

interface OverdueEventWarningModalProps {
  event: {
    title: string;
    type: string;
    scheduled_at: string;
    daysOverdue: number;
  };
  onClose: () => void;
  onContinue: () => void;
}

const EVENT_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  bath: { icon: '🛁', label: 'Banho' },
  grooming: { icon: '✂️', label: 'Tosa' },
  bath_grooming: { icon: '🛁✂️', label: 'Banho e Tosa' },
  vaccine: { icon: '💉', label: 'Vacina' },
  dewormer: { icon: '💊', label: 'Vermífugo' },
  flea_tick: { icon: '🦟', label: 'Antipulgas/Carrapatos' },
  vet_appointment: { icon: '🏥', label: 'Consulta Veterinária' },
  medication: { icon: '💊', label: 'Medicamento' },
  other: { icon: '📅', label: 'Outro' },
};

export function OverdueEventWarningModal({ event, onClose, onContinue }: OverdueEventWarningModalProps) {
  const eventType = EVENT_TYPE_LABELS[event.type] || EVENT_TYPE_LABELS.other;

  // Bloquear scroll do body quando modal aberto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Fechar com ESC
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com gradiente de alerta */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-t-2xl p-6 text-white">
          <div className="flex items-center justify-center mb-3">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl animate-pulse">
              ⚠️
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center mb-1">
            Evento Atrasado!
          </h2>
          <p className="text-red-50 text-center text-sm">
            Este compromisso está vencido
          </p>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4">
          {/* Info do evento */}
          <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm flex-shrink-0">
                {eventType.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                    {event.daysOverdue} {event.daysOverdue === 1 ? 'DIA' : 'DIAS'} ATRASADO
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-1">
                  {event.title}
                </h3>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">{eventType.label}</span>
                  {' • '}
                  {new Date(event.scheduled_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          {/* Mensagem de orientação */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex gap-3">
              <span className="text-2xl flex-shrink-0">💡</span>
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-medium mb-1">
                  Dica Importante:
                </p>
                <p className="text-sm text-blue-800">
                  {event.type === 'vaccine' && 'Leve seu pet para aplicar a vacina o quanto antes. O atraso pode comprometer a imunização.'}
                  {event.type === 'dewormer' && 'É importante administrar o vermífugo para manter a saúde do seu pet em dia.'}
                  {event.type === 'flea_tick' && 'Aplique o antipulgas/carrapatos o quanto antes para proteger seu pet.'}
                  {event.type === 'vet_appointment' && 'Entre em contato com a clínica veterinária para reagendar o quanto antes.'}
                  {(event.type === 'bath' || event.type === 'grooming' || event.type === 'bath_grooming') && 
                    'Agende o serviço de higiene para manter seu pet limpo e saudável.'}
                  {!['vaccine', 'dewormer', 'flea_tick', 'vet_appointment', 'bath', 'grooming', 'bath_grooming'].includes(event.type) && 
                    'Tente resolver este compromisso o quanto antes.'}
                </p>
              </div>
            </div>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={onContinue}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-violet-700 hover:to-indigo-700 transition-all shadow-lg shadow-violet-500/30"
            >
              Ver Detalhes →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
