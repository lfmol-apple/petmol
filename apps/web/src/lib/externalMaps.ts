/**
 * External Maps Integration - 100% Free Mode
 * Opens Google Maps with search query instead of using paid Places API
 */

export type PlacesKind = 'vet24h' | 'vetClinic' | 'petshop' | 'grooming';

/**
 * Get normalized locale from browser
 */
function getLocale(): string {
  if (typeof window === 'undefined') return 'en';
  
  const browserLocale = navigator.language || 'en';
  const lang = browserLocale.toLowerCase().split('-')[0];
  
  // Normalize to supported locales
  if (lang === 'pt' || lang === 'en' || lang === 'es') {
    return lang;
  }
  
  return 'other';
}

/**
 * Universal terms (always included, in English)
 */
const UNIVERSAL_TERMS: Record<PlacesKind, string> = {
  vet24h: 'veterinary 24',
  vetClinic: 'veterinary clinic', 
  petshop: 'pet shop',
  grooming: 'pet grooming',
};

/**
 * Local terms (only for pt/es, to enhance search)
 */
const LOCAL_TERMS: Record<string, Record<PlacesKind, string>> = {
  pt: {
    vet24h: 'Veterinário 24h',
    vetClinic: 'Clínica veterinária',
    petshop: 'Pet shop',
    grooming: 'Banho e tosa',
  },
  es: {
    vet24h: 'veterinario 24 horas',
    vetClinic: 'clinica veterinaria', 
    petshop: 'tienda de mascotas',
    grooming: 'peluquería canina',
  },
};

/**
 * Build search query for all languages
 */
function buildQuery(kind: PlacesKind): { query: string; locale: string } {
  const locale = getLocale();
  const english = UNIVERSAL_TERMS[kind];
  
  // Add local term for pt/es to improve search relevance
  const local = (locale === 'pt' || locale === 'es') 
    ? LOCAL_TERMS[locale][kind] 
    : '';
  
  // Combine local + universal (Maps searches by proximity automatically)
  const query = `${local} ${english}`.trim();
  
  return { query, locale };
}

/**
 * Generate Google Maps search URL (no API key needed)
 */
function googleMapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Main function: Start external maps search
 */
export function startPlaces(
  kind: PlacesKind, 
  opts?: { 
    onTrack?: (params: Record<string, unknown>) => void; 
    openInNewTab?: boolean;
  }
) {
  const { query, locale } = buildQuery(kind);
  const url = googleMapsSearchUrl(query);
  
  // Fire tracking if provided (fire-and-forget)
  if (opts?.onTrack) {
    try {
      opts.onTrack({
        kind,
        mode: 'SEARCH',
        provider: 'google_maps_url',
        locale,
        query,
        url,
      });
    } catch (error) {
      // Don't block redirect if tracking fails
      console.debug('Tracking failed:', error);
    }
  }
  
  // Open maps
  if (opts?.openInNewTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
}

/**
 * Utility: Get example URLs for testing
 */
export function getExampleUrls() {
  return {
    vet24h_pt: googleMapsSearchUrl('Veterinário 24h veterinary 24'),
    petshop_es: googleMapsSearchUrl('tienda de mascotas pet shop'), 
    grooming_other: googleMapsSearchUrl('pet grooming'),
  };
}