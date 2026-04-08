'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { RadiusControl } from '@/components/RadiusControl';
import { PlaceActionButtons } from '@/components/PlaceActionButtons';
import { apiFetchJson } from '@/lib/apiFetch';
import { useI18n } from '@/lib/I18nContext';
import { useLocation } from '@/contexts/LocationContext';
import { PremiumScreenShell } from '@/components/premium';

type Place = {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  rating?: number;
  rating_count?: number;
  open_now?: boolean;
  distance_meters?: number;
};

type EmergencyResponse = {
  places?: Place[];
  query_lat?: number;
  query_lng?: number;
  radius?: number;
  has_open: boolean;
  open_place?: Place | null;
  open_places?: Place[];
  nearby_places?: Place[];
  attribution?: string;
};

type PetservicesResult = {
  place_id?: string;
  id?: string;
  name?: string;
  displayName?: { text?: string };
  vicinity?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  geometry?: { location?: { lat?: number; lng?: number } };
  phone?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  userRatingCount?: number;
  opening_hours?: { open_now?: boolean };
  distance?: number;
};

export default function EmergencyPage() {
  const { geo, t } = useI18n();
  const location = useLocation();
  const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

  const [radiusMeters, setRadiusMeters] = useState(10000);
  const [fixedLocation, setFixedLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; details?: string } | null>(null);
  const [data, setData] = useState<EmergencyResponse | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(true);
  const [showServicesModal, setShowServicesModal] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const cooldownRef = useRef<number>(0);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [placesDisabled, setPlacesDisabled] = useState(false);

  // Fetch data with proper debouncing and caching
  const fetchData = useCallback(async () => {
    if (!fixedLocation) return;
    if (Date.now() < cooldownRef.current) return;

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    // Manter dados e erro anteriores visíveis durante carregamento

    try {
      // Usar Google Places API via proxy /api/petservices
      const params = new URLSearchParams({
        lat: String(fixedLocation.lat),
        lng: String(fixedLocation.lng),
        radius: String(radiusMeters),
        service: 'emergencia',
      });

      const response = await fetch(`/api/petservices?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Falha ao buscar veterinários de emergência');
      }

      const googleData = (await response.json()) as {
        error?: string;
        disabled?: boolean;
        results?: PetservicesResult[];
      };

      if (googleData.error) {
        setLoading(false);
        setInitialLoad(false);
        setError({
          title: t('emergency.search_error'),
          message: googleData.error,
        });
        return;
      }

      // Detectar kill switch
      if (googleData.disabled) {
        setPlacesDisabled(true);
        setLoading(false);
        setInitialLoad(false);
        setData({ places: [], nearby_places: [], query_lat: fixedLocation.lat, query_lng: fixedLocation.lng, radius: radiusMeters, has_open: false });
        return;
      }

      // Transformar resultados do Google Places para o formato esperado
      const transformedPlaces: Place[] = (googleData.results || []).map((place): Place => ({
        place_id: place.place_id || place.id || '',
        name: place.name || place.displayName?.text || 'Sem nome',
        address: place.vicinity || place.formattedAddress || '',
        lat: place.location?.latitude || place.geometry?.location?.lat || 0,
        lng: place.location?.longitude || place.geometry?.location?.lng || 0,
        phone: place.phone,
        website: place.website,
        rating: place.rating,
        rating_count: place.user_ratings_total || place.userRatingCount,
        open_now: place.opening_hours?.open_now,
        distance_meters: place.distance,
      }));

      setLoading(false);
      setInitialLoad(false);
      setError(null);
      setData({
        places: transformedPlaces,
        nearby_places: transformedPlaces,
        query_lat: fixedLocation.lat,
        query_lng: fixedLocation.lng,
        radius: radiusMeters,
        has_open: transformedPlaces.some((p) => p.open_now),
      });
      setLastUpdatedAt(Date.now());
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      
      setLoading(false);
      setInitialLoad(false);
      setError({
        title: t('emergency.search_error'),
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    }
  }, [fixedLocation, radiusMeters, API, geo.country, geo.locale, t]);

  useEffect(() => {
    if (!fixedLocation && location.isReady && location.latitude && location.longitude) {
      setFixedLocation({ lat: location.latitude, lng: location.longitude });
    }
  }, [fixedLocation, location.isReady, location.latitude, location.longitude]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-fetch com debounce quando parâmetros mudarem (só após confirmação)
  useEffect(() => {
    if (!fixedLocation || !userConfirmed) return;
    
    // Limpar timer anterior
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce de 450ms
    debounceTimerRef.current = setTimeout(() => {
      fetchData();
    }, initialLoad ? 0 : 450);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [fixedLocation, radiusMeters, initialLoad, fetchData]);

  const places = useMemo(() => {
    const nearby = data?.nearby_places || [];
    return nearby.slice().sort((a, b) => (a.distance_meters ?? 1e9) - (b.distance_meters ?? 1e9));
  }, [data]);

  const updatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return null;
    const minutes = Math.floor((now - lastUpdatedAt) / 60000);
    if (minutes <= 0) return t('common.updated_now');
    return t('common.updated_minutes_ago', { minutes });
  }, [lastUpdatedAt, now, t]);

  // Show location loading state
  if (location.loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="mb-4">
          <a
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:text-slate-900 mb-3"
          >
            <span>‹</span>
            <span>{t('common.back')}</span>
          </a>
          <div className="text-2xl font-bold text-slate-900">🏥 Veterinários</div>
          <div className="text-sm text-slate-600">Clínicas + Emergências 24h</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="animate-pulse text-4xl mb-3">📍</div>
          <div className="font-semibold text-slate-900 mb-2">{t('emergency.location.loading.title')}</div>
          <div className="text-sm text-slate-600 mb-4">{t('emergency.location.loading.message')}</div>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-[#0056D2] hover:text-[#0047ad] underline"
          >
            {t('emergency.location.loading.manual')}
          </button>
        </div>
      </div>
    );
  }

  // Show location error
  if (location.error) {
    return (
      <div className="max-w-xl mx-auto px-4 py-6">
        <div className="mb-4">
          <a
            href="/home"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:text-slate-900 mb-3"
          >
            <span>‹</span>
            <span>{t('common.back')}</span>
          </a>
          <div className="text-2xl font-bold text-slate-900">🏥 Veterinários</div>
          <div className="text-sm text-slate-600">Clínicas + Emergências 24h</div>
        </div>
        <div className="bg-white border border-amber-200 rounded-2xl p-6">
          <div className="font-bold text-slate-900">⚠️ {t('emergency.location.error.title')}</div>
          <div className="text-sm text-slate-700 mt-2">{location.error}</div>
          <div className="text-xs text-slate-600 mt-3 mb-4">
            {t('emergency.location.error.hint')}
          </div>
          <button
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => window.location.reload(),
                  (err) => alert(t('emergency.location.error.alert', { message: err.message }))
                );
              }
            }}
            className="w-full py-3 bg-[#0056D2] text-white rounded-xl font-semibold hover:bg-[#0047ad]"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <PremiumScreenShell
      title="🏥 Veterinários"
      subtitle="Clínicas + Emergências 24h"
      backHref="/home"
    >
      {/* Modal de Seleção de Serviços */}
      {showServicesModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">🔍</div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">BUSCAR SERVIÇOS</h2>
              <p className="text-sm text-slate-600">O que você precisa encontrar?</p>
            </div>
            
            <div className="space-y-2 mb-4">
              <button
                onClick={() => { setShowServicesModal(false); window.open('https://www.google.com/maps/search/?api=1&query=cl%C3%ADnica+veterin%C3%A1ria', '_blank', 'noopener,noreferrer'); }}
                className="w-full p-4 bg-gradient-to-r from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-2 border-blue-300 rounded-xl text-left transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🏥</div>
                  <div>
                    <div className="font-semibold text-slate-900">Clínicas Veterinárias</div>
                    <div className="text-xs text-slate-600">Abre no Google Maps</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => { setShowServicesModal(false); window.open('https://www.google.com/maps/search/?api=1&query=petshop+banho+e+tosa', '_blank', 'noopener,noreferrer'); }}
                className="w-full p-4 bg-gradient-to-r from-purple-50 to-purple-100 hover:from-purple-100 hover:to-purple-200 border-2 border-purple-300 rounded-xl text-left transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🛁</div>
                  <div>
                    <div className="font-semibold text-slate-900">Petshops</div>
                    <div className="text-xs text-slate-600">Abre no Google Maps</div>
                  </div>
                </div>
              </button>
              
              <button
                onClick={() => { setShowServicesModal(false); window.open('https://www.google.com/maps/search/?api=1&query=hotel+para+pet+creche+cachorro', '_blank', 'noopener,noreferrer'); }}
                className="w-full p-4 bg-gradient-to-r from-orange-50 to-orange-100 hover:from-orange-100 hover:to-orange-200 border-2 border-orange-300 rounded-xl text-left transition-all hover:scale-[1.02]"
              >
                <div className="flex items-center gap-3">
                  <div className="text-2xl">🏨</div>
                  <div>
                    <div className="font-semibold text-slate-900">Hotéis e Creches</div>
                    <div className="text-xs text-slate-600">Abre no Google Maps</div>
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={() => {
                setShowServicesModal(false);
                window.location.href = '/home';
              }}
              className="w-full py-3 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Emergência */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="text-center mb-4">
              <div className="text-5xl mb-3">🚨</div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">EMERGÊNCIA VETERINÁRIA?</h2>
              <p className="text-sm text-slate-600 mb-4">Situações de URGÊNCIA (risco de vida):</p>
            </div>
            
            <div className="text-left space-y-2 mb-6 text-sm text-slate-700 bg-red-50 p-4 rounded-xl">
              <div>• Intoxicação ou envenenamento</div>
              <div>• Atropelamento ou trauma grave</div>
              <div>• Dificuldade respiratória severa</div>
              <div>• Hemorragia ou sangramento intenso</div>
              <div>• Convulsões ou desmaios</div>
              <div>• Fraturas expostas</div>
            </div>

            <p className="text-center font-semibold text-slate-900 mb-4">
              Seu pet está em uma EMERGÊNCIA agora?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setShowServicesModal(true);
                }}
                className="flex-1 py-3 px-4 bg-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-300 transition-colors"
              >
                Não
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setUserConfirmed(true);
                }}
                className="flex-1 py-3 px-4 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
              >
                Sim, é emergência!
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <a
          href="/home"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm hover:text-slate-900 mb-3"
        >
          <span>‹</span>
          <span>{t('common.back')}</span>
        </a>
        <div className="text-2xl font-bold text-slate-900">🏥 Veterinários</div>
        <div className="text-sm text-slate-600">Clínicas + Emergências 24h</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        <div className="text-sm font-semibold text-slate-900 mb-3">� {t('emergency.radius.title')}</div>

        <RadiusControl valueMeters={radiusMeters} onChangeMeters={setRadiusMeters} presetsKm={[3, 5, 10]} />

        {cooldownUntil > Date.now() && (
          <div className="mt-3 text-xs text-amber-700">
            {t('services.rate_limit', { seconds: Math.ceil((cooldownUntil - Date.now()) / 1000) })}
          </div>
        )}
      </div>

      {loading && initialLoad && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center transition-all duration-300">
          <div className="animate-pulse mb-2 text-4xl">🏥</div>
          <div className="text-slate-700 font-medium">{t('emergency.loading.searching')}</div>
          <div className="text-xs text-slate-500 mt-1">Buscando clínicas e emergências</div>
        </div>
      )}

      {loading && !initialLoad && data && (
        <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-2xl p-4 text-center transition-all duration-300 animate-pulse">
          <div className="text-sm text-red-700 font-semibold">🔄 {t('services.updating')}</div>
        </div>
      )}

      {error && !data && (
        <div className="bg-white border border-amber-200 rounded-2xl p-4">
          <div className="font-bold text-slate-900">⚠️ {error.title}</div>
          <div className="text-sm text-slate-700 mt-1">{error.message}</div>
          {error.details && (
            <pre className="mt-3 text-xs bg-slate-50 p-3 rounded-xl overflow-auto whitespace-pre-wrap">{error.details}</pre>
          )}
        </div>
      )}

      {error && data && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mb-3">
          <div className="text-sm text-amber-800 font-semibold">⚠️ {error.title}</div>
          <div className="text-xs text-amber-700 mt-1">{error.message}</div>
          <button
            onClick={fetchData}
            className="mt-2 text-xs text-amber-800 underline"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {!initialLoad && location.isReady && data && (
        <div className="space-y-3 transition-all duration-300">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <div>{t('common.results_count', { count: places.length })}</div>
            <div className="flex items-center gap-3">
              {updatedLabel && <span>{updatedLabel}</span>}
              <button
                onClick={fetchData}
                className="underline text-slate-600 hover:text-slate-800"
              >
                {t('common.refresh')}
              </button>
            </div>
          </div>
          {data?.has_open && data?.open_place ? (
            <div className="bg-white border border-emerald-300 rounded-2xl p-4 shadow-md transition-all duration-300 hover:shadow-lg">
              <div className="text-xs text-emerald-700 font-semibold mb-1">✅ {t('common.open_now')}</div>
              <div className="font-bold text-slate-900">{data.open_place.name}</div>
              <div className="text-sm text-slate-600">{data.open_place.address}</div>
            </div>
          ) : null}

          {places.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              {placesDisabled ? (
                <>
                  <div className="font-bold text-slate-900">🏥 Emergências</div>
                  <div className="text-sm text-slate-600 mt-1">Em breve, você poderá encontrar veterinárias de emergência próximas a você.</div>
                  <div className="text-xs text-slate-500 mt-2">💡 Em caso de emergência, ligue 192 (SAMU) ou procure uma clínica veterinária 24h na sua região.</div>
                </>
              ) : (
                <>
                  <div className="font-bold text-slate-900">🏥 {t('emergency.none_found.title')}</div>
                  <div className="text-sm text-slate-600 mt-1">
                    {t('emergency.none_found.description')}
                  </div>
                  <button
                    className="mt-3 w-full py-3 rounded-2xl bg-slate-900 text-white font-semibold"
                    onClick={() => setRadiusMeters((r) => Math.min(r + 10000, 50000))}
                  >
                    📍 {t('emergency.none_found.expand')}
                  </button>
                </>
              )}
            </div>
          ) : (
            places.map((p, idx) => {
              // Detectar se é emergência 24h baseado no nome
              const nameLower = p.name.toLowerCase();
              const isEmergency = nameLower.includes('24') || 
                                nameLower.includes('plantão') || 
                                nameLower.includes('emergência') || 
                                nameLower.includes('emergency') || 
                                nameLower.includes('hospital');
              
              return (
                <div 
                  key={p.place_id} 
                  className={`bg-white border ${isEmergency ? 'border-red-300 shadow-md' : 'border-slate-200'} rounded-2xl p-4 transition-all duration-300 hover:shadow-lg`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="text-2xl">{isEmergency ? '🚨' : '🏥'}</span>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        {isEmergency && (
                          <div className="inline-block mt-1">
                            <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">
                              🚨 EMERGÊNCIA 24H
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {p.open_now !== undefined && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        p.open_now ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {p.open_now ? `✅ ${t('common.open')}` : `🔒 ${t('common.closed')}`}
                      </span>
                    )}
                  </div>

                <div className="text-sm text-slate-600 mb-2">{p.address}</div>

                <div className="flex items-center gap-3 mb-3 text-sm flex-wrap">
                  {p.rating && (
                    <div className="flex items-center gap-1">
                      <span className="text-amber-500">⭐</span>
                      <span className="font-semibold text-slate-900">{p.rating.toFixed(1)}</span>
                      {p.rating_count && (
                        <span className="text-slate-500">({p.rating_count})</span>
                      )}
                    </div>
                  )}
                  {p.distance_meters !== undefined && (
                    <div className="text-slate-600">
                      📍 {p.distance_meters < 1000 ? `${p.distance_meters}m` : `${(p.distance_meters / 1000).toFixed(1)}km`}
                    </div>
                  )}
                </div>

                {p.phone && (
                  <div className="text-sm text-slate-700 mb-3 flex items-center gap-1">
                    <span>📞</span>
                    <span className="font-medium">{p.phone}</span>
                  </div>
                )}

                <PlaceActionButtons
                  place={{
                    place_id: p.place_id,
                    name: p.name,
                    lat: p.lat,
                    lng: p.lng,
                    phone: p.phone
                  }}
                  service="emergency"
                  onAction={(action) => {
                    // Tracking removido (simplificação)
                  }}
                />
              </div>
              );
            })
          )}
        </div>
      )}
    </PremiumScreenShell>
  );
}
