'use client';

import { useState, useEffect } from 'react';
import { getTopShortcuts, recordPlaceClick, migrateOldFavoritesIfExists, type PlaceUsageRecord } from '@/lib/placeUsage';
import { useI18n } from '@/lib/I18nContext';
import { API_BASE_URL } from '@/lib/api';
import ProviderSheet from './ProviderSheet';

export function MyShortcuts() {
  const { t, geo, locale } = useI18n();
  const [shortcuts, setShortcuts] = useState<PlaceUsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerSheetOpen, setProviderSheetOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceUsageRecord | null>(null);

  useEffect(() => {
    // Migrate old favorites on first load
    migrateOldFavoritesIfExists();
    
    // Load shortcuts
    const top = getTopShortcuts(3);
    setShortcuts(top);
    setLoading(false);
  }, []);

  const handleClick = (place: PlaceUsageRecord, channel: 'whatsapp' | 'call' | 'directions') => {
    recordPlaceClick(place, channel);
    
    // If directions, open provider sheet instead of direct navigation
    if (channel === 'directions') {
      setSelectedPlace(place);
      setProviderSheetOpen(true);
    }
  };

  const getHandoffUrl = (place: PlaceUsageRecord, channel: 'whatsapp' | 'call' | 'directions'): string => {
    const params = new URLSearchParams({
      country: geo.country,
      locale,
      category: place.category,
    });

    if (place.place_id) params.set('place_id', place.place_id);
    if (place.partner_slug) params.set('partner_slug', place.partner_slug);

    if (channel === 'whatsapp') {
      if (place.phone) params.set('phone', place.phone);
      return `${API_BASE_URL}/handoff/whatsapp?${params}`;
    }

    if (channel === 'call') {
      if (place.phone) params.set('phone', place.phone);
      return `${API_BASE_URL}/handoff/call?${params}`;
    }

    if (channel === 'directions') {
      if (place.lat) params.set('lat', String(place.lat));
      if (place.lng) params.set('lng', String(place.lng));
      if (place.name) params.set('place_name', place.name);
      return `${API_BASE_URL}/handoff/directions?${params}`;
    }

    return '#';
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-slate-100 rounded"></div>
            <div className="h-16 bg-slate-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (shortcuts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-4">
        <div className="text-center">
          <div className="text-3xl mb-2">⚡</div>
          <h3 className="font-semibold text-slate-900 mb-1 text-sm">{t('shortcuts.empty_title')}</h3>
          <p className="text-sm text-slate-600">
            {t('shortcuts.empty_hint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">{t('shortcuts.title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('shortcuts.subtitle')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {shortcuts.map((place, idx) => {
          const totalUses = place.counts.whatsapp + place.counts.call + place.counts.directions;
          
          return (
            <div
              key={`${place.place_id || place.partner_slug || place.name}-${idx}`}
              className="bg-slate-50 rounded-lg p-3 border border-slate-100"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 truncate text-sm">{place.name}</h4>
                  {place.address && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{place.address}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {totalUses === 1
                      ? t('shortcuts.usage_singular', { count: totalUses })
                      : t('shortcuts.usage_plural', { count: totalUses })}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {place.phone && (
                  <>
                    <a
                      href={getHandoffUrl(place, 'whatsapp')}
                      onClick={() => handleClick(place, 'whatsapp')}
                      className="flex-1 bg-green-100 text-green-700 text-center py-2 px-3 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                    >
                      💬 WhatsApp
                    </a>
                    <a
                      href={getHandoffUrl(place, 'call')}
                      onClick={() => handleClick(place, 'call')}
                      className="flex-1 bg-blue-100 text-[#0047ad] text-center py-2 px-3 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                    >
                      📞 {t('common.call')}
                    </a>
                  </>
                )}
                {place.lat && place.lng && (
                  <button
                    onClick={() => handleClick(place, 'directions')}
                    className="flex-1 bg-primary-100 text-primary-700 text-center py-2 px-3 rounded-lg text-sm font-medium hover:bg-primary-200 transition-colors"
                  >
                    🗺️ {t('common.go')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Provider Sheet */}
      {selectedPlace && selectedPlace.lat && selectedPlace.lng && (
        <ProviderSheet
          isOpen={providerSheetOpen}
          onClose={() => setProviderSheetOpen(false)}
          placeId={selectedPlace.place_id || 'unknown'}
          placeName={selectedPlace.name}
          lat={selectedPlace.lat}
          lng={selectedPlace.lng}
          category={selectedPlace.category}
        />
      )}
    </div>
  );
}
