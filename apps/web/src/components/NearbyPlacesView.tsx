'use client';

declare global {
  interface Window {
    track?: (event: string, data: Record<string, unknown>) => void;
  }
}

import { useState, useEffect } from 'react';
import { OsmMap } from '@/components/OsmMap';
import {
  overpassSearch,
  formatDistance,
  formatAddress,
  extractPhone,
  is24x7,
  getCachedSearch,
  setCachedSearch,
  buildCacheKey,
  type OsmPlace,
  type SearchOptions,
} from '@/lib/osm';
import { PremiumScreenShell, PremiumCard } from '@/components/premium';

interface NearbyPlacesViewProps {
  category: SearchOptions['category'];
  title: string;
  icon: string;
  description: string;
  backHref?: string;
}

export function NearbyPlacesView({
  category,
  title,
  icon,
  description,
  backHref = '/home',
}: NearbyPlacesViewProps) {
  const [places, setPlaces] = useState<OsmPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(5);
  const [searchFilter, setSearchFilter] = useState('');
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    // Get geolocation
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada neste dispositivo');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[NearbyPlaces] Got location:', position.coords.latitude, position.coords.longitude);
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (err) => {
        console.error('[NearbyPlaces] Geolocation error:', err);
        setError(`Precisamos da sua localização para encontrar locais próximos. Por favor, permita o acesso. (Erro: ${err.message})`);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    if (!userLocation) return;

    const searchOptions: SearchOptions = {
      lat: userLocation.lat,
      lon: userLocation.lon,
      radiusKm: radius,
      category,
    };

    const cacheKey = buildCacheKey(searchOptions);
    const cached = getCachedSearch(cacheKey);

    if (cached) {
      setPlaces(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    overpassSearch(searchOptions)
      .then((results) => {
        console.log('[NearbyPlaces] Search completed:', results.length, 'results');
        setPlaces(results);
        setCachedSearch(cacheKey, results, 900000); // 15 min cache
        setLoading(false);
      })
      .catch((err) => {
        console.error('[NearbyPlaces] Search error:', err);
        setError('Erro ao buscar locais. Tente novamente.');
        setLoading(false);
      });
  }, [userLocation, radius, category]);

  const filteredPlaces = places.filter((place) => {
    if (!searchFilter) return true;
    const name = place.name?.toLowerCase() || '';
    const addr = formatAddress(place.tags)?.toLowerCase() || '';
    const filter = searchFilter.toLowerCase();
    return name.includes(filter) || addr.includes(filter);
  });

  const openDirections = (place: OsmPlace) => {
    // Track event
    if (typeof window !== 'undefined' && window.track) {
      window.track('click_directions', { category, placeId: place.id });
    }

    // Try Waze first, fallback to Google Maps
    const wazeUrl = `https://waze.com/ul?ll=${place.lat},${place.lon}&navigate=yes`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;

    // For iOS, try Apple Maps
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      window.location.href = `maps://?daddr=${place.lat},${place.lon}`;
    } else {
      window.open(wazeUrl, '_blank');
    }
  };

  const openCall = (phone: string, placeId: string) => {
    if (typeof window !== 'undefined' && window.track) {
      window.track('click_call', { category, placeId });
    }
    window.location.href = `tel:${phone}`;
  };

  const openWhatsApp = (phone: string, placeId: string) => {
    if (typeof window !== 'undefined' && window.track) {
      window.track('click_whatsapp', { category, placeId });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}`, '_blank');
  };

  return (
    <PremiumScreenShell title={`${icon} ${title}`} subtitle={description} backHref={backHref}>
      <div className="space-y-4">
        {/* Radius Selector */}
        <PremiumCard>
          <div className="text-sm font-medium text-slate-700 mb-2">Raio de busca</div>
          <div className="flex gap-2">
            {[3, 5, 10, 20].map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                  radius === r
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {r}km
              </button>
            ))}
          </div>
        </PremiumCard>

        {/* Search Filter */}
        {places.length > 0 && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Filtrar por nome..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* Map Toggle */}
        {filteredPlaces.length > 0 && (
          <div className="mb-4">
            <button
              onClick={() => setShowMap(!showMap)}
              className="w-full py-3 rounded-xl border-2 border-primary-200 bg-white text-primary-600 font-medium hover:bg-primary-50 transition-colors"
            >
              {showMap ? '📋 Ver Lista' : '🗺️ Ver Mapa'}
            </button>
          </div>
        )}

        {/* Map View */}
        {showMap && filteredPlaces.length > 0 && userLocation && (
          <div className="mb-6 rounded-2xl overflow-hidden shadow-lg border border-slate-200">
            <OsmMap
              center={{ lat: userLocation.lat, lng: userLocation.lon }}
              markers={filteredPlaces.slice(0, 50).map((p) => ({
                id: p.id,
                lat: p.lat,
                lng: p.lon,
                title: p.name || 'Sem nome',
                subtitle: formatDistance(p.distance || 0),
              }))}
              zoom={13}
              className="w-full h-96"
            />
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
                <div className="h-4 bg-slate-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <PremiumCard variant="warning">
            <div className="text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <div className="font-medium mb-2">Erro</div>
              <div className="text-sm mb-4">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          </PremiumCard>
        )}

        {/* Empty State */}
        {!loading && !error && filteredPlaces.length === 0 && places.length > 0 && (
          <PremiumCard>
            <div className="text-center py-4">
              <div className="text-4xl mb-3">🔍</div>
              <div className="font-medium text-slate-900 mb-2">Nenhum resultado</div>
              <div className="text-sm text-slate-600">Tente outro filtro ou aumente o raio de busca</div>
            </div>
          </PremiumCard>
        )}

        {!loading && !error && places.length === 0 && userLocation && (
          <PremiumCard>
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📍</div>
              <div className="font-medium text-slate-900 mb-2">Nenhum local encontrado</div>
              <div className="text-sm text-slate-600 mb-4">
                Não encontramos locais nesta categoria próximos a você no raio de {radius}km.
                Tente aumentar o raio de busca.
              </div>
              <button
                onClick={() => setRadius(Math.min(radius * 2, 50))}
                className="px-6 py-2 bg-[#0056D2] text-white rounded-xl hover:bg-[#0047ad] transition-colors"
              >
                Ampliar raio para {Math.min(radius * 2, 50)}km
              </button>
            </div>
          </PremiumCard>
        )}

        {/* Places List */}
        {!loading && !showMap && filteredPlaces.length > 0 && (
          <div className="space-y-4">
            {filteredPlaces.map((place) => {
              const phone = extractPhone(place.tags);
              const address = formatAddress(place.tags);
              const is247 = is24x7(place.tags);

              return (
                <PremiumCard key={place.id} className="hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-bold text-lg text-slate-900 mb-1">
                        {place.name || 'Veterinário (sem nome)'}
                      </div>
                      {is247 && (
                        <div className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-lg mb-2">
                          🟢 Aberto 24h
                        </div>
                      )}
                      {address && (
                        <div className="text-sm text-slate-600 mb-1">{address}</div>
                      )}
                      <div className="text-sm font-medium text-primary-600">
                        📍 {formatDistance(place.distance || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {phone && (
                      <>
                        <button
                          onClick={() => openCall(phone, place.id)}
                          className="flex-1 min-w-[120px] py-2 px-4 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
                        >
                          📞 Ligar
                        </button>
                        <button
                          onClick={() => openWhatsApp(phone, place.id)}
                          className="flex-1 min-w-[120px] py-2 px-4 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                        >
                          💬 WhatsApp
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openDirections(place)}
                      className="flex-1 min-w-[120px] py-2 px-4 bg-blue-500 text-white rounded-xl font-medium hover:bg-[#0056D2] transition-colors"
                    >
                      🧭 Rotas
                    </button>
                  </div>
                </PremiumCard>
              );
            })}
          </div>
        )}
      </div>
    </PremiumScreenShell>
  );
}
