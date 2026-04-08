'use client';

import { useEffect, useState, useCallback } from 'react';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed: number | null; // meters per second
  heading: number | null; // degrees
  errorCode: 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported' | 'unknown' | null;
  errorMessage: string | null;
  loading: boolean;
  timestamp: number | null;
}

export interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const DEFAULT_OPTIONS: UseGeolocationOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 300000, // 5 minutes cache
};

/**
 * Professional geolocation hook with caching, error handling and loading states
 * 
 * Usage:
 * ```tsx
 * const { latitude, longitude, error, loading } = useGeolocation();
 * ```
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    speed: null,
    heading: null,
    errorCode: null,
    errorMessage: null,
    loading: true,
    timestamp: null,
  });

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const updatePosition = useCallback((position: GeolocationPosition) => {
    setState({
      latitude: position.coords.latitude,
      speed: position.coords.speed, // null if not available
      heading: position.coords.heading, // null if not available
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      errorCode: null,
      errorMessage: null,
      loading: false,
      timestamp: position.timestamp,
    });
  }, []);

  const updateError = useCallback((error: GeolocationPositionError) => {
    let errorCode: GeolocationState['errorCode'] = 'unknown';
    
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorCode = 'permission_denied';
        break;
      case error.POSITION_UNAVAILABLE:
        errorCode = 'position_unavailable';
        break;
      case error.TIMEOUT:
        errorCode = 'timeout';
        break;
      default:
        errorCode = 'unknown';
    }

    setState(prev => ({
      ...prev,
      errorCode,
      errorMessage: error.message || null,
      loading: false,
    }));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        errorCode: 'unsupported',
        errorMessage: null,
        loading: false,
      }));
      return;
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      updatePosition,
      updateError,
      opts
    );

    // Watch position for updates (optional - can be removed if not needed)
    const watchId = navigator.geolocation.watchPosition(
      updatePosition,
      updateError,
      opts
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [updatePosition, updateError, opts.enableHighAccuracy, opts.timeout, opts.maximumAge]);

  return state;
}
