import type { ResolvedProduct } from '../types';
import { classifyProduct } from '../classifier';

interface CosmosProxyResponse {
  name?: string;
  brand?: string;
  image?: string;
  weight?: string;
}

/**
 * Fetches product data from Bluesoft Cosmos (Brazilian EAN database).
 * The request is proxied through the Next.js /api/barcode route so that
 * the Cosmos API token stays server-side and never leaks to the browser.
 *
 * Returns null on any error — caller must handle gracefully.
 */
export async function fetchFromCosmos(barcode: string): Promise<ResolvedProduct | null> {
  try {
    const res = await fetch(
      `/api/barcode?barcode=${encodeURIComponent(barcode)}&src=cosmos`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as CosmosProxyResponse;
    if (!data?.name) return null;

    const text = [data.name, data.brand].filter(Boolean).join(' ');
    return {
      barcode,
      name: data.name,
      brand: data.brand,
      image: data.image,
      weight: data.weight,
      category: classifyProduct(text),
      source: 'cosmos',
    };
  } catch {
    return null;
  }
}
