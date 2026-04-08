import { NextRequest, NextResponse } from 'next/server';

// Kill switch global — PLACES_ENABLED=false por padrão (custo zero)
const PLACES_ENABLED = process.env.PLACES_ENABLED === 'true';

// Server-only key — NUNCA usar NEXT_PUBLIC_ (vazaria no bundle)
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

export async function GET(request: NextRequest) {
  // Kill switch
  if (!PLACES_ENABLED) {
    return NextResponse.json({ disabled: true, results: [], status: 'DISABLED' });
  }

  const searchParams = request.nextUrl.searchParams;
  const placeId = searchParams.get('place_id');
  const address = searchParams.get('address');

  if (!placeId && !address) {
    return NextResponse.json({ error: 'place_id or address required' }, { status: 400 });
  }

  try {
    let url: string;
    
    if (placeId) {
      // Get details from Place ID
      url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,geometry,formatted_address,formatted_phone_number&key=${GOOGLE_API_KEY}`;
    } else {
      // Geocode from address
      url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address!)}&key=${GOOGLE_API_KEY}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error('Geocoding error:', error);
    return NextResponse.json({ error: 'Failed to geocode' }, { status: 500 });
  }
}
