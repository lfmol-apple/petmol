'use client';

import React, { createContext, useContext, useRef, useEffect, useSyncExternalStore, ReactNode } from 'react';
import { Locale, GeoContext, t as translate, getGeoContext, defaultLocaleForCountry, detectCountryFromBrowser } from './i18n';

interface I18nState {
  locale: Locale;
  geo: GeoContext;
  mounted: boolean;
}

interface I18nContextType {
  getState: () => I18nState;
  t: (key: string, params?: Record<string, string | number>) => string;
  setCountry: (country: string) => void;
  setLocale: (locale: Locale) => void;
  subscribe: (callback: () => void) => () => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY_COUNTRY = 'petmol_country';
const STORAGE_KEY_LOCALE = 'petmol_locale';
const STORAGE_KEY_LOCALE_LOCKED = 'petmol_locale_locked';

export function I18nProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<I18nState>({
    locale: 'pt-BR',
    geo: {
      country: 'BR',
      locale: 'pt-BR',
      localeLocked: false,
      units: 'metric',
      pricesEnabled: true
    },
    mounted: false
  });

  const listenersRef = useRef<Set<() => void>>(new Set());

  const notify = () => {
    listenersRef.current.forEach(listener => listener());
  };

  const contextValue = useRef<I18nContextType>({
    getState: () => stateRef.current,
    
    t: (key: string, params?: Record<string, string | number>) => {
      return translate(key, stateRef.current.locale, params);
    },
    
    setCountry: (country: string) => {
      const prev = stateRef.current;
      // Quando troca de país, SEMPRE usar idioma padrão do país e desbloquear
      const newLocale = defaultLocaleForCountry(country);
      const newGeo = getGeoContext(country, false); // false = não travado
      newGeo.locale = newLocale;
      
      stateRef.current = {
        ...prev,
        locale: newLocale,
        geo: newGeo
      };
      
      localStorage.setItem(STORAGE_KEY_COUNTRY, country);
      localStorage.setItem(STORAGE_KEY_LOCALE, newLocale);
      localStorage.removeItem(STORAGE_KEY_LOCALE_LOCKED); // Remove lock ao trocar país
      
      console.log('🌍 País alterado:', country, '→ Idioma:', newLocale);
      notify();
    },
    
    setLocale: (newLocale: Locale) => {
      const prev = stateRef.current;
      const newGeo = { ...prev.geo, locale: newLocale, localeLocked: true };
      
      stateRef.current = {
        ...prev,
        locale: newLocale,
        geo: newGeo
      };
      
      localStorage.setItem(STORAGE_KEY_LOCALE, newLocale);
      localStorage.setItem(STORAGE_KEY_LOCALE_LOCKED, 'true');
      
      console.log('🗣️ Idioma alterado manualmente:', newLocale, '(locked)');
      notify();
    },
    
    subscribe: (callback: () => void) => {
      listenersRef.current.add(callback);
      return () => {
        listenersRef.current.delete(callback);
      };
    }
  });

  useEffect(() => {
    // Detectar país do navegador se não houver nada salvo
    const detectedCountry = detectCountryFromBrowser();
    const storedCountry = localStorage.getItem(STORAGE_KEY_COUNTRY) || detectedCountry;
    const storedLocale = localStorage.getItem(STORAGE_KEY_LOCALE);
    const storedLocked = localStorage.getItem(STORAGE_KEY_LOCALE_LOCKED) === 'true';
    
    // Se locale não está travado, usar o idioma padrão do país detectado
    const locale = storedLocked && storedLocale 
      ? (storedLocale as Locale)
      : defaultLocaleForCountry(storedCountry);
    
    const geo = getGeoContext(storedCountry, storedLocked);
    geo.locale = locale;
    
    // Debug: log inicial de detecção
    console.log('🌍 PETMOL i18n:', {
      detectedCountry,
      storedCountry,
      locale,
      browserLang: typeof navigator !== 'undefined' ? navigator.language : 'N/A'
    });
    
    // Salvar país detectado no localStorage apenas se não existia antes
    if (!localStorage.getItem(STORAGE_KEY_COUNTRY)) {
      localStorage.setItem(STORAGE_KEY_COUNTRY, storedCountry);
      localStorage.setItem(STORAGE_KEY_LOCALE, locale);
    }
    
    stateRef.current = {
      locale,
      geo,
      mounted: true
    };
    
    notify();
  }, []);

  return (
    <I18nContext.Provider value={contextValue.current}>
      {children}
    </I18nContext.Provider>
  );
}

function useI18nContext() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function useI18n() {
  const context = useI18nContext();
  const state = useSyncExternalStore(
    context.subscribe,
    context.getState,
    context.getState
  );
  
  return {
    locale: state.locale,
    geo: state.geo,
    t: context.t,
    setCountry: context.setCountry,
    setLocale: context.setLocale
  };
}

export function useTranslation() {
  const { t, locale } = useI18n();
  return { t, locale };
}
