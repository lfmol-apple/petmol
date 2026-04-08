import { trackClick } from '@/lib/analytics/click';

export type HomeShoppingPartnerId = 'cobasi' | 'petz' | 'amazon' | 'petlove' | 'doglife';

export interface HomeShoppingPartner {
  id: HomeShoppingPartnerId;
  name: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  fallbackUrl?: string;
  directUrl?: string;
}

export const HOME_SHOPPING_PARTNERS: HomeShoppingPartner[] = [
  {
    id: 'cobasi',
    name: 'Cobasi',
    description: 'Tudo para o seu pet',
    logoSrc: '/partner-logos/cobasi.png',
    logoAlt: 'Cobasi',
    fallbackUrl: 'https://www.cobasi.com.br',
  },
  {
    id: 'petz',
    name: 'Petz',
    description: 'Pet shop completo',
    logoSrc: '/partner-logos/petz.png',
    logoAlt: 'Petz',
    fallbackUrl: 'https://www.petz.com.br',
  },
  {
    id: 'amazon',
    name: 'Amazon',
    description: 'Racao, brinquedos e mais',
    logoSrc: '/partner-logos/amazon.svg',
    logoAlt: 'Amazon',
    directUrl: 'https://www.amazon.com.br/s?k=pet+shop&rh=n%3A16209062011',
  },
  {
    id: 'petlove',
    name: 'Petlove',
    description: 'Farmacia, racao e acessorios',
    logoSrc: '/partner-logos/petlove.png',
    logoAlt: 'Petlove',
    fallbackUrl: 'https://www.petlove.com.br',
  },
  {
    id: 'doglife',
    name: 'DogLife',
    description: 'Planos e produtos pet',
    logoSrc: '/partner-logos/doglife.svg',
    logoAlt: 'DogLife',
    fallbackUrl: 'https://www.doglife.com.br',
  },
];

function buildPartnerHandoffUrl(partner: HomeShoppingPartner, leadId: string): string {
  if (partner.directUrl) {
    return partner.directUrl;
  }

  const fallback = encodeURIComponent(partner.fallbackUrl ?? 'https://www.google.com/search?tbm=shop&q=pet');
  return `/api/handoff/shopping?partner=${partner.id}&lead_id=${encodeURIComponent(leadId)}&fallback=${fallback}`;
}

export async function openHomeShoppingPartner(partnerId: HomeShoppingPartnerId): Promise<void> {
  const partner = HOME_SHOPPING_PARTNERS.find((entry) => entry.id === partnerId);
  if (!partner) return;

  const leadId = await trackClick({
    source: 'home',
    cta_type: 'shop_redirect',
    target: partner.id,
  });

  const url = buildPartnerHandoffUrl(partner, leadId);
  window.open(url, '_blank', 'noopener,noreferrer');
}