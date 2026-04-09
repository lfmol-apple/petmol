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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md backdrop-blur-sm flex items-end justify-center sm:items-center sm:p-4 z-[90] animate-fadeIn">
      <div className="bg-slate-50 native-bottom-sheet rounded-[32px] shadow-2xl w-full max-w-md flex flex-col max-h-[96dvh] animate-slideUp overflow-hidden">
        {/* Drag Handle for iOS feel */}
        <div className="w-full flex justify-center pt-3 pb-1 bg-white sm:hidden rounded-t-[24px]">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 tracking-tight">⚡ {t('quick_add.title')}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <p className="text-sm text-gray-600">{t('quick_add.subtitle')}</p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">📅 {t('quick_add.when_applied')}</label>
            <input
              type="date"
              value={quickAddData.date_administered}
              onChange={(e) => setQuickAddData((prev) => ({ ...prev, date_administered: e.target.value }))}
              className="w-full px-4 py-3.5 text-[15px] border border-slate-200 bg-white rounded-2xl focus:ring-2 focus:ring-brand-DEFAULT focus:border-transparent outline-none transition-all shadow-sm"
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

        <div className="flex gap-3 px-5 py-4 pb-8 sm:pb-4 border-t border-slate-100 bg-white/90 backdrop-blur-md sticky bottom-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl font-semibold transition-all active:scale-[0.98]"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onOpenFullForm}
            className="flex-1 px-4 py-3.5 bg-brand-DEFAULT hover:bg-brand-dark text-white rounded-2xl font-semibold transition-all active:scale-[0.98] shadow-md shadow-brand-DEFAULT/20"
          >
            ➕ {t('health.full_form')}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
