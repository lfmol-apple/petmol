import { getLocalProduct, saveLocalProduct } from './cache';
import { fetchFromCosmos } from './apis/cosmos';
import { fetchFromGlobal } from './apis/global';
import type { ResolvedProduct } from './types';

export type { ResolvedProduct };
export { getLocalProduct, saveLocalProduct };

// Prevents concurrent resolutions for the same barcode.
const inFlight = new Set<string>();

/**
 * resolveProduct — multi-source product resolution pipeline.
 *
 * Priority order:
 *   1. Local cache   (localStorage, 30-day TTL — instant)
 *   2. Cosmos BR     (Brazilian EAN database, via /api/barcode proxy)
 *   3. Global APIs   (OpenFoodFacts + UPCItemDB, parallel)
 *   4. null          (not found — caller handles fallback)
 *
 * Thread-safe: concurrent calls for the same barcode return null
 * immediately so the UI never shows duplicate spinners.
 */
export async function resolveProduct(barcode: string): Promise<ResolvedProduct | null> {
  if (inFlight.has(barcode)) return null;
  inFlight.add(barcode);

  try {
    // 1. Cache — instant
    const cached = getLocalProduct(barcode);
    if (cached) return cached;

    // 2. Brazil-specific (Cosmos) — primary
    const fromCosmos = await fetchFromCosmos(barcode);
    if (fromCosmos) return fromCosmos;

    // 3. Global (OpenFoodFacts + UPCItemDB in parallel) — fallback
    const fromGlobal = await fetchFromGlobal(barcode);
    if (fromGlobal) return fromGlobal;

    // 4. Not found
    return null;
  } finally {
    inFlight.delete(barcode);
  }
}
