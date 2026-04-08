import { NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

function buildFallback(searchParams: URLSearchParams) {
  const q = searchParams.get('q') || '';
  const country = (searchParams.get('country') || 'BR').toUpperCase();

  return {
    suggestions: [],
    query: q,
    country,
    cached: true,
    fetched_at: new Date().toISOString(),
    providers_used: [],
    warning: 'Autocomplete offline, tentando fallback local.',
    shopping_handoff_url: q ? `/api/handoff/shopping?query=${encodeURIComponent(q)}&country=${country}` : null,
  };
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Proxy para o backend (FastAPI) mantendo query params
  const target = `${API_BASE_URL}/suggest?${url.searchParams.toString()}`;

  try {
    const upstream = await fetch(target, {
      headers: { Accept: 'application/json' },
      // Evita seguir redirects (não deve haver), mas garante comportamento previsível
      redirect: 'manual',
    });

    if (!upstream.ok) {
      return NextResponse.json(buildFallback(url.searchParams), { status: 200 });
    }

    // Retorna a resposta do backend como JSON bruto
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('[api/autocomplete] upstream error', error);
    return NextResponse.json(buildFallback(url.searchParams), { status: 200 });
  }
}
