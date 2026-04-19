import { getLocalProduct, saveLocalProduct } from './cache';
import type { ResolvedProduct } from './types';
import { API_BASE_URL } from '@/lib/api';
import { fetchFromCosmos } from './apis/cosmos';
import { fetchFromGlobal } from './apis/global';
import { buildPartialFoodName, enrichFoodProduct, extractFoodFields } from './foodParser';
import type { ProductCategory } from '@/lib/productScanner';

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

export interface ProductPhotoVisionPayload {
  found?: boolean;
  name?: string | null;
  probable_name?: string | null;
  brand?: string | null;
  category?: ProductCategory | null;
  weight?: string | null;
  size?: string | null;
  manufacturer?: string | null;
  presentation?: string | null;
  confidence?: number | null;
  reason?: string | null;
  species?: string | null;
  life_stage?: string | null;
  line?: string | null;
  flavor?: string | null;
  visible_text?: string | null;
}

export type ProductDetectionOrigin = 'gtin' | 'ia' | 'parser' | 'partial_name' | 'manual';
export type ProductDetectionResultType = 'complete' | 'partial' | 'fallback';
export type ProductDetectionConfidenceLevel = 'high' | 'medium' | 'low';

export interface ProductDetectionConfidence {
  score: number;
  level: ProductDetectionConfidenceLevel;
}

export interface ProductPhotoCandidate {
  product: ResolvedProduct;
  origin: ProductDetectionOrigin;
  resultType: ProductDetectionResultType;
  confidence: ProductDetectionConfidence;
}

const ALLOWED_CATEGORIES: ProductCategory[] = [
  'food',
  'medication',
  'antiparasite',
  'dewormer',
  'collar',
  'hygiene',
  'other',
];

const inFlight = new Map<string, Promise<ResolvedProduct | null>>();

function normalizeText(value?: string | null): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function normalizeCategory(category?: string | null, hint?: ProductCategory): ProductCategory {
  if (category && ALLOWED_CATEGORIES.includes(category as ProductCategory)) {
    return category as ProductCategory;
  }
  if (hint && ALLOWED_CATEGORIES.includes(hint)) {
    return hint;
  }
  return 'other';
}

function hasUsefulVisionPayload(payload: ProductPhotoVisionPayload): boolean {
  return Boolean(
    normalizeText(payload.name) ||
    normalizeText(payload.probable_name) ||
    normalizeText(payload.brand) ||
    normalizeText(payload.weight) ||
    normalizeText(payload.species) ||
    normalizeText(payload.life_stage) ||
    normalizeText(payload.line) ||
    normalizeText(payload.size) ||
    normalizeText(payload.flavor) ||
    normalizeText(payload.visible_text) ||
    payload.category,
  );
}

function toConfidenceLevel(score: number): ProductDetectionConfidenceLevel {
  if (score >= 0.8) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function scorePhotoCandidate(args: {
  payload: ProductPhotoVisionPayload;
  category: ProductCategory;
  brand?: string;
  weight?: string;
  hasPayloadName: boolean;
  usedParser: boolean;
  fuzzyBrand: boolean;
  species?: string | null;
  lifeStage?: string | null;
}): ProductDetectionConfidence {
  const baseAi = Number(args.payload.confidence ?? 0);
  let score = baseAi > 0 ? Math.min(0.65, baseAi * 0.65) : 0.2;

  if (args.hasPayloadName) score += 0.2;
  if (args.brand) score += 0.13;
  if (args.weight) score += 0.1;
  if (args.category === 'food' && (args.species || args.lifeStage)) score += 0.08;
  if (args.usedParser) score += 0.09;
  if (args.fuzzyBrand) score -= 0.07;

  const normalized = clampScore(score);
  return { score: normalized, level: toConfidenceLevel(normalized) };
}

export function resolvePhotoProductCandidate(
  payload: ProductPhotoVisionPayload,
  options?: { hint?: ProductCategory; barcode?: string },
): ProductPhotoCandidate | null {
  if (!hasUsefulVisionPayload(payload)) return null;

  const category = normalizeCategory(payload.category, options?.hint);
  const brand = normalizeText(payload.brand);
  const probableName = normalizeText(payload.probable_name);
  const visibleText = normalizeText(payload.visible_text);
  let weight = normalizeText(payload.weight);
  const manufacturer = normalizeText(payload.manufacturer) || brand;
  const presentation = normalizeText(payload.presentation) || weight;
  let name = normalizeText(payload.name) || probableName;
  let origin: ProductDetectionOrigin = normalizeText(payload.name) ? 'ia' : 'partial_name';
  let usedParser = false;
  let fuzzyBrand = false;

  if (!name && category === 'food') {
    usedParser = true;
    origin = 'parser';
    name = buildPartialFoodName(
      brand,
      probableName,
      payload.species,
      payload.life_stage,
      payload.weight,
      payload.line,
      payload.size,
      payload.flavor,
      visibleText,
      payload.reason,
    ) ?? undefined;
  }

  if (!name && category !== 'food') {
    const reasonHint = normalizeText(payload.reason)?.split('.')[0]?.trim();
    if (brand) {
      name = [brand, normalizeText(payload.line), weight].filter(Boolean).join(' ');
    } else if (reasonHint && reasonHint.length > 4) {
      name = reasonHint.slice(0, 80);
    } else if (visibleText) {
      name = visibleText.split('\n')[0]?.trim().slice(0, 80) || undefined;
    }
  }

  if (!name && category === 'food') {
    const fields = extractFoodFields([brand, probableName, visibleText, weight].filter(Boolean).join(' '));
    usedParser = true;
    origin = 'parser';
    fuzzyBrand = fields.brandMatchMode === 'fuzzy';
    weight = weight ?? fields.weight;
    const finalBrand = brand ?? fields.brand;
    name = [finalBrand, payload.species, payload.life_stage, weight]
      .filter(Boolean)
      .join(' ')
      .trim() || undefined;
  }

  if (!name) return null;

  const resolved: ResolvedProduct = {
    barcode: options?.barcode ?? '',
    name,
    brand,
    weight,
    manufacturer,
    presentation,
    category,
    source: 'internal',
  };
  const enriched = category === 'food' ? enrichFoodProduct(resolved) : resolved;
  const confidence = scorePhotoCandidate({
    payload,
    category,
    brand: enriched.brand,
    weight: enriched.weight,
    hasPayloadName: Boolean(normalizeText(payload.name)),
    usedParser,
    fuzzyBrand,
    species: payload.species,
    lifeStage: payload.life_stage,
  });
  const resultType: ProductDetectionResultType = confidence.level === 'low'
    ? 'fallback'
    : normalizeText(payload.name)
      ? 'complete'
      : 'partial';

  return {
    product: enriched,
    origin,
    resultType,
    confidence,
  };
}

export function scoreGtinResolution(source?: ResolvedProduct['source'] | null): ProductDetectionConfidence {
  const highSource = source === 'cache' || source === 'petmol_db' || source === 'history';
  const score = highSource ? 0.97 : source === 'cosmos' || source === 'internal' ? 0.92 : 0.86;
  return { score, level: toConfidenceLevel(score) };
}

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
