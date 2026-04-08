/**
 * Brand Tokens - Sistema de design baseado na logomarca PETMOL
 * 
 * Cores extraídas de: /public/brand/logo.svg
 * - Primary: #7C3AED (roxo da patinha)
 * - Secondary: #0F172A (texto escuro)
 */

// ────────────────────────────────────────────────────────────────────────────
// CORES
// ────────────────────────────────────────────────────────────────────────────

export const brandColors = {
  // Cores principais da logo
  primary: '#7C3AED',       // Purple-600 (patinha + "MOL")
  secondary: '#0F172A',     // Slate-900 (texto "PET")
  
  // Variações de accent
  accent: '#A78BFA',        // Purple-400 (mais claro)
  accentDark: '#6D28D9',    // Purple-700 (mais escuro)
  accentLight: '#C4B5FD',   // Purple-300 (bem claro)
  
  // Text colors
  textOnBrand: '#FFFFFF',   // Branco (para fundos escuros)
  textSecondary: '#94A3B8', // Slate-400 (texto secundário)
  textMuted: '#CBD5E1',     // Slate-300 (texto desativado)
  
  // Background overlays
  glassOverlay: 'rgba(255, 255, 255, 0.1)',
  glassOverlayDark: 'rgba(15, 23, 42, 0.1)',
  
  // Dividers
  divider: '#E2E8F0',       // Slate-200
  dividerDark: '#334155',   // Slate-700
} as const;

// ────────────────────────────────────────────────────────────────────────────
// GRADIENTES (3 Variações para BrandedHeader)
// ────────────────────────────────────────────────────────────────────────────

export const brandGradients = {
  // Variant A: Glass (default) - Roxo claro -> Lilás
  glass: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
  glassSubtle: 'linear-gradient(135deg, rgba(124, 58, 237, 0.9) 0%, rgba(167, 139, 250, 0.9) 100%)',
  
  // Variant B: Ribbon - Roxo vibrante -> Rosa
  ribbon: 'linear-gradient(135deg, #7C3AED 0%, #C026D3 50%, #EC4899 100%)',
  ribbonSubtle: 'linear-gradient(135deg, rgba(124, 58, 237, 0.95) 0%, rgba(192, 38, 211, 0.95) 50%, rgba(236, 72, 153, 0.95) 100%)',
  
  // Variant C: Night - Roxo escuro -> Quase preto
  night: 'linear-gradient(135deg, #6D28D9 0%, #4C1D95 50%, #0F172A 100%)',
  nightSubtle: 'linear-gradient(135deg, rgba(109, 40, 217, 0.98) 0%, rgba(76, 29, 149, 0.98) 50%, rgba(15, 23, 42, 0.98) 100%)',
} as const;

