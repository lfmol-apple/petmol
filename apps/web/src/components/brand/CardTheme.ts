/**
 * CardTheme — definições de temas para BrandedCard.
 * 4 temas: ocean | sunset | mint | midnight
 */

export type CardThemeName = 'ocean' | 'sunset' | 'mint' | 'midnight';

export interface CardThemeConfig {
  /** Classes Tailwind de fundo (fallback) */
  bgClass: string;
  /** CSS inline de fundo (sempre funciona, independente de Tailwind) */
  bgCss: string;
  /** Cor de texto principal */
  textClass: string;
  /** Cor para patinha (watermark) */
  wmColorClass: string;
  /** Opacidade da patinha (0–1) */
  wmOpacity: number;
  /** mix-blend-mode da patinha */
  wmBlend: string;
  /** Overlay sutil para garantir legibilidade */
  overlayClass?: string;
}

export const CARD_THEMES: Record<CardThemeName, CardThemeConfig> = {
  ocean: {
    bgClass: 'bg-gradient-to-br from-indigo-600 via-blue-600 to-slate-900',
    bgCss: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 50%, #0f172a 100%)',
    textClass: 'text-white',
    wmColorClass: 'text-white',
    wmOpacity: 0.08,
    wmBlend: 'soft-light',
  },
  sunset: {
    bgClass: 'bg-gradient-to-br from-orange-500 via-red-500 to-rose-700',
    bgCss: 'linear-gradient(135deg, #f97316 0%, #ef4444 50%, #be123c 100%)',
    textClass: 'text-white',
    wmColorClass: 'text-white',
    wmOpacity: 0.09,
    wmBlend: 'soft-light',
  },
  mint: {
    bgClass: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-700',
    bgCss: 'linear-gradient(135deg, #10b981 0%, #14b8a6 50%, #0e7490 100%)',
    textClass: 'text-white',
    wmColorClass: 'text-white',
    wmOpacity: 0.09,
    wmBlend: 'soft-light',
  },
  midnight: {
    bgClass: 'bg-gradient-to-br from-zinc-900 via-slate-900 to-indigo-950',
    bgCss: 'linear-gradient(135deg, #18181b 0%, #0f172a 50%, #1e1b4b 100%)',
    textClass: 'text-white',
    wmColorClass: 'text-indigo-300',
    wmOpacity: 0.10,
    wmBlend: 'overlay',
  },
};

/** Helper: retorna tema pelo nome (com fallback ocean) */
export function getTheme(name?: string | null): CardThemeConfig {
  return CARD_THEMES[(name as CardThemeName) ?? 'ocean'] ?? CARD_THEMES.ocean;
}
