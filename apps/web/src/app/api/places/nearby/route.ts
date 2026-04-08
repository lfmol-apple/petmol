import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
const ENABLED = process.env.PLACES_AUTOCOMPLETE_ENABLED === 'true';

export async function GET(request: NextRequest) {
  if (!ENABLED) {
    return NextResponse.json({ results: [], status: 'DISABLED' });
  }

  const searchParams = request.nextUrl.searchParams;
  const queryString = searchParams.toString();

  try {
    const response = await fetch(`${BACKEND_URL}/places/nearby?${queryString}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ results: [], status: 'DISABLED' });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying to backend:', error);
    return NextResponse.json({ results: [], status: 'DISABLED' });
  }
}
