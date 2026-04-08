'use client';

import { useLocationDetection } from '@/hooks/useLocationDetection';
import { useI18n } from '@/lib/I18nContext';
import { localeNames } from '@/lib/i18n';

export function TravelDetectionNotification() {
  const { t } = useI18n();
  const {
    showNotification,
    detectedCountry,
    suggestedLocale,
    handleAcceptLanguageChange,
    handleDismiss,
    getCountryName
  } = useLocationDetection();

  if (!showNotification || !detectedCountry) return null;

  const countryName = getCountryName(detectedCountry);
  const localeName = localeNames[suggestedLocale as keyof typeof localeNames] || suggestedLocale;

  return (
    <div className="fixed bottom-4 right-4 z-[100] animate-slide-up">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-primary-500 p-5 max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="text-4xl">✈️</div>
          <div className="flex-1">
            <h3 className="font-bold text-lg text-gray-800">
              {t('locale.travel_detected')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('locale.arrived_in')} <strong>{countryName}</strong>
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ✕
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-700 mb-4">
          {t('locale.change_language_question')} <strong>{localeName}</strong>?
        </p>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors text-sm"
          >
            {t('locale.keep_current')}
          </button>
          <button
            onClick={handleAcceptLanguageChange}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg font-medium transition-all text-sm shadow-md"
          >
            {t('locale.yes_change')}
          </button>
        </div>
      </div>
    </div>
  );
}
