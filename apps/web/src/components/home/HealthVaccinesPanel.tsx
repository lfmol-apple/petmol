'use client';

import { PremiumCard, PremiumPanelShell } from '@/components/premium';
import { useI18n } from '@/lib/I18nContext';
import type { VaccineRecord } from '@/lib/petHealth';

interface HealthVaccinesPanelProps {
  petName: string | undefined;
  vaccines: VaccineRecord[];
  currentVaccines: VaccineRecord[];
  onOpenVaccineCenter: () => void;
}

export function HealthVaccinesPanel({
  petName,
  vaccines,
  currentVaccines,
  onOpenVaccineCenter,
}: HealthVaccinesPanelProps) {
  const { t } = useI18n();

  const upcomingCount = currentVaccines.filter(v => {
    if (!v.next_dose_date) return false;
    const nextDose = new Date(v.next_dose_date);
    if (Number.isNaN(nextDose.getTime())) return false;
    const diffDays = Math.ceil((nextDose.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 60;
  }).length;

  const overdueCount = currentVaccines.filter(v => {
    if (!v.next_dose_date) return false;
    const nextDose = new Date(v.next_dose_date);
    if (Number.isNaN(nextDose.getTime())) return false;
    return nextDose.getTime() < Date.now();
  }).length;

  return (
    <PremiumPanelShell title={t('health.vaccines')} icon="💉" subtitle={petName}>
      <div className="space-y-4 sm:space-y-5">
        <PremiumCard variant="info">
          <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
            💉 Central de Vacinas
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed">
            O fluxo canônico de vacinas agora fica na central atual. Importação de cartão, preenchimento
            rápido, formulário completo, histórico, deduplicação canônica e lembretes vivem em um único
            lugar.
          </p>
        </PremiumCard>

        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white p-3 rounded-lg text-center shadow-sm">
            <div className="text-green-600 font-bold text-2xl">{vaccines.length}</div>
            <div className="text-sm text-gray-600">{t('health.total_vaccines')}</div>
          </div>
          <div className="bg-white p-3 rounded-lg text-center shadow-sm">
            <div className="text-[#0056D2] font-bold text-2xl">{upcomingCount}</div>
            <div className="text-sm text-gray-600">{t('health.upcoming')}</div>
          </div>
          <div className="bg-white p-3 rounded-lg text-center shadow-sm">
            <div className="text-red-600 font-bold text-2xl">{overdueCount}</div>
            <div className="text-sm text-gray-600">{t('health.overdue')}</div>
          </div>
        </div>

        <PremiumCard>
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-slate-900">Abrir fluxo atual</h4>
              <p className="text-sm text-slate-600 mt-1">
                Use a central atual para importar o cartão, registrar vacinas, editar histórico e
                gerenciar os lembretes sem duplicação.
              </p>
            </div>
            <button
              onClick={onOpenVaccineCenter}
              className="w-full py-4 rounded-2xl bg-[#0056D2] hover:bg-[#0047ad] text-white text-[15px] font-bold shadow-md transition-colors"
            >
              💉 Abrir central de vacinas
            </button>
          </div>
        </PremiumCard>
      </div>
    </PremiumPanelShell>
  );
}
