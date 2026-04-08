import { NextResponse } from 'next/server';

// Use server-side env for backend URL (avoids CORS and works in standalone mode)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';

async function proxyHandoff(request: Request) {
  const url = new URL(request.url);

  // Accept params: partner, q, lead_id (passed through to backend)
  // Fallback URL is used when affiliate URL isn't configured yet (503).
  const fallback = url.searchParams.get('fallback');
  url.searchParams.delete('fallback'); // don't forward fallback to backend

  // ✅ Fixed: backend endpoint is /handoff/shop (not /handoff/shopping)
  const target = `${BACKEND_URL}/handoff/shop?${url.searchParams.toString()}`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
    });

    // Backend returns 302 with Location header on success
    const location = upstream.headers.get('location');
    if (location) {
      return NextResponse.redirect(location, { status: 302 });
    }

    // 503 = affiliate URL not configured yet → use fallback if provided
    if (upstream.status === 503 && fallback) {
      return NextResponse.redirect(decodeURIComponent(fallback), { status: 302 });
    }

    return NextResponse.redirect('/go/error?reason=handoff_failed', { status: 302 });
  } catch (error) {
    console.error('[api/handoff/shopping] upstream error', error);
    // On network error → use fallback if provided
    if (fallback) {
      return NextResponse.redirect(decodeURIComponent(fallback), { status: 302 });
    }
    return NextResponse.redirect('/go/error?reason=handoff_failed', { status: 302 });
  }
}

export { proxyHandoff as GET, proxyHandoff as POST };
