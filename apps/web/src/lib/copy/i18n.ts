/**
 * Sistema de i18n leve para explicação Maps - Suporte GLOBAL
 * Suporta qualquer idioma do mundo via fallback para inglês
 */

export const UNIVERSAL_LINE = "🧭 Maps • ⭐ Reviews • ☎ Contact • 🛣 Routes";

/**
 * Obtém a tag de locale do navegador (ex: "pt-BR", "fr-FR", "ja-JP")
 * @returns string - locale tag ou "en" como fallback
 */
export function getLocaleTag(): string {
  if (typeof window === 'undefined') return 'en';
  
  // Verifica se há preferência salva
  const saved = localStorage.getItem('petmol_preferred_lang');
  if (saved && saved.length >= 2) {
    return saved;
  }
  
  return navigator.language || 'en';
}

/**
 * Extrai código de idioma ISO 639-1 da locale tag
 * @param localeTag - ex: "pt-BR", "fr-FR", "ja-JP"
 * @returns string - ex: "pt", "fr", "ja" ou "en" como fallback
 */
export function getLang(localeTag: string): string {
  if (!localeTag || localeTag.length < 2) return 'en';
  
  const lang = localeTag.substring(0, 2).toLowerCase();
  
  // Lista básica de códigos válidos
  const validLangs = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar', 'ru', 'hi'];
  
  return validLangs.includes(lang) ? lang : 'en';
}

/**
 * Obtém tradução para uma chave
 * @param key - chave da tradução
 * @param lang - código do idioma
 * @param translations - objeto com as traduções
 * @returns string - tradução ou a própria chave se não encontrar
 */
export function t(key: string, lang: string, translations: Record<string, Record<string, string>>): string {
  // Tenta no idioma solicitado
  if (translations[lang] && translations[lang][key]) {
    return translations[lang][key];
  }
  
  // Fallback para inglês
  if (translations['en'] && translations['en'][key]) {
    return translations['en'][key];
  }
  
  // Retorna a própria chave (para detectar traduções faltantes)
  return key;
}

/**
 * Salva preferência de idioma do usuário
 * @param lang - código do idioma (ex: "pt", "en", "es")
 */
export function setPreferredLang(lang: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('petmol_preferred_lang', lang);
}

/**
 * Obtém idioma atual baseado no navegador e preferências
 * @returns string - código do idioma atual
 */
export function getCurrentLang(): string {
  const localeTag = getLocaleTag();
  return getLang(localeTag);
}