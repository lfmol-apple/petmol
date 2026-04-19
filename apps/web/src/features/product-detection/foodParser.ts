import type { ResolvedProduct } from './types';

// ── Marcas conhecidas BR (ordem: mais específica primeiro) ─────────────────
const KNOWN_BRANDS: string[] = [
  "hill's science diet", "hills science diet", "hill's",
  'royal canin', 'pro plan', 'proplan',
  'premier pet', 'premier',
  'farmina n&d', 'farmina',
  'golden special', 'golden',
  'guabi natural', 'guabi',
  'formula natural', 'formula nat',
  'quatree', 'special dog', 'special cat',
  'pedigree', 'whiskas', 'friskies', 'fancy feast', 'felix', 'sheba',
  'purina', 'eukanuba', 'iams',
  'orijen', 'acana',
  'biofresh', 'naturalys', 'magnus', 'hercules',
  'three cats', 'equilibrio', 'equilíbrio',
  'vitarino', 'nutrapet', 'nutriplan', 'nutridog', 'nutricat',
  'alpo', 'beneful', 'dog chow', 'cat chow',
  'taste of the wild', 'blue buffalo', 'wellness', 'instinct',
  'merrick', 'canidae', 'diamond',
  'bassar', 'selection', 'smartheart', 'vitalcan',
  'total', 'finotrato', 'baw waw',
];

