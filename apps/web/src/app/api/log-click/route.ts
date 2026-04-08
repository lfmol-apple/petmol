/**
 * API Route: /api/log-click
 * Envia logs de clicks para o backend FastAPI para analytics
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Tenta enviar para o backend FastAPI (Motor de Intenção)
    try {
      const response = await fetch(`${BACKEND_URL}/analytics/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'places_map',
          cta_type: (body.action as string) || 'place_click',
          target: (body.placeId as string) || undefined,
          metadata: {
            service: body.service,
            is_partner: body.isPartner,
            lat: body.lat,
            lng: body.lng,
          },
        }),
      });

      if (!response.ok) {
        console.error('Backend analytics error:', response.status);
      }
    } catch (backendError) {
      console.error('Backend analytics unavailable:', backendError);
    }

    // Sempre retorna sucesso para não quebrar UX
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error in /api/log-click:', error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
