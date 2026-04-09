'use client';

import { useI18n } from '@/lib/I18nContext';
import { supportedLocales, localeNames, Locale } from '@/lib/i18n';
import { useState } from 'react';

// Common countries by region
const COUNTRIES = [
  // Americas
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'MX', name: 'México', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  
  // Europe
  { code: 'ES', name: 'España', flag: '🇪🇸' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'DE', name: 'Deutschland', flag: '🇩🇪' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  
  // Others
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
];

export function LanguageCountrySelector() {
  const { locale, geo, setCountry, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const currentCountry = COUNTRIES.find(c => c.code === geo.country) || COUNTRIES[0];

  return (
    <div className="relative">
      {/* Compact trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label={t('locale.language')}
      >
        <span className="text-lg">{currentCountry.flag}</span>
        <span className="text-sm font-medium text-slate-700 uppercase">
          {locale.split('-')[0]}
        </span>
        <svg 
          className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <div className="absolute right-0 mt-2 w-80 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 border border-slate-200 z-50 overflow-hidden">
            {/* Language section */}
            <div className="p-4 border-b border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
                {t('locale.language')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {supportedLocales.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => {
                      setLocale(loc);
                      setIsOpen(false);
                    }}
                    className={`px-3 py-2 rounded-lg text-left transition-colors ${
                      locale === loc
                        ? 'bg-[#0056D2] text-white font-semibold'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="text-sm">{localeNames[loc]}</div>
                    <div className="text-xs opacity-70">{loc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Country section */}
            <div className="p-4 max-h-80 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
                {t('locale.country')}
              </div>
              <div className="space-y-1">
                {COUNTRIES.map((country) => (
                  <button
                    key={country.code}
                    onClick={() => {
                      setCountry(country.code);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left flex items-center gap-3 transition-colors ${
                      geo.country === country.code
                        ? 'bg-blue-50 text-[#0047ad] font-semibold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="text-lg">{country.flag}</span>
                    <span className="text-sm flex-1">{country.name}</span>
                    {geo.country === country.code && (
                      <svg className="w-5 h-5 text-[#0056D2]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Footer info */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
              <div className="text-xs text-slate-600">
                {t('locale.language')}: <strong>{localeNames[locale]}</strong>
                <br />
                {t('locale.country')}: <strong>{currentCountry.name}</strong>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
