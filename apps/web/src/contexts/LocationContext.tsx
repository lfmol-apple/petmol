'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useGeolocation, GeolocationState } from '@/hooks/useGeolocation';
import { useI18n } from '@/lib/I18nContext';

interface LocationContextValue extends GeolocationState {
  hasPermission: boolean;
  isReady: boolean;
  error: string | null;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const geoState = useGeolocation();

  const localizedError = useMemo(() => {
    switch (geoState.errorCode) {
      case 'permission_denied':
        return t('location.error.permission_denied');
      case 'position_unavailable':
        return t('location.error.unavailable');
      case 'timeout':
        return t('location.error.timeout');
      case 'unsupported':
        return t('location.error.unsupported');
      case 'unknown':
        return t('location.error.unknown');
      default:
        return null;
    }
  }, [geoState.errorCode, t]);

  const value: LocationContextValue = {
    ...geoState,
    error: localizedError,
    hasPermission: geoState.errorCode !== 'permission_denied',
    isReady: !geoState.loading && geoState.latitude !== null && geoState.longitude !== null,
  };

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
