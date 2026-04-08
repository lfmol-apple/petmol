'use client';

import { useI18n } from '@/lib/I18nContext';

interface GlobalPriceCompareProps {
  productName: string;
  variant?: 'full' | 'compact';
}

// Store configurations by country
const STORES_BY_COUNTRY: Record<string, Array<{
  name: string;
  icon: string;
  color: string;
  urlTemplate: string;
  description: string;
}>> = {
  // Brazil
  BR: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.com.br/search?tbm=shop&q={query}',
      description: 'Compara todas as lojas',
    },
    {
      name: 'Cobasi',
      icon: '🐾',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://www.cobasi.com.br/pesquisa?searchTerms={query}',
      description: 'Maior rede pet do Brasil',
    },
    {
      name: 'Petz',
      icon: '🐶',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      urlTemplate: 'https://www.petz.com.br/busca?q={query}',
      description: 'Frete grátis em pedidos grandes',
    },
    {
      name: 'Mercado Livre',
      icon: '🛒',
      color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      urlTemplate: 'https://lista.mercadolivre.com.br/{query}',
      description: 'Milhares de vendedores',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.com.br/s?k={query}',
      description: 'Entrega rápida Prime',
    },
    {
      name: 'Shopee',
      icon: '🧡',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://shopee.com.br/search?keyword={query}',
      description: 'Cupons e frete grátis',
    },
  ],
  
  // United States
  US: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.com/search?tbm=shop&q={query}',
      description: 'Compare all stores',
    },
    {
      name: 'Chewy',
      icon: '🐕',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.chewy.com/s?query={query}',
      description: '#1 pet store online',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.com/s?k={query}',
      description: 'Fast Prime delivery',
    },
    {
      name: 'Petco',
      icon: '🐾',
      color: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200',
      urlTemplate: 'https://www.petco.com/shop/SearchDisplay?searchTerm={query}',
      description: 'Store pickup available',
    },
    {
      name: 'PetSmart',
      icon: '🏪',
      color: 'bg-red-50 hover:bg-red-100 border-red-200',
      urlTemplate: 'https://www.petsmart.com/search/?q={query}',
      description: 'Grooming & vet services',
    },
    {
      name: 'Walmart',
      icon: '🏬',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.walmart.com/search?q={query}',
      description: 'Everyday low prices',
    },
  ],

  // Portugal
  PT: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.pt/search?tbm=shop&q={query}',
      description: 'Compara todas as lojas',
    },
    {
      name: 'Tiendanimal',
      icon: '🐾',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      urlTemplate: 'https://www.tiendanimal.pt/pesquisa?controller=search&s={query}',
      description: 'Maior loja pet online',
    },
    {
      name: 'Zooplus',
      icon: '🐶',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://www.zooplus.pt/shop/search?q={query}',
      description: 'Entrega em toda Europa',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.es/s?k={query}',
      description: 'Amazon Espanha',
    },
  ],

  // Spain
  ES: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.es/search?tbm=shop&q={query}',
      description: 'Compara todas las tiendas',
    },
    {
      name: 'Tiendanimal',
      icon: '🐾',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      urlTemplate: 'https://www.tiendanimal.es/busqueda?controller=search&s={query}',
      description: 'Mayor tienda pet online',
    },
    {
      name: 'Zooplus',
      icon: '🐶',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://www.zooplus.es/shop/search?q={query}',
      description: 'Envío a toda Europa',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.es/s?k={query}',
      description: 'Entrega rápida Prime',
    },
    {
      name: 'El Corte Inglés',
      icon: '🏪',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      urlTemplate: 'https://www.elcorteingles.es/buscar/?s={query}+mascota',
      description: 'Grandes almacenes',
    },
  ],

  // United Kingdom
  GB: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.co.uk/search?tbm=shop&q={query}',
      description: 'Compare all stores',
    },
    {
      name: 'Pets at Home',
      icon: '🏠',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      urlTemplate: 'https://www.petsathome.com/shop/en/pets/search/{query}',
      description: 'UK\'s largest pet retailer',
    },
    {
      name: 'Zooplus',
      icon: '🐶',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://www.zooplus.co.uk/shop/search?q={query}',
      description: 'European delivery',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.co.uk/s?k={query}',
      description: 'Fast Prime delivery',
    },
  ],

  // Germany
  DE: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.de/search?tbm=shop&q={query}',
      description: 'Alle Shops vergleichen',
    },
    {
      name: 'Zooplus',
      icon: '🐶',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://www.zooplus.de/shop/search?q={query}',
      description: 'Europas größter Pet Shop',
    },
    {
      name: 'Fressnapf',
      icon: '🐾',
      color: 'bg-red-50 hover:bg-red-100 border-red-200',
      urlTemplate: 'https://www.fressnapf.de/suche/?q={query}',
      description: 'Alles für Ihr Tier',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.de/s?k={query}',
      description: 'Schnelle Prime-Lieferung',
    },
  ],

  // France
  FR: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.fr/search?tbm=shop&q={query}',
      description: 'Comparez toutes les boutiques',
    },
    {
      name: 'Zooplus',
      icon: '🐶',
      color: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      urlTemplate: 'https://www.zooplus.fr/shop/search?q={query}',
      description: 'Livraison dans toute l\'Europe',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.fr/s?k={query}',
      description: 'Livraison rapide Prime',
    },
  ],

  // Mexico
  MX: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.com.mx/search?tbm=shop&q={query}',
      description: 'Compara todas las tiendas',
    },
    {
      name: 'Petco México',
      icon: '🐾',
      color: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200',
      urlTemplate: 'https://www.petco.com.mx/buscar?q={query}',
      description: 'Tienda especializada',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.com.mx/s?k={query}',
      description: 'Entrega rápida Prime',
    },
    {
      name: 'Mercado Libre',
      icon: '🛒',
      color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      urlTemplate: 'https://listado.mercadolibre.com.mx/{query}',
      description: 'Miles de vendedores',
    },
  ],

  // Argentina
  AR: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.com.ar/search?tbm=shop&q={query}',
      description: 'Compará todas las tiendas',
    },
    {
      name: 'Mercado Libre',
      icon: '🛒',
      color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      urlTemplate: 'https://listado.mercadolibre.com.ar/{query}',
      description: 'Miles de vendedores',
    },
    {
      name: 'Puppis',
      icon: '🐕',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      urlTemplate: 'https://www.puppis.com.ar/busqueda?q={query}',
      description: 'Tienda especializada',
    },
  ],

  // Default (global)
  DEFAULT: [
    {
      name: 'Google Shopping',
      icon: '🔍',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      urlTemplate: 'https://www.google.com/search?tbm=shop&q={query}',
      description: 'Compare all stores worldwide',
    },
    {
      name: 'Amazon',
      icon: '📦',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      urlTemplate: 'https://www.amazon.com/s?k={query}',
      description: 'Global delivery',
    },
  ],
};