// ── Correções OCR comuns ────────────────────────────────────────────────────
const OCR_CORRECTIONS: Array<[RegExp, string]> = [
  [/g0lden/gi, 'Golden'],
  [/g[o0]lden/gi, 'Golden'],
  [/pr[e3]mi[e3]r/gi, 'Premier'],
  [/r[o0]yal\s*c[a4]nin/gi, 'Royal Canin'],
  [/r[o0]yal/gi, 'Royal'],
  [/c[a4@]nin/gi, 'Canin'],
  [/pu[rn][i1]na/gi, 'Purina'],
  [/p[e3]digrr?[e3]/gi, 'Pedigree'],
  [/wh[i1]skas/gi, 'Whiskas'],
  [/f[a4@]rm[i1]na/gi, 'Farmina'],
  [/gu[a4@]b[i1]/gi, 'Guabi'],
  [/h[i1]ll'?s?/gi, "Hill's"],
  [/sc[i1][e3]nc[e3]/gi, 'Science'],
  [/[i1]ams/gi, 'Iams'],
  [/eukan[u0]ba/gi, 'Eukanuba'],
  [/\b0(?=[a-z])/gi, 'o'],  // zero seguido de letra → 'o'
];

// ── Padrões semânticos ─────────────────────────────────────────────────────
const SPECIES_RULES: Array<{ re: RegExp; value: 'dog' | 'cat' }> = [
  { re: /\b(cachorro|cao|cão|caes|cães|dog|canino|canine)\b/i, value: 'dog' },
  { re: /\b(gato|gatos|cat|cats|felino|felinos|feline)\b/i, value: 'cat' },
];

const LIFE_STAGE_RULES: Array<{ re: RegExp; value: 'puppy' | 'adult' | 'senior' | 'all' }> = [
  { re: /\b(filhote|filhotes|puppy|puppies|junior|kitten|kittens)\b/i, value: 'puppy' },
  { re: /\b(senior|s[eê]nior|idoso|idosa|geriatrico|ger[ií]atric|mature|7\+|11\+)\b/i, value: 'senior' },
  { re: /\b(adulto|adultos|adult|adults)\b/i, value: 'adult' },
  { re: /\b(todas as idades|all life|all ages|todas as fases|todas idades)\b/i, value: 'all' },
];

const PORT_RULES: Array<{ re: RegExp; value: 'mini' | 'small' | 'medium' | 'large' | 'giant' }> = [
  { re: /\b(mini|toy|extra\s?small|\bxs\b)\b/i, value: 'mini' },
  { re: /\b(small|pequeno\s?porte|pequenos?|peq\.?\s*porte)\b/i, value: 'small' },
  { re: /\b(medium|m[eé]dio\s?porte|m[eé]dios?|med\.?\s*porte)\b/i, value: 'medium' },
  { re: /\b(large|grande\s?porte|grandes?|gde\.?\s*porte)\b/i, value: 'large' },
  { re: /\b(giant|gigante\s?porte|gigantes?)\b/i, value: 'giant' },
];

const WEIGHT_RE = /\b(\d+(?:[,.]\d+)?)\s*(kg|g)\b/i;

// ── Tipos ──────────────────────────────────────────────────────────────────
export interface FoodFields {
  brand?: string;
  brandMatchMode?: 'exact' | 'fuzzy';
  species?: 'dog' | 'cat' | 'other';
  lifeStage?: 'puppy' | 'adult' | 'senior' | 'all';
  weight?: string;
  port?: 'mini' | 'small' | 'medium' | 'large' | 'giant';
  searchQuery: string;
}

export interface BrandMatch {
  brand: string;
  mode: 'exact' | 'fuzzy';
}

// ── Utilitários ────────────────────────────────────────────────────────────
function norm(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function applyOcr(text: string): string {
  let s = text;
  for (const [re, rep] of OCR_CORRECTIONS) s = s.replace(re, rep);
  return s;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeFoodWeight(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = normalizeWhitespace(raw)
    .replace(/(\d)\s*[,.:]\s*(\d)/g, '$1,$2')
    .replace(/(\d)\s*([kK])\s*[gG]\b/g, '$1 kg')
    .replace(/(\d)\s*[gG]\b/g, '$1 g');
  const match = cleaned.match(/\b(\d+(?:[,.]\d+)?)\s*(kg|g)\b/i);
  if (!match) return undefined;
  return `${match[1].replace('.', ',')} ${match[2].toLowerCase()}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function fuzzyMatchBrandDetails(text: string): BrandMatch | undefined {
  const n = norm(text);
  // exact substring match first (fastest)
  for (const brand of KNOWN_BRANDS) {
    if (n.includes(norm(brand))) return { brand, mode: 'exact' };
  }
  // 1-edit-distance fuzzy for brands ≥ 6 chars
  for (const brand of KNOWN_BRANDS) {
    if (brand.length < 6) continue;
    const nb = norm(brand);
    for (let i = 0; i <= n.length - nb.length + 1; i++) {
      if (levenshtein(n.slice(i, i + nb.length), nb) <= 1) {
        return { brand, mode: 'fuzzy' };
      }
    }
  }
  return undefined;
}

export function fuzzyMatchBrand(text: string): string | undefined {
  return fuzzyMatchBrandDetails(text)?.brand;
}

// ── Extração principal ─────────────────────────────────────────────────────
export function extractFoodFields(rawText: string): FoodFields {
  const corrected = applyOcr(rawText);
  const sanitized = normalizeWhitespace(corrected);

  const brandMatch = fuzzyMatchBrandDetails(sanitized);
  const brand = brandMatch?.brand;

  let species: FoodFields['species'];
  for (const { re, value } of SPECIES_RULES) {
    if (re.test(sanitized)) { species = value; break; }
  }

  let lifeStage: FoodFields['lifeStage'];
  for (const { re, value } of LIFE_STAGE_RULES) {
    if (re.test(sanitized)) { lifeStage = value; break; }
  }

  const wm = sanitized.match(WEIGHT_RE);
  const weight = normalizeFoodWeight(wm ? `${wm[1]} ${wm[2]}` : undefined);

  let port: FoodFields['port'];
  for (const { re, value } of PORT_RULES) {
    if (re.test(sanitized)) { port = value; break; }
  }

  const parts: string[] = [];
  if (brand) parts.push(brand);
  if (lifeStage && lifeStage !== 'all') {
    parts.push(lifeStage === 'puppy' ? 'filhote' : lifeStage === 'senior' ? 'senior' : 'adulto');
  }
  if (species) parts.push(species === 'dog' ? 'cão' : 'gato');
  if (port) parts.push(port);
  if (weight) parts.push(weight);
  if (parts.length === 0) parts.push(sanitized.split('\n')[0].trim().slice(0, 60));

  return {
    brand,
    brandMatchMode: brandMatch?.mode,
    species,
    lifeStage,
    weight,
    port,
    searchQuery: parts.join(' '),
  };
}

// ── Enriquecimento de produto já resolvido ─────────────────────────────────
export function enrichFoodProduct(product: ResolvedProduct): ResolvedProduct {
  if (product.category !== 'food') return product;

  const source = [product.name, product.brand, product.presentation, product.weight]
    .filter(Boolean)
    .join(' ');
  const fields = extractFoodFields(source);

  return {
    ...product,
    brand: product.brand ?? fields.brand,
    weight: product.weight ?? fields.weight,
    presentation: product.presentation ?? fields.weight,
  };
}

// ── Fallback: monta nome parcial para confirmação assistida ───────────────
export function buildPartialFoodName(
  brand?: string | null,
  probableName?: string | null,
  species?: string | null,
  lifeStage?: string | null,
  weight?: string | null,
  line?: string | null,
  size?: string | null,
  flavor?: string | null,
  visibleText?: string | null,
  reason?: string | null,
): string | null {
  const sourceText = [visibleText, probableName, reason].filter(Boolean).join(' ');
  const extracted = extractFoodFields(sourceText);
  const normalizedWeight = normalizeFoodWeight(weight) ?? extracted.weight;
  const resolvedBrand = brand?.trim() || extracted.brand;
  const resolvedSpecies = species?.trim() || extracted.species;
  const resolvedLifeStage = lifeStage?.trim() || extracted.lifeStage;
  const normalizedLine = line?.trim();
  const normalizedSize = size?.trim();
  const normalizedFlavor = flavor?.trim();
  const speciesLabel = resolvedSpecies === 'dog'
    ? 'Cão'
    : resolvedSpecies === 'cat'
      ? 'Gato'
      : resolvedSpecies || undefined;
  const lifeStageLabel = resolvedLifeStage === 'puppy'
    ? 'Filhote'
    : resolvedLifeStage === 'adult'
      ? 'Adulto'
      : resolvedLifeStage === 'senior'
        ? 'Sênior'
        : resolvedLifeStage === 'all'
          ? 'Todas as idades'
          : resolvedLifeStage || undefined;

  const parts = [
    resolvedBrand,
    normalizedLine,
    lifeStageLabel,
    speciesLabel,
    normalizedSize,
    normalizedFlavor,
    normalizedWeight,
  ]
    .filter(Boolean)
    .map(part => normalizeWhitespace(String(part)));

  if (parts.length === 0 && probableName?.trim()) {
    parts.push(normalizeWhitespace(probableName).slice(0, 80));
  }
  if (parts.length === 0 && sourceText.trim()) {
    parts.push(normalizeWhitespace(sourceText).slice(0, 80));
  }

  return parts.length > 0 ? parts.join(' ') : null;
}
