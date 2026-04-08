import { getPetmolClientId } from './clientId';

export type ApiError = {
  status?: number;
  message: string;
  details?: string;
  retryAfter?: number;
};

export async function apiFetchJson<T>(
  url: string,
  opts: RequestInit & { signal?: AbortSignal } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, {
      ...opts,
      cache: 'no-store',
      headers: {
        ...(opts.headers || {}),
        'X-PETMOL-CLIENT-ID': getPetmolClientId(),
      },
      signal: opts.signal,
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') || '30');
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: {
          status: 429,
          retryAfter,
          message: `HTTP 429 (aguarde ${retryAfter}s)`,
          details: text.slice(0, 600),
        },
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: {
          status: res.status,
          message: `HTTP ${res.status}`,
          details: text.slice(0, 600),
        },
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      // abort NÃO é erro para UI
      return { ok: false, error: { message: 'ABORTED' } };
    }
    return { ok: false, error: { message: err instanceof Error ? err.message : 'Failed to fetch', details: String(err) } };
  }
}
