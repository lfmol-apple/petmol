import { MetadataRoute } from 'next';
import { PWA_ASSET_VERSION } from '@/lib/pwaVersion';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PETMOL - Carteirinha Digital do Seu Pet',
    short_name: 'PETMOL',
    description: 'Carteirinha digital, vacinas, saúde e agenda completa para seu pet',
    start_url: '/login',
    display: 'browser',
    background_color: '#0A5CF5',
    theme_color: '#0A5CF5',
    orientation: 'portrait',
    icons: [
      {
        src: `/icons/icon-192.png?v=${PWA_ASSET_VERSION}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `/icons/icon-512.png?v=${PWA_ASSET_VERSION}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    categories: ['health', 'lifestyle', 'pets'],
    lang: 'pt-BR',
  };
}

