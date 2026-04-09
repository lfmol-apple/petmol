'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/I18nContext';
import { showBlockingNotice } from '@/features/interactions/userPromptChannel';
import { ModalPortal } from '@/components/ModalPortal';
import type { PetHealthProfile } from '@/lib/petHealth';

interface HomeNavigationModalsProps {
  currentPet: PetHealthProfile | null | undefined;
  showServiceTypeModal: boolean;
  onCloseServiceTypeModal: () => void;
  showHealthOptionsModal: boolean;
  onCloseHealthOptionsModal: () => void;
  onOpenHealthOptionsModal: () => void;
  showEventTypeModal: boolean;
  onOpenEventTypeModal: () => void;
  onCloseEventTypeModal: () => void;
  showVetOptionsModal: boolean;
  onCloseVetOptionsModal: () => void;
  alertVaccinesValue: boolean;
  alertParasitesValue: boolean;
  onOpenHealthTab: (tab: string) => void;
  onStartEventRegistration: (type: string) => void;
  onOpenEditPet: () => void;
  getRecentVets: () => string[];
  onNavigateToSaude?: (tab: string) => void;
}

export function HomeNavigationModals({
  currentPet,
  showServiceTypeModal,
  onCloseServiceTypeModal,
  showHealthOptionsModal,
  onCloseHealthOptionsModal,
  onOpenHealthOptionsModal,
  showEventTypeModal,
  onOpenEventTypeModal,
  onCloseEventTypeModal,
  showVetOptionsModal,
  onCloseVetOptionsModal,
  alertVaccinesValue,
  alertParasitesValue,
  onOpenHealthTab,
  onStartEventRegistration,
  onOpenEditPet,
  getRecentVets,
  onNavigateToSaude,
}: HomeNavigationModalsProps) {
  const { t } = useI18n();

  return (
    <ModalPortal>
    <>
      {showServiceTypeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm flex flex-col max-h-[92dvh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-bold flex items-center gap-2">🔍 {t('services.find_nearby')}</h3>
              <button onClick={onCloseServiceTypeModal} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {[
                { icon: '🏥', labelKey: 'services.vet_clinics_label', query: 'clínica veterinária', color: 'bg-blue-500 hover:bg-[#0056D2]' },
                { icon: '🏨', labelKey: 'services.vet_hospital_label', query: 'hospital veterinário', color: 'bg-indigo-500 hover:bg-indigo-600' },
                { icon: '🚨', labelKey: 'services.vet_emergency_label', query: 'veterinária 24 horas emergência', color: 'bg-red-500 hover:bg-red-600' },
                { icon: '🛁', labelKey: 'services.petshop_label', query: 'petshop', color: 'bg-purple-500 hover:bg-purple-600' },
                { icon: '🏠', labelKey: 'services.hotel_label', query: 'hotel para pet creche para cachorro', color: 'bg-orange-500 hover:bg-orange-600' },
                { icon: '🎓', labelKey: 'services.training_label', query: 'adestramento de cães', color: 'bg-green-500 hover:bg-green-600' },
              ].map(({ icon, labelKey, query, color }) => (
                <button
                  key={labelKey}
                  onClick={() => {
                    onCloseServiceTypeModal();
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
                  }}
                  className={`w-full px-4 py-3.5 ${color} text-white rounded-xl font-semibold flex items-center gap-3 transition-all active:scale-95 shadow-sm`}
                >
                  <span className="text-2xl leading-none">{icon}</span>
                  <span className="flex-1 text-left text-sm">{t(labelKey)}</span>
                  <span className="text-white/70 text-xs">{t('services.open_maps')}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <button onClick={onCloseServiceTypeModal} className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {showHealthOptionsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 w-full max-w-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="text-lg font-bold flex items-center gap-2">🏥 Saúde{currentPet?.pet_name ? ` de ${currentPet.pet_name}` : ''}</h3>
              <button onClick={onCloseHealthOptionsModal} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">✕</button>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {[
                { icon: '💉', label: 'Vacinas', borderColor: 'border-l-blue-600', tab: 'vaccines', alert: alertVaccinesValue },
                { icon: '🛡️', label: 'Controle Parasitário', borderColor: 'border-l-amber-600', tab: 'parasites', alert: alertParasitesValue },
                { icon: '💊', label: 'Medicação', borderColor: 'border-l-purple-600', tab: 'medication', alert: false },
              ].map(({ icon, label, borderColor, tab, alert }) => (
                <button
                  key={tab}
                  onClick={() => {
                    if (tab === 'eventos') {
                      onCloseHealthOptionsModal();
                      onOpenEventTypeModal();
                      return;
                    }
                    if ((tab === 'vaccines' || tab === 'parasites') && onNavigateToSaude) {
                      onNavigateToSaude(tab === 'vaccines' ? 'vacinas' : 'antiparasitario');
                      return;
                    }
                    onCloseHealthOptionsModal();
                    onOpenHealthTab(tab);
                  }}
                  className={`w-full h-14 bg-white hover:bg-slate-50 border border-gray-200 border-l-4 ${borderColor} rounded-xl px-5 flex items-center gap-4 shadow-sm hover:shadow-md active:scale-95 transition-all`}
                >
                  <span className="text-2xl leading-none flex-shrink-0">{icon}</span>
                  <span className="flex-1 text-left text-sm font-bold text-gray-900 leading-tight">{label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {alert && (
                      <span className="w-5 h-5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center">
                        <span className="text-white font-black" style={{ fontSize: '9px' }}>!</span>
                      </span>
                    )}
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
              <button onClick={onCloseHealthOptionsModal} className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* EventTypeModal SILENCIADO: bloco legado de Consultas/Exames removido da UI */}

      {showVetOptionsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">🏥 Veterinários</h3>
              <button onClick={onCloseVetOptionsModal} className="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
            </div>

            {currentPet?.primary_vet?.name && (
              <div className="mb-4">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">👨‍⚕️</span>
                        <span className="text-xs font-semibold text-[#0056D2] uppercase tracking-wide">Veterinário de Confiança</span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-lg mb-1">{currentPet.primary_vet.name}</h4>
                      {currentPet.primary_vet.clinic && <p className="text-sm text-gray-600">🏥 {currentPet.primary_vet.clinic}</p>}
                      {currentPet.primary_vet.phone && <p className="text-sm font-medium text-gray-700 mt-1">📱 {currentPet.primary_vet.phone}</p>}
                    </div>
                  </div>
                  {currentPet.primary_vet.phone && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <a href={`tel:${currentPet.primary_vet.phone.replace(/\D/g, '')}`} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors text-sm">📞 Ligar</a>
                      <a href={`https://wa.me/55${currentPet.primary_vet.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors text-sm">💬 WhatsApp</a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!currentPet?.primary_vet?.name && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  💡 <strong>Dica:</strong> Configure o veterinário de confiança de {currentPet?.pet_name} em
                  <button
                    onClick={() => {
                      onCloseVetOptionsModal();
                      onOpenEditPet();
                    }}
                    className="text-[#0056D2] hover:text-[#003889] font-semibold underline ml-1"
                  >
                    Editar → Veterinário de Confiança
                  </button>
                </p>
              </div>
            )}

            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Histórico de Veterinários</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {getRecentVets().map((vet, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      navigator.clipboard.writeText(vet);
                      showBlockingNotice(`📋 Copiado: ${vet}`);
                      onCloseVetOptionsModal();
                    }}
                    className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-colors"
                  >
                    <div className="font-medium text-gray-800">{vet}</div>
                    <div className="text-xs text-gray-500">Clique para copiar</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-white text-gray-500">ou buscar novos</span>
              </div>
            </div>

            <div className="space-y-3">
              <Link href="/emergency" onClick={onCloseVetOptionsModal} className="block w-full">
                <button className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">🚨 Emergência 24h</button>
              </Link>
              <button
                onClick={() => { onCloseVetOptionsModal(); window.open('https://www.google.com/maps/search/?api=1&query=cl%C3%ADnica+veterin%C3%A1ria', '_blank', 'noopener,noreferrer'); }}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-[#0056D2] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                🏥 Clínicas Próximas
              </button>
              <p className="text-xs text-gray-500 text-center mt-3">💡 Escolha o tipo de atendimento que você precisa</p>
            </div>

            <div className="mt-4 text-center">
              <button onClick={onCloseVetOptionsModal} className="text-sm text-gray-500 hover:text-gray-700">{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </>
    </ModalPortal>
  );
}