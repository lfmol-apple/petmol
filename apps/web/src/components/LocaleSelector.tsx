'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { localeLabels, localeNames, supportedLocales, type Locale } from '@/lib/i18n';

const countryOptions = [
  { code: 'BR', flag: '🇧🇷', name: 'Brasil' },
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: 'ES', flag: '🇪🇸', name: 'España' },
  { code: 'MX', flag: '🇲🇽', name: 'México' },
  { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: 'CL', flag: '🇨🇱', name: 'Chile' },
];

export function LocaleSelector({ variant = 'default' }: { variant?: 'default' | 'glass' | 'compact' }) {
  const { geo, setCountry, locale, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const currentCountry = countryOptions.find(c => c.code === geo.country) || countryOptions[0];

  const btnClass =
    variant === 'glass'
      ? 'flex items-center gap-2 h-9 px-3 bg-white/15 border border-white/40 rounded-lg text-white text-sm font-medium hover:bg-white/25 backdrop-blur-sm transition-colors shadow-sm'
      : variant === 'compact'
      ? 'flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-[#0056D2]/30 bg-[#0056D2]/5 hover:bg-[#0056D2]/10 transition-colors shadow-sm'
      : 'flex items-center gap-2 h-9 px-3 bg-white border border-blue-200 rounded-xl hover:bg-blue-50 shadow-sm transition-colors text-sm font-semibold text-[#0056D2]';

  const handleSelectCountry = (code: string) => {
    setCountry(code);
    setIsOpen(false);
    setShowLangPicker(false);
  };
  
  const handleSelectLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    setShowLangPicker(false);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={btnClass}
        aria-label="Select country and language"
      >
        <span className="text-base">{currentCountry.flag}</span>
        {variant === 'compact' && <span className="text-[11px] font-semibold text-[#0056D2]">{currentCountry.code}</span>}
        {variant !== 'compact' && <span>{localeLabels[locale]}</span>}
        {variant !== 'compact' && (
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setShowLangPicker(false); }} />
          
          {showLangPicker ? (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50 overflow-hidden py-1">
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">
                {t('locale.language')}
              </div>
              {supportedLocales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => handleSelectLocale(loc)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 ${
                    locale === loc ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
                  }`}
                >
                  <span>{localeNames[loc]}</span>
                  {locale === loc && (
                    <span className="text-xs text-primary-600">✓</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setShowLangPicker(false)}
                className="w-full px-3 py-2 text-sm text-left text-slate-500 hover:bg-slate-50 border-t border-slate-100"
              >
                ← {t('common.back')}
              </button>
            </div>
          ) : (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-50 overflow-hidden py-1 max-h-80 overflow-y-auto">
              <button
                onClick={() => setShowLangPicker(true)}
                className="w-full px-3 py-2 text-sm text-left text-primary-600 font-medium hover:bg-primary-50 border-b border-slate-100"
              >
                {t('locale.language')}: {localeLabels[locale]} →
              </button>
              <div className="px-3 py-2 text-xs font-semibold text-slate-500">
                {t('locale.country')}
              </div>
              {countryOptions.map((country) => (
                <button
                  key={country.code}
                  onClick={() => handleSelectCountry(country.code)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 ${
                    geo.country === country.code ? 'bg-primary-50 text-primary-700' : 'text-slate-700'
                  }`}
                >
                  <span className="text-lg">{country.flag}</span>
                  <span className="flex-1">{country.name}</span>
                  {geo.country === country.code && (
                    <span className="text-xs text-primary-600">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
