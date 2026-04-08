import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Feature flag — set PLACES_AUTOCOMPLETE_ENABLED=true in .env.local to re-enable
const ENABLED = process.env.PLACES_AUTOCOMPLETE_ENABLED === 'true';

const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

interface GoogleAutocompletePrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

// Cache: input → {predictions, expiresAt}
const cache = new Map<string, { predictions: GoogleAutocompletePrediction[]; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function GET(request: NextRequest) {
  if (!ENABLED) {
    return NextResponse.json({ predictions: [], status: 'DISABLED' });
  }

  const input = request.nextUrl.searchParams.get('input')?.trim();

  if (!input || input.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  if (!GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ predictions: [], status: 'DISABLED' }, { status: 503 });
  }

  const cacheKey = input.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ predictions: cached.predictions, cached: true });
  }

  try {
    // Use Text Search to find veterinary-related establishments
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.append('input', input);
    url.searchParams.append('key', GOOGLE_PLACES_API_KEY);
    url.searchParams.append('language', 'pt-BR');
    url.searchParams.append('region', 'BR');
    url.searchParams.append('types', 'establishment');

    const response = await fetch(url.toString());
    const data = (await response.json()) as {
      status: string;
      error_message?: string;
      predictions?: GoogleAutocompletePrediction[];
    };

    if (!response.ok || (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')) {
      console.error('[places/autocomplete] Erro:', data.status, data.error_message);
      return NextResponse.json({ predictions: [], status: data.status, error: data.error_message });
    }

    const predictions = (data.predictions || []).slice(0, 5).map((p) => ({
      place_id: p.place_id,
      description: p.description,
      main_text: p.structured_formatting?.main_text || p.description,
      secondary_text: p.structured_formatting?.secondary_text || '',
    }));

    cache.set(cacheKey, { predictions, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ predictions, status: 'OK' });
  } catch (err) {
    console.error('[places/autocomplete] exception:', err);
    return NextResponse.json({ predictions: [], status: 'ERROR' }, { status: 500 });
  }
}
