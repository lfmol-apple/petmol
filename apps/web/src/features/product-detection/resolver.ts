import { getLocalProduct, saveLocalProduct } from './cache';
import type { ResolvedProduct } from './types';
import { API_BASE_URL } from '@/lib/api';
import { fetchFromCosmos } from './apis/cosmos';
import { fetchFromGlobal } from './apis/global';
import { enrichFoodProduct } from './foodParser';

export type { ResolvedProduct };
export { getLocalProduct, saveLocalProduct } from './cache';

type ProductLookupResponse = {
  ok: boolean;
  gtin: string;
  found: boolean;
  from_cache: boolean;
  queued: boolean;
  source?: ResolvedProduct['source'] | 'none' | null;
  error?: string | null;
  product?: {
    name?: string | null;
    brand?: string | null;
    category?: ResolvedProduct['category'] | string | null;
    image_url?: string | null;
    raw?: Record<string, unknown>;
  } | null;
};

const inFlight = new Map<string, Promise<ResolvedProduct | null>>();

function normalizeSource(source: ProductLookupResponse['source']): ResolvedProduct['source'] {
  if (source === 'cache' || source === 'cosmos' || source === 'history' || source === 'internal' || source === 'petmol_db') {
    return source;
  }
  return 'internal';
}

export async function resolveProductLookup(barcode: string): Promise<ProductLookupResponse | null> {
  try {
    console.info('[ProductScanner] lookupStarted', { barcode });
    const res = await fetch(`${API_BASE_URL}/products/lookup/gtin/${encodeURIComponent(barcode)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      console.info('[ProductScanner] lookupFailed', { barcode, status: res.status });
      return null;
    }

    const data = (await res.json()) as ProductLookupResponse;
    console.info('[ProductScanner] lookupResponse', {
      barcode,
      ok: data.ok,
      found: data.found,
      fromCache: data.from_cache,
      queued: data.queued,
      source: data.source,
      error: data.error,
    });
    return data;
  } catch {
    console.info('[ProductScanner] lookupException', { barcode });
    return null;
  }
}

async function resolveFreshProduct(barcode: string): Promise<ResolvedProduct | null> {
  const cached = getLocalProduct(barcode);
  if (cached) {
    console.info('[ProductScanner] cacheHit', { barcode, source: cached.source });
    return cached;
  }

  const data = await resolveProductLookup(barcode);
  if (data?.ok && data.found && data.product?.name) {
    const normalizedCategory = data.product.category;
    const category = (
      normalizedCategory === 'food' ||
      normalizedCategory === 'medication' ||
      normalizedCategory === 'antiparasite' ||
      normalizedCategory === 'dewormer' ||
      normalizedCategory === 'collar' ||
      normalizedCategory === 'hygiene' ||
      normalizedCategory === 'other'
    )
      ? normalizedCategory
      : 'other';

    const raw = data.product.raw ?? {};
    const manufacturer = typeof raw.manufacturer === 'string'
      ? raw.manufacturer
      : data.product.brand || undefined;
    const presentation = typeof raw.presentation === 'string'
      ? raw.presentation
      : undefined;
    const concentration = typeof raw.concentration === 'string'
      ? raw.concentration
      : undefined;
    const weight = typeof raw.weight === 'string'
      ? raw.weight
      : undefined;

    const product: ResolvedProduct = {
      barcode: data.gtin || barcode,
      name: data.product.name,
      brand: data.product.brand || undefined,
      image: data.product.image_url || undefined,
      weight,
      manufacturer,
      presentation,
      concentration,
      category,
      source: normalizeSource(data.source),
    };

    const enriched = enrichFoodProduct(product);
    saveLocalProduct(barcode, enriched);
    return enriched;
  }

  const cosmosProduct = await fetchFromCosmos(barcode);
  if (cosmosProduct) {
    console.info('[ProductScanner] cosmosFallbackHit', { barcode });
    const enriched = enrichFoodProduct(cosmosProduct);
    saveLocalProduct(barcode, enriched);
    return enriched;
  }

  const globalProduct = await fetchFromGlobal(barcode);
  if (globalProduct) {
    console.info('[ProductScanner] globalFallbackHit', { barcode });
    const enriched = enrichFoodProduct(globalProduct);
    saveLocalProduct(barcode, enriched);
    return enriched;
  }

  return null;
}

export async function resolveProduct(barcode: string): Promise<ResolvedProduct | null> {
  const existing = inFlight.get(barcode);
  if (existing) return existing;

  const pending = resolveFreshProduct(barcode)
    .finally(() => {
      inFlight.delete(barcode);
    });

  inFlight.set(barcode, pending);
  return pending;
}

export async function confirmProductLookup(product: {
  barcode?: string;
  name?: string;
  brand?: string;
  category?: ResolvedProduct['category'];
  manufacturer?: string;
  presentation?: string;
  source?: ResolvedProduct['source'] | 'user_confirmed';
}): Promise<void> {
  const barcode = product.barcode?.replace(/\D/g, '');
  const name = product.name?.trim();
  if (!barcode || !name) return;

  try {
    console.info('[ProductScanner] confirmLookupStarted', { barcode, name });
    const res = await fetch(`${API_BASE_URL}/product-lookup/confirm`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: barcode,
        name,
        brand: product.brand || null,
        category: product.category || 'other',
        manufacturer: product.manufacturer || product.brand || null,
        presentation: product.presentation || null,
        source: product.source || 'user_confirmed',
        confidence: 1,
      }),
      signal: AbortSignal.timeout(2500),
    });
    console.info('[ProductScanner] confirmLookupResponse', { barcode, status: res.status });
  } catch {
    console.info('[ProductScanner] confirmLookupException', { barcode });
  }
}
