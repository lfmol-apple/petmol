/**
 * API Route: /api/place-contact
 * Proxy para Firebase Cloud Function getPlaceContact
 * FALLBACK: Se Functions não disponível, usa Google API direto (dev only)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Kill switch global — PLACES_ENABLED=false por padrão (custo zero)
const PLACES_ENABLED = process.env.PLACES_ENABLED === 'true';

const FUNCTIONS_BASE_URL = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_URL || process.env.FIREBASE_FUNCTIONS_URL;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export async function GET(request: NextRequest) {
  // Kill switch: retorna null sem chamar Firebase nem Google
  if (!PLACES_ENABLED) {
    const id = request.nextUrl.searchParams.get('id') || '';
    return NextResponse.json({ id, nationalPhoneNumber: null, websiteUri: null, disabled: true });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required param: id' },
        { status: 400 }
      );
    }

    // Try Firebase Functions first
    if (FUNCTIONS_BASE_URL) {
      try {
        const functionUrl = `${FUNCTIONS_BASE_URL}/getPlaceContact?id=${encodeURIComponent(id)}`;
        const response = await fetch(functionUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json(data);
        }
      } catch (err) {
        console.warn('Firebase Functions error, using fallback');
      }
    }

    // FALLBACK: Direct Google API call
    if (!GOOGLE_API_KEY) {
      return NextResponse.json({
        id,
        nationalPhoneNumber: null,
        websiteUri: null,
      });
    }

    const googleResponse = await fetch(`https://places.googleapis.com/v1/${id}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'nationalPhoneNumber,websiteUri',
      },
    });

    if (!googleResponse.ok) {
      console.error('Google API error');
      return NextResponse.json({
        id,
        nationalPhoneNumber: null,
        websiteUri: null,
      });
    }

    const data = await googleResponse.json();
    return NextResponse.json({
      id,
      nationalPhoneNumber: data.nationalPhoneNumber || null,
      websiteUri: data.websiteUri || null,
    });
  } catch (error: unknown) {
    console.error('Error in /api/place-contact:', error);
    return NextResponse.json({
      id: request.nextUrl.searchParams.get('id') || '',
      nationalPhoneNumber: null,
      websiteUri: null,
    });
  }
}
