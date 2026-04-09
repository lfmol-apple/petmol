'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { useI18n } from '@/lib/I18nContext';
import { googleMapsLoader } from '@/lib/googleMapsLoader';

// Google Maps types (loaded dynamically)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    google: any; // Google Maps loaded dynamically
  }
}

interface Location {
  lat: number;
  lng: number;
}

export interface MapPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  rating?: number;
  rating_count?: number;
  open_now?: boolean;
  distance_text?: string;
}

interface InteractiveMapProps {
  places: MapPlace[];
  userLocation: Location | null;
  onPlaceClick?: (place: MapPlace) => void;
  height?: string;
  zoom?: number;
}

export const InteractiveMap = memo(function InteractiveMap({ 
  places, 
  userLocation,
  onPlaceClick,
  height = '500px',
  zoom = 13
}: InteractiveMapProps) {
  const { t } = useI18n();
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const googleMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createInfoWindowContent = useCallback((place: MapPlace): string => {
    const distance = place.distance_text || '';
    const rating = place.rating ? `⭐ ${place.rating.toFixed(1)}` : '';
    const ratingCount = place.rating_count ? ` (${place.rating_count})` : '';
    const status = place.open_now === true
      ? `<span style="color: #10B981;">● ${t('common.open')}</span>`
      : place.open_now === false
      ? `<span style="color: #EF4444;">● ${t('common.closed')}</span>`
      : '';
    
    return `
      <div style="padding: 8px; max-width: 250px;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${place.name}</h3>
        <p style="margin: 4px 0; font-size: 13px; color: #666;">${place.address}</p>
        ${distance ? `<p style="margin: 4px 0; font-size: 13px; color: #666;">📍 ${distance}</p>` : ''}
        ${rating ? `<p style="margin: 4px 0; font-size: 13px;">${rating}${ratingCount}</p>` : ''}
        ${status ? `<p style="margin: 4px 0; font-size: 13px;">${status}</p>` : ''}
        ${place.phone ? `<p style="margin: 4px 0; font-size: 13px;">📞 ${place.phone}</p>` : ''}
      </div>
    `;
  }, [t]);

  // Initialize map once Google Maps is loaded
  useEffect(() => {
    if (!userLocation || !mapRef.current) return;

    let mounted = true;

    const initMap = async () => {
      try {
        await googleMapsLoader.load();
        
        if (!mounted || !mapRef.current) return;

        if (!window.google) {
          setError(t('map.error.load_failed'));
          setIsLoading(false);
          return;
        }

        // Create map if not exists
        if (!googleMapRef.current) {
          const map = new window.google.maps.Map(mapRef.current, {
            center: userLocation,
            zoom: zoom,
            styles: [
              {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
              }
            ],
          });

          googleMapRef.current = map;

          // Add user location marker
          userMarkerRef.current = new window.google.maps.Marker({
            position: userLocation,
            map: map,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#4F46E5',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
            title: t('map.user_location'),
          });
        } else {
          // Update existing map center
          googleMapRef.current.setCenter(userLocation);
          if (userMarkerRef.current) {
            userMarkerRef.current.setPosition(userLocation);
          }
        }

        setIsLoading(false);
      } catch (err) {
        if (mounted) {
          setError(t('map.error.init_failed'));
          setIsLoading(false);
        }
      }
    };

    initMap();

    return () => {
      mounted = false;
    };
  }, [userLocation, zoom, t]);

  // Update markers when places change
  useEffect(() => {
    const map = googleMapRef.current;
    if (!map || !window.google) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Add new markers
    places.forEach((place) => {
      const marker = new window.google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: map,
        title: place.name,
        icon: {
          url: place.open_now === true ? 
            'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#10B981" stroke="white" stroke-width="2"/>
                <text x="16" y="22" font-size="18" text-anchor="middle" fill="white">📍</text>
              </svg>
            `) :
            'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#EF4444" stroke="white" stroke-width="2"/>
                <text x="16" y="22" font-size="18" text-anchor="middle" fill="white">📍</text>
              </svg>
            `),
          scaledSize: new window.google.maps.Size(32, 32),
        },
      });

      marker.addListener('click', () => {
        setSelectedPlace(place);
        if (onPlaceClick) onPlaceClick(place);
        
        // Show info window
        if (infoWindowRef.current) {
          infoWindowRef.current.close();
        }
        
        const infoWindow = new window.google.maps.InfoWindow({
          content: createInfoWindowContent(place),
        });
        
        infoWindowRef.current = infoWindow;
        infoWindow.open(map, marker);
      });

      markersRef.current.push(marker);
    });
  }, [places, onPlaceClick, createInfoWindowContent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(marker => marker.setMap(null));
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null);
      }
    };
  }, []);

  const openInWaze = useCallback((place: MapPlace) => {
    const url = `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes&z=10`;
    window.open(url, '_blank');
  }, []);

  const openInGoogleMaps = useCallback((place: MapPlace) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
    window.open(url, '_blank');
  }, []);

  const openInAppleMaps = useCallback((place: MapPlace) => {
    const url = `http://maps.apple.com/?daddr=${place.lat},${place.lng}`;
    window.open(url, '_blank');
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-8 text-center" style={{ height }}>
        <div className="text-4xl mb-2">⚠️</div>
        <p className="text-red-600 font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div 
        ref={mapRef} 
        style={{ height, width: '100%' }}
        className="rounded-xl overflow-hidden border-2 border-slate-200"
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-xl">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-2">🗺️</div>
            <p className="text-slate-600">{t('map.loading')}</p>
          </div>
        </div>
      )}

      {selectedPlace && (
        <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xl rounded-[32px] shadow-premium border border-white/60 p-4 border-2 border-slate-200 overflow-hidden">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h3 className="font-bold text-lg text-slate-900">{selectedPlace.name}</h3>
              <p className="text-sm text-slate-600">{selectedPlace.address}</p>
              {selectedPlace.distance_text && (
                <p className="text-sm text-slate-600 mt-1">📍 {selectedPlace.distance_text}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedPlace(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => openInWaze(selectedPlace)}
              className="flex-1 py-2 bg-[#33CCFF] text-white font-semibold rounded-lg hover:bg-[#00A3E0] transition-colors flex items-center justify-center gap-2"
            >
              🚗 Waze
            </button>
            <button
              onClick={() => openInGoogleMaps(selectedPlace)}
              className="flex-1 py-2 bg-[#4285F4] text-white font-semibold rounded-lg hover:bg-[#3367D6] transition-colors flex items-center justify-center gap-2"
            >
              🗺️ Google Maps
            </button>
            <button
              onClick={() => openInAppleMaps(selectedPlace)}
              className="flex-1 py-2 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              🍎 Apple Maps
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 right-4 p-3 border border-slate-200 bg-white rounded-[20px] shadow-sm ring-1 ring-slate-100/50 overflow-hidden">
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary-600 border-2 border-white"></div>
            <span>{t('map.legend.user')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white"></div>
            <span>{t('common.open')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white"></div>
            <span>{t('common.closed')}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
