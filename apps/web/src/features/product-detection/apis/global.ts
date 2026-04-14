import type { ResolvedProduct } from '../types';
import { classifyProduct } from '../classifier';

// ── OpenFoodFacts ─────────────────────────────────────────────────────────────

async function tryOpenFoodFacts(barcode: string): Promise<ResolvedProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status !== 1 || !data.product) return null;
    const p = data.product as Record<string, string | undefined>;
    const name = p.product_name_pt || p.product_name || p.generic_name || '';
    if (!name) return null;
    const brand = p.brands?.split(',')[0]?.trim();
    const text = [name, brand, p.categories, p.labels].filter(Boolean).join(' ');
    return {
      barcode,
      name,
      brand,
      weight: p.quantity,
      image: p.image_small_url ?? p.image_url,
      category: classifyProduct(text),
      source: 'openfoodfacts',
    };
  } catch {
    return null;
  }
}

// ── UPCItemDB ─────────────────────────────────────────────────────────────────

async function tryUPCItemDB(barcode: string): Promise<ResolvedProduct | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.items?.[0] as Record<string, unknown> | undefined;
    if (!item?.title) return null;
    const name = item.title as string;
    const brand = item.brand as string | undefined;
    const image = (item.images as string[] | undefined)?.[0];
    const text = [name, brand, item.category].filter(Boolean).join(' ');
    return {
      barcode,
      name,
      brand,
      image,
      category: classifyProduct(text),
      source: 'upcitemdb',
    };
  } catch {
    return null;
  }
}

// ── Exported aggregator ───────────────────────────────────────────────────────

/**
 * Tries OpenFoodFacts and UPCItemDB in parallel.
 * Returns the first successful result, or null if both fail.
 */
export async function fetchFromGlobal(barcode: string): Promise<ResolvedProduct | null> {
  const [off, upc] = await Promise.allSettled([
    tryOpenFoodFacts(barcode),
    tryUPCItemDB(barcode),
  ]);
  if (off.status === 'fulfilled' && off.value) return off.value;
  if (upc.status === 'fulfilled' && upc.value) return upc.value;
  return null;
}
