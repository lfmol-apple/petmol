/**
 * API Route: /api/petservices
 * Proxy para backend places/nearby
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Kill switch global — PLACES_ENABLED=false por padrão (custo zero)
const PLACES_ENABLED = process.env.PLACES_ENABLED === 'true';

// Use URL absoluta para produção e localhost para desenvolvimento
const BACKEND_URL = process.env.NODE_ENV === 'production' 
  ? 'http://127.0.0.1:8000'  
  : 'http://localhost:8000';

// Type mapping para converter tipos antigos para novos
const SERVICE_TYPE_MAP: Record<string, string> = {
  emergencia: 'vet_emergency',
  banho_tosa: 'grooming', 
  petshop: 'petshop',
  vet_clinic: 'vet_clinic',
};

interface BackendPlace {
  place_id: string;
  name?: string;
  lat: number;
  lng: number;
  address: string;
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: unknown;
  business_status?: string;
  types?: string[];
  distance?: number;
  phone?: string | null;
}

export async function GET(request: NextRequest) {
  // Kill switch: retorna lista vazia sem chamar o backend
  if (!PLACES_ENABLED) {
    return NextResponse.json({
      meta: { cache: 'DISABLED', googleCount: 0, partnerCount: 0, radius: 0, geohash: '', durationMs: 0 },
      results: [],
      disabled: true,
      message: 'Busca de serviços próximos desativada.',
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius') || '2000';
    const service = searchParams.get('service') || 'petshop';

    if (!lat || !lng) {
      return NextResponse.json(
        { error: 'Missing required params: lat, lng' },
        { status: 400 }
      );
    }

    // Mapear tipo de serviço para a nova API
    const category = SERVICE_TYPE_MAP[service] || 'petshop';
    
    // Chamar nova API /places/nearby (sem o prefixo /api que o nginx já vai adicionar)
    const quality = searchParams.get('quality') || 'eco';
    const placesUrl = `${BACKEND_URL}/places/nearby?lat=${lat}&lng=${lng}&category=${category}&radius_m=${radius}&limit=10&quality=${quality}`;
    
    const response = await fetch(placesUrl);
    
    if (!response.ok) {
      console.error('Places API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch places' },
        { status: response.status }
      );
    }
    
    const data = (await response.json()) as { places?: BackendPlace[] };
    
    // Converter formato para compatibilidade com frontend antigo
    const results = (data.places || []).map((place) => ({
      id: place.place_id,
      place_id: place.place_id,
      name: place.name || 'Sem nome',
      lat: place.lat,
      lng: place.lng,
      location: {
        latitude: place.lat,
        longitude: place.lng,
      },
      vicinity: place.address,
      rating: place.rating || 0,
      user_ratings_total: place.user_ratings_total || 0,
      userRatingCount: place.user_ratings_total || 0,
      opening_hours: place.opening_hours,
      businessStatus: place.business_status || 'OPERATIONAL',
      types: place.types || [category],
      isPartner: false,
      distance: place.distance || 0,
      distanceMeters: place.distance || 0,
      phone: place.phone || null,
    }));

    return NextResponse.json({
      meta: {
        cache: 'MISS',
        googleCount: results.length,
        partnerCount: 0,
        radius: parseInt(radius),
        geohash: '',
        durationMs: 0,
      },
      results,
    });
  } catch (error: unknown) {
    console.error('Error in /api/petservices:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
