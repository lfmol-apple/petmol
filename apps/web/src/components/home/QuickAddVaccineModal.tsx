'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '@/lib/I18nContext';
import type { VaccineType } from '@/lib/petHealth';
import { ModalPortal } from '@/components/ModalPortal';

type QuickAddData = {
  vaccine_type: VaccineType;
  vaccine_name: string;
  date_administered: string;
  next_dose_date: string;
  veterinarian: string;
};

type CommonVaccine = {
  type: VaccineType;
  name: string;
  icon: string;
  code: string;
};

interface QuickAddVaccineModalProps {
  quickAddData: QuickAddData;
  setQuickAddData: Dispatch<SetStateAction<QuickAddData>>;
  commonVaccines: CommonVaccine[];
  handleQuickAddVaccine: (selectedVaccine: CommonVaccine) => Promise<void>;
  onClose: () => void;
  onOpenFullForm: () => void;
}

export function QuickAddVaccineModal({
  quickAddData,
  setQuickAddData,
  commonVaccines,
  handleQuickAddVaccine,
  onClose,
  onOpenFullForm,
}: QuickAddVaccineModalProps) {
  const { t } = useI18n();

  return (
    <ModalPortal>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[90]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-lg font-bold flex items-center gap-2">⚡ {t('quick_add.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <p className="text-sm text-gray-600">{t('quick_add.subtitle')}</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">📅 {t('quick_add.when_applied')}</label>
            <input
              type="date"
              value={quickAddData.date_administered}
              onChange={(e) => setQuickAddData((prev) => ({ ...prev, date_administered: e.target.value }))}
              className="w-full px-4 py-3 text-base border-2 border-blue-200 rounded-lg focus:ring-2 focus:ring-[#0056D2] focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">💉 {t('quick_add.select_vaccine')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {commonVaccines.map((vac, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickAddVaccine(vac)}
                  className="p-3 rounded-xl text-center transition-all bg-gradient-to-br from-[#0066ff] to-purple-500 hover:from-[#0056D2] hover:to-purple-600 text-white shadow-md hover:shadow-lg active:scale-95"
                >
                  <div className="text-2xl mb-1">{vac.icon}</div>
                  <div className="text-xs font-semibold leading-tight">{vac.name.replace(' (', '\n(')}</div>
                  <div className="text-[10px] mt-0.5 opacity-75 font-mono">{vac.code}</div>
                  <div className="text-[9px] mt-0.5 opacity-90">📅 {t('quick_add.protocol_calc')}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onOpenFullForm}
            className="flex-1 px-4 py-3 bg-blue-500 hover:bg-[#0056D2] text-white rounded-xl font-medium transition-colors"
          >
            ➕ {t('health.full_form')}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
