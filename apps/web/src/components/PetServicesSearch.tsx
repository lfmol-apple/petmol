'use client';

import { useState, useEffect } from 'react';
import { track } from '@/lib/analytics';

interface PlaceItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  isPartner: boolean;
  distanceMeters: number;
}

interface PlacesSearchResponse {
  meta: {
    cache: string;
    googleCount: number;
    partnerCount: number;
    radius: number;
    geohash: string;
    durationMs: number;
  };
  results: PlaceItem[];
}

interface PlaceContact {
  id: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
}

interface PetServicesSearchProps {
  service: 'emergencia' | 'banho_tosa' | 'petshop';
  title: string;
  icon: string;
  description: string;
  backHref?: string;
}

// Helper functions
const formatDistance = (meters: number): string => {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};

const isWhatsAppNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return /^55\d{2}9\d{8}$/.test(cleaned);
};

export function PetServicesSearch({
  service,
  title,
  icon,
  description,
  backHref = '/home',
}: PetServicesSearchProps) {
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(5000); // meters
  const [meta, setMeta] = useState<PlacesSearchResponse['meta'] | null>(null);
  const [loadingContact, setLoadingContact] = useState<Record<string, boolean>>({});
  const [contactCache, setContactCache] = useState<Record<string, PlaceContact>>({});
  const [searchFilter, setSearchFilter] = useState('');

  // Get user location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocalização não suportada neste dispositivo');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('[PetServices] Got location:', position.coords.latitude, position.coords.longitude);
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (err) => {
        console.error('[PetServices] Geolocation error:', err);
        setError(`Precisamos da sua localização para encontrar locais próximos. Por favor, permita o acesso.`);
        setLoading(false);
      }
    );
  }, []);

  // Search places via API
  useEffect(() => {
    if (!userLocation) return;

    setLoading(true);
    setError(null);

    const url = `/api/petservices?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=${radius}&service=${service}`;

    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<PlacesSearchResponse>;
      })
      .then((data) => {
        console.log('[PetServices] Search result:', data);
        setPlaces(data.results);
        setMeta(data.meta);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[PetServices] Search error:', err);
        setError('Erro ao buscar locais. Tente novamente.');
        setLoading(false);
      });
  }, [userLocation, radius, service]);

  // Fetch contact on-demand
  const fetchContact = async (placeId: string): Promise<PlaceContact | null> => {
    if (contactCache[placeId]) {
      return contactCache[placeId];
    }

    if (loadingContact[placeId]) return null;

    setLoadingContact((prev) => ({ ...prev, [placeId]: true }));

    try {
      const res = await fetch(`/api/place-contact?id=${encodeURIComponent(placeId)}`);
      if (!res.ok) throw new Error('Failed to fetch contact');
      const contact = await res.json();
      
      setContactCache((prev) => ({ ...prev, [placeId]: contact }));
      return contact;
    } catch (err) {
      console.error('Error fetching contact:', err);
      return null;
    } finally {
      setLoadingContact((prev) => ({ ...prev, [placeId]: false }));
    }
  };

  // Log click and perform action
  const handleAction = async (place: PlaceItem, action: 'whatsapp' | 'call' | 'waze' | 'gmaps') => {
    // Log analytics
    try {
      await fetch('/api/log-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.id,
          isPartner: place.isPartner,
          action,
          service,
          lat: place.lat,
          lng: place.lng,
          tsClient: Date.now(),
        }),
      });
    } catch (err) {
      console.warn('Failed to log click:', err);
    }

    // Track locally
    track('click_pet_service', { service, action, isPartner: place.isPartner });

    // Perform action
    if (action === 'waze') {
      window.open(`https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`, '_blank');
    } else if (action === 'gmaps') {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        window.location.href = `maps://?daddr=${place.lat},${place.lng}`;
      } else {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`, '_blank');
      }
    } else if (action === 'whatsapp' || action === 'call') {
      const contact = await fetchContact(place.id);
      if (!contact || !contact.nationalPhoneNumber) {
        alert('Telefone não disponível');
        return;
      }

      const phone = contact.nationalPhoneNumber.replace(/\D/g, '');

      if (action === 'whatsapp') {
        if (isWhatsAppNumber(phone)) {
          window.open(`https://wa.me/${phone}`, '_blank');
        } else {
          alert('Este número não é WhatsApp. Use a opção Ligar.');
        }
      } else if (action === 'call') {
        window.location.href = `tel:${phone}`;
      }
    }
  };

  // Filter places
  const filteredPlaces = places.filter((place) => {
    if (!searchFilter) return true;
    const name = place.name?.toLowerCase() || '';
    const filter = searchFilter.toLowerCase();
    return name.includes(filter);
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <a
            href={backHref}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:text-slate-900 mb-3"
          >
            <span>‹</span>
            <span>Voltar</span>
          </a>
          <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <span>{icon}</span>
            <span>{title}</span>
          </div>
          <div className="text-sm text-slate-600">{description}</div>
        </div>

        {/* Radius Selector */}
        <div className="mb-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-sm font-medium text-slate-700 mb-2">Raio de busca</div>
          <div className="flex gap-2">
            {[3000, 5000, 10000, 15000].map((r) => (
              <button
                key={r}
                onClick={() => setRadius(r)}
                className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition-colors ${
                  radius === r
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {r / 1000}km
              </button>
            ))}
          </div>
        </div>

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
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <div className="font-medium text-red-900 mb-2">Erro</div>
            <div className="text-sm text-red-700 mb-4">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Empty State - Filter */}
        {!loading && !error && filteredPlaces.length === 0 && places.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <div className="font-medium text-slate-900 mb-2">Nenhum resultado</div>
            <div className="text-sm text-slate-600">Tente outro filtro ou aumente o raio de busca</div>
          </div>
        )}

        {/* Empty State - No Results */}
        {!loading && !error && places.length === 0 && userLocation && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">📍</div>
            <div className="font-medium text-slate-900 mb-2">Nenhum local encontrado</div>
            <div className="text-sm text-slate-600 mb-4">
              Não encontramos locais nesta categoria próximos a você no raio de {radius / 1000}km.
              Tente aumentar o raio de busca.
            </div>
            <button
              onClick={() => setRadius(Math.min(radius * 2, 50000))}
              className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors"
            >
              Ampliar raio para {Math.min((radius * 2) / 1000, 50)}km
            </button>
          </div>
        )}

        {/* Places List */}
        {!loading && filteredPlaces.length > 0 && (
          <div className="space-y-4">
            {filteredPlaces.map((place) => {
              const contact = contactCache[place.id];
              const hasContact = contact && contact.nationalPhoneNumber;
              const phone = contact?.nationalPhoneNumber?.replace(/\D/g, '');
              const isWhatsApp = phone ? isWhatsAppNumber(phone) : false;

              return (
                <div
                  key={place.id}
                  className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-bold text-lg text-slate-900">
                          {place.name || 'Sem nome'}
                        </div>
                        {place.isPartner && (
                          <div className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                            ⭐ Parceiro
                          </div>
                        )}
                      </div>
                      {place.rating && (
                        <div className="text-sm text-slate-600 mb-1">
                          ⭐ {place.rating.toFixed(1)} ({place.userRatingCount || 0} avaliações)
                        </div>
                      )}
                      <div className="text-sm font-medium text-primary-600">
                        📍 {formatDistance(place.distanceMeters)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {loadingContact[place.id] && (
                      <div className="flex-1 py-2 px-4 bg-slate-100 text-slate-500 rounded-xl text-center">
                        Carregando contato...
                      </div>
                    )}
                    
                    {!loadingContact[place.id] && hasContact && (
                      <>
                        <button
                          onClick={() => handleAction(place, 'call')}
                          className="flex-1 min-w-[120px] py-2 px-4 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors"
                        >
                          📞 Ligar
                        </button>
                        {isWhatsApp && (
                          <button
                            onClick={() => handleAction(place, 'whatsapp')}
                            className="flex-1 min-w-[120px] py-2 px-4 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                          >
                            💬 WhatsApp
                          </button>
                        )}
                      </>
                    )}

                    {!loadingContact[place.id] && !hasContact && (
                      <button
                        onClick={() => fetchContact(place.id)}
                        className="flex-1 min-w-[120px] py-2 px-4 bg-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-300 transition-colors"
                      >
                        📞 Ver Telefone
                      </button>
                    )}

                    <button
                      onClick={() => handleAction(place, 'waze')}
                      className="flex-1 min-w-[120px] py-2 px-4 bg-blue-500 text-white rounded-xl font-medium hover:bg-[#0056D2] transition-colors"
                    >
                      🧭 Waze
                    </button>

                    <button
                      onClick={() => handleAction(place, 'gmaps')}
                      className="flex-1 min-w-[120px] py-2 px-4 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
                    >
                      📍 Google Maps
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