// CSS inline para uso direto
export const brandGradientCss = {
  glass: brandGradients.glass,
  ribbon: brandGradients.ribbon,
  night: brandGradients.night,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// SOMBRAS
// ────────────────────────────────────────────────────────────────────────────

export const brandShadows = {
  // Sombra sutil (default, sem scroll)
  none: 'shadow-none',
  subtle: 'shadow-sm',
  
  // Sombra no scroll
  onScroll: 'shadow-lg',
  onScrollStrong: 'shadow-2xl',
  
  // Sombra para elementos elevados (modais, dropdowns)
  elevated: 'shadow-xl',
  
  // CSS inline
  subtleCss: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  onScrollCss: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  elevatedCss: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS
// ────────────────────────────────────────────────────────────────────────────

export const brandRadius = {
  // Cards e containers
  card: 'rounded-3xl',      // 1.5rem
  panel: 'rounded-2xl',     // 1rem
  button: 'rounded-xl',     // 0.75rem
  input: 'rounded-lg',      // 0.5rem
  
  // Header específico
  header: 'rounded-none',   // Header geralmente não tem bordas superiores
  headerBottom: 'rounded-b-2xl', // Bordas inferiores arredondadas
  
  // CSS inline (px)
  cardPx: '24px',
  panelPx: '16px',
  buttonPx: '12px',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// DIMENSÕES DO HEADER
// ────────────────────────────────────────────────────────────────────────────

export const headerDimensions = {
  // Altura do header (sem safe area) - otimizado para app
  height: '56px',           // Padrão iOS/Android app header
  heightSm: '52px',         // Mobile pequeno
  
  // Padding interno (reduzido para app)
  paddingX: '12px',
  paddingXSm: '8px',
  paddingY: '8px',
  
  // Logo
  logoHeight: '28px',       // Menor para apps
  logoWidth: 'auto',
  
  // Avatar/Icon slot (reduzido)
  avatarSize: '36px',       // Menor em apps
  avatarSizeSm: '32px',
  
  // Action buttons (mínimo touch target iOS)
  actionButtonSize: '44px', // Mínimo recomendado para touch (iOS HIG)
  actionIconSize: '22px',   // Ícones menores
  
  // Z-index
  zIndex: 50,
  zIndexDropdown: 100,
} as const;

// ────────────────────────────────────────────────────────────────────────────
// SAFE AREA INSETS (iOS/Android notch)
// ────────────────────────────────────────────────────────────────────────────

export const safeAreaPadding = {
  // CSS inline para uso em style prop
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  
  // Classes Tailwind (custom ou via plugin)
  // Nota: Requer config no tailwind.config.js ou uso inline
  topClass: 'pt-[env(safe-area-inset-top)]',
  bottomClass: 'pb-[env(safe-area-inset-bottom)]',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// BACKDROP BLUR (Glass Effect)
// ────────────────────────────────────────────────────────────────────────────

export const backdropBlur = {
  none: 'backdrop-blur-none',
  sm: 'backdrop-blur-sm',   // 4px
  md: 'backdrop-blur-md',   // 12px
  lg: 'backdrop-blur-lg',   // 16px
  xl: 'backdrop-blur-xl',   // 24px
  
  // Recomendado para header glass
  glass: 'backdrop-blur-md',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// TRANSIÇÕES
// ────────────────────────────────────────────────────────────────────────────

export const brandTransitions = {
  // Header scroll
  shadow: 'transition-shadow duration-200 ease-in-out',
  all: 'transition-all duration-200 ease-in-out',
  
  // Hover states
  hover: 'transition-colors duration-150 ease-in-out',
  
  // Transform (buttons, cards)
  transform: 'transition-transform duration-150 ease-in-out',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// THEME VARIANTS (para BrandedHeader)
// ────────────────────────────────────────────────────────────────────────────

export type HeaderVariant = 'glass' | 'ribbon' | 'night';

export const headerVariantConfig = {
  glass: {
    gradient: brandGradients.glassSubtle,
    textColor: brandColors.textOnBrand,
    iconColor: 'text-white',
    dividerColor: 'border-white/20',
    glassOverlay: brandColors.glassOverlay,
    backdropBlur: backdropBlur.glass,
  },
  ribbon: {
    gradient: brandGradients.ribbonSubtle,
    textColor: brandColors.textOnBrand,
    iconColor: 'text-white',
    dividerColor: 'border-white/30',
    glassOverlay: 'rgba(255, 255, 255, 0.15)',
    backdropBlur: backdropBlur.glass,
  },
  night: {
    gradient: brandGradients.nightSubtle,
    textColor: brandColors.textOnBrand,
    iconColor: 'text-purple-300',
    dividerColor: 'border-purple-500/30',
    glassOverlay: brandColors.glassOverlayDark,
    backdropBlur: backdropBlur.md,
  },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS DE CONVENIÊNCIA
// ────────────────────────────────────────────────────────────────────────────

export const brandTokens = {
  colors: brandColors,
  gradients: brandGradients,
  shadows: brandShadows,
  radius: brandRadius,
  header: headerDimensions,
  safeArea: safeAreaPadding,
  blur: backdropBlur,
  transitions: brandTransitions,
  variants: headerVariantConfig,
} as const;

export default brandTokens;