// Titles by language
const TITLES: Record<string, { header: string; description: string; tip: string }> = {
  'pt-BR': {
    header: '🌍 Compare em outras lojas',
    description: 'Encontre o menor preço no Brasil e no mundo',
    tip: '💡 Dica: Google Shopping compara preços de todas as lojas de uma vez!',
  },
  'en-US': {
    header: '🌍 Compare at other stores',
    description: 'Find the lowest price in your country and worldwide',
    tip: '💡 Tip: Google Shopping compares prices from all stores at once!',
  },
  'es-ES': {
    header: '🌍 Compara en otras tiendas',
    description: 'Encuentra el mejor precio en tu país y en todo el mundo',
    tip: '💡 Consejo: Google Shopping compara precios de todas las tiendas a la vez!',
  },
  'pt-PT': {
    header: '🌍 Compare noutras lojas',
    description: 'Encontre o melhor preço em Portugal e no mundo',
    tip: '💡 Dica: Google Shopping compara preços de todas as lojas de uma vez!',
  },
  'de-DE': {
    header: '🌍 In anderen Shops vergleichen',
    description: 'Finden Sie den besten Preis weltweit',
    tip: '💡 Tipp: Google Shopping vergleicht Preise aller Shops auf einmal!',
  },
  'fr-FR': {
    header: '🌍 Comparez dans d\'autres magasins',
    description: 'Trouvez le meilleur prix dans votre pays et dans le monde',
    tip: '💡 Astuce: Google Shopping compare les prix de tous les magasins en une fois!',
  },
};

export function GlobalPriceCompare({ productName, variant = 'full' }: GlobalPriceCompareProps) {
  const { geo, locale } = useI18n();
  
  // Get stores for the current country, fallback to default
  const stores = STORES_BY_COUNTRY[geo.country] || STORES_BY_COUNTRY.DEFAULT;
  
  // Get titles for the current locale, fallback to English
  const titles = TITLES[locale] || TITLES['en-US'];
  
  // Build URL with product name
  const buildUrl = (template: string) => {
    const query = encodeURIComponent(productName);
    return template.replace('{query}', query);
  };

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap gap-2">
        {stores.slice(0, 4).map((store) => (
          <a
            key={store.name}
            href={buildUrl(store.urlTemplate)}
            target="_blank"
            rel="noopener noreferrer"
            className={`
              inline-flex items-center gap-2 px-3 py-2 rounded-lg border
              transition-colors text-sm font-medium text-slate-700
              ${store.color}
            `}
          >
            <span>{store.icon}</span>
            <span>{store.name}</span>
            <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl p-6 border border-slate-200">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{titles.header}</h3>
        <p className="text-sm text-slate-600">{titles.description}</p>
      </div>

      {/* Tip */}
      <div className="mb-4 px-3 py-2 bg-blue-100 rounded-lg">
        <p className="text-sm text-blue-800">{titles.tip}</p>
      </div>

      {/* Store Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stores.map((store) => (
          <a
            key={store.name}
            href={buildUrl(store.urlTemplate)}
            target="_blank"
            rel="noopener noreferrer"
            className={`
              flex flex-col items-center p-4 rounded-xl border
              transition-all duration-200 hover:scale-105 hover:shadow-md
              ${store.color}
            `}
          >
            <span className="text-2xl mb-2">{store.icon}</span>
            <span className="font-medium text-slate-800 text-center">{store.name}</span>
            <span className="text-xs text-slate-500 text-center mt-1">{store.description}</span>
            <svg className="w-4 h-4 text-slate-400 mt-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>

      {/* Global notice */}
      <p className="text-xs text-slate-500 text-center mt-4">
        🌎 Mostrando lojas para {geo.country} • Os preços podem variar conforme disponibilidade
      </p>
    </div>
  );
}
