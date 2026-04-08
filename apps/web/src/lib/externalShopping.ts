/**
 * External Shopping Utility
 * 
 * Utilities to open Google Shopping with pet-related searches
 * 100% free, no API keys required
 */

/**
 * Get current language (2 letters) or fallback to 'en'
 */
export function getLang(): 'pt' | 'es' | 'en' | 'other' {
  if (typeof navigator === 'undefined') return 'en';
  
  const lang = navigator.language?.substring(0, 2)?.toLowerCase();
  if (lang === 'pt') return 'pt';
  if (lang === 'es') return 'es';
  if (lang === 'en') return 'en';
  return 'other';
}

/**
 * Normalize search query for Google Shopping
 */
export function normalizeQuery(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')  // Collapse whitespace
    .substring(0, 80);     // Limit to 80 chars
}

/**
 * Generate Google Shopping URL
 */
export function googleShoppingUrl(q: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}

/**
 * Open Google Shopping with the given query
 * 
 * @param userText User input text
 * @param opts Options for tracking and tab behavior
 */
export function openGoogleShopping(
  userText: string, 
  opts?: { 
    onTrack?: (payload: Record<string, unknown>) => void; 
    openInNewTab?: boolean;
  }
) {
  const lang = getLang();
  let q = normalizeQuery(userText);
  
  // Fallback queries if empty
  if (!q) {
    q = lang === 'pt' 
      ? 'produtos para pet'
      : lang === 'es'
      ? 'productos para mascotas'
      : 'pet supplies';
  }
  
  const url = googleShoppingUrl(q);
  
  // Optional tracking
  if (opts?.onTrack) {
    opts.onTrack({
      mode: 'SHOPPING',
      provider: 'google_shopping',
      lang,
      query: q,
      url
    });
  }
  
  // Open URL
  if (opts?.openInNewTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
}