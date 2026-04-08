'use client';

import { useI18n } from '@/lib/I18nContext';

interface GoogleShoppingButtonProps {
  productName: string;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullWidth?: boolean;
}

// Google domain by country code
const GOOGLE_DOMAINS: Record<string, string> = {
  // Americas
  BR: 'google.com.br',
  US: 'google.com',
  MX: 'google.com.mx',
  AR: 'google.com.ar',
  CO: 'google.com.co',
  CL: 'google.cl',
  PE: 'google.com.pe',
  CA: 'google.ca',
  
  // Europe
  PT: 'google.pt',
  ES: 'google.es',
  GB: 'google.co.uk',
  UK: 'google.co.uk',
  DE: 'google.de',
  FR: 'google.fr',
  IT: 'google.it',
  NL: 'google.nl',
  BE: 'google.be',
  PL: 'google.pl',
  AT: 'google.at',
  CH: 'google.ch',
  SE: 'google.se',
  NO: 'google.no',
  DK: 'google.dk',
  FI: 'google.fi',
  IE: 'google.ie',
  CZ: 'google.cz',
  RO: 'google.ro',
  HU: 'google.hu',
  GR: 'google.gr',
  
  // Asia Pacific
  AU: 'google.com.au',
  NZ: 'google.co.nz',
  JP: 'google.co.jp',
  KR: 'google.co.kr',
  IN: 'google.co.in',
  SG: 'google.com.sg',
  MY: 'google.com.my',
  TH: 'google.co.th',
  PH: 'google.com.ph',
  ID: 'google.co.id',
  VN: 'google.com.vn',
  TW: 'google.com.tw',
  HK: 'google.com.hk',
  
  // Middle East & Africa
  AE: 'google.ae',
  SA: 'google.com.sa',
  IL: 'google.co.il',
  ZA: 'google.co.za',
  EG: 'google.com.eg',
  TR: 'google.com.tr',
  
  // Russia & CIS
  RU: 'google.ru',
  UA: 'google.com.ua',
};

// Text translations
const TEXTS: Record<string, { button: string; finding: string; poweredBy: string }> = {
  'pt-BR': { button: 'Encontrar menor preço', finding: 'Buscando...', poweredBy: 'via Google Shopping' },
  'en': { button: 'Find lowest price', finding: 'Searching...', poweredBy: 'via Google Shopping' },
  'es': { button: 'Encontrar mejor precio', finding: 'Buscando...', poweredBy: 'via Google Shopping' },
  'fr': { button: 'Trouver le meilleur prix', finding: 'Recherche...', poweredBy: 'via Google Shopping' },
  'it': { button: 'Trova il prezzo migliore', finding: 'Cercando...', poweredBy: 'via Google Shopping' },
  'de-DE': { button: 'Günstigsten Preis finden', finding: 'Suchen...', poweredBy: 'via Google Shopping' },
  'ja-JP': { button: '最安値を探す', finding: '検索中...', poweredBy: 'via Google Shopping' },
  'zh-CN': { button: '找到最低价', finding: '搜索中...', poweredBy: 'via Google Shopping' },
  'ru-RU': { button: 'Найти лучшую цену', finding: 'Поиск...', poweredBy: 'via Google Shopping' },
  'tr-TR': { button: 'En iyi fiyatı bul', finding: 'Aranıyor...', poweredBy: 'via Google Shopping' },
};

export function GoogleShoppingButton({
  productName,
  variant = 'primary',
  size = 'md',
  className = '',
  fullWidth = false,
}: GoogleShoppingButtonProps) {
  const { geo, locale } = useI18n();
  
  // Get Google domain for user's country
  const googleDomain = GOOGLE_DOMAINS[geo.country] || 'google.com';
  
  // Build search URL
  const searchUrl = `https://www.${googleDomain}/search?tbm=shop&q=${encodeURIComponent(productName)}`;
  
  // Get translated text
  const texts = TEXTS[locale] || TEXTS['en'];
  
  // Size classes
  const sizeClasses = {
    sm: 'text-sm py-2 px-3',
    md: 'text-base py-3 px-5',
    lg: 'text-lg py-4 px-6',
  };
  
  // Variant classes
  const variantClasses = {
    primary: 'bg-gradient-to-r from-[#0056D2] to-violet-600 hover:from-[#0047ad] hover:to-violet-700 text-white shadow-lg hover:shadow-xl',
    secondary: 'bg-white hover:bg-slate-50 text-slate-800 border-2 border-slate-200 hover:border-slate-300',
    text: 'bg-transparent hover:bg-slate-100 text-[#0056D2] hover:text-[#003889]',
  };

  return (
    <a
      href={searchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center justify-center gap-2 rounded-xl font-semibold
        transition-all duration-200 transform hover:scale-[1.02]
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {/* Search icon */}
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      
      <span>{texts.button}</span>
      
      {/* External link icon */}
      <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

/**
 * Compact version for inline use
 */
export function GoogleShoppingLink({
  productName,
  children,
  className = '',
}: {
  productName: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { geo, locale } = useI18n();
  
  const googleDomain = GOOGLE_DOMAINS[geo.country] || 'google.com';
  const searchUrl = `https://www.${googleDomain}/search?tbm=shop&q=${encodeURIComponent(productName)}`;
  const texts = TEXTS[locale] || TEXTS['en'];

  return (
    <a
      href={searchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[#0056D2] hover:text-[#003889] hover:underline ${className}`}
    >
      {children || texts.button}
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

/**
 * Hero version for main CTA
 */
export function GoogleShoppingHero({ productName }: { productName: string }) {
  const { geo, locale } = useI18n();
  
  const googleDomain = GOOGLE_DOMAINS[geo.country] || 'google.com';
  const searchUrl = `https://www.${googleDomain}/search?tbm=shop&q=${encodeURIComponent(productName)}`;
  const texts = TEXTS[locale] || TEXTS['en'];

  return (
    <div className="bg-gradient-to-br from-blue-50 via-violet-50 to-purple-50 rounded-2xl p-6 text-center border border-blue-100">
      <div className="text-4xl mb-3">🔍</div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">
        {texts.button}
      </h3>
      <p className="text-slate-600 mb-4 text-sm">
        {texts.poweredBy} • {geo.country}
      </p>
      <a
        href={searchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="
          inline-flex items-center justify-center gap-2 
          bg-gradient-to-r from-[#0056D2] to-violet-600 
          hover:from-[#0047ad] hover:to-violet-700 
          text-white font-semibold text-lg
          py-4 px-8 rounded-xl
          shadow-lg hover:shadow-xl
          transition-all duration-200 transform hover:scale-[1.02]
        "
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        {texts.button}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    </div>
  );
}
