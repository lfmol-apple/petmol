import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export const dynamic = 'force-dynamic';

async function proxyHandoff(request: Request) {
  const url = new URL(request.url);

  const fallback = url.searchParams.get('fallback');
  url.searchParams.delete('fallback');

  const target = `${BACKEND_URL}/handoff/doglife?${url.searchParams.toString()}`;

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
    });

    const location = upstream.headers.get('location');
    if (location) {
      return NextResponse.redirect(location, { status: 302 });
    }

    if (upstream.status === 503 && fallback) {
      return NextResponse.redirect(decodeURIComponent(fallback), { status: 302 });
    }

    return NextResponse.redirect('/go/error?reason=handoff_failed', { status: 302 });
  } catch (error) {
    console.error('[api/handoff/doglife] upstream error', error);
    if (fallback) {
      return NextResponse.redirect(decodeURIComponent(fallback), { status: 302 });
    }
    return NextResponse.redirect('/go/error?reason=handoff_failed', { status: 302 });
  }
}

export { proxyHandoff as GET, proxyHandoff as POST };
