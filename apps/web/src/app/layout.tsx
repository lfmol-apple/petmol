import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { I18nProvider } from '@/lib/I18nContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocationProvider } from '@/contexts/LocationContext';
import { AppShell } from '@/components/AppShell';
import { StorageMigrator } from '@/components/StorageMigrator';
// GlobalAutoDetector removido — sem geolocalização (nova estratégia 2026-02)
// import { GlobalAutoDetector } from '@/components/GlobalAutoDetector';
import { SmartSuggestionsWidget } from '@/components/SmartSuggestionsWidget';
import { EventNudge } from '@/components/EventNudge';
import { TravelDetectionNotification } from '@/components/TravelDetectionNotification';
import { OfflineIndicator, ConnectivityStatus } from '@/components/OfflineIndicator';
import { 
  isEventNudgeEnabled
} from '@/lib/featureFlags';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

// Site URL from environment (no hardcoded domain)
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover', // safe-area iOS
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: 'PETMOL - Carteirinha Digital e Gestão Completa do Seu Pet',
  description: 'Carteirinha digital, controle de vacinas, histórico de saúde e agenda completa. O melhor app para cuidar do seu pet, tudo em um só lugar.',
  keywords: ['pet', 'cachorro', 'gato', 'carteirinha digital', 'vacinas', 'saúde pet', 'agenda pet'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PETMOL',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'PETMOL - Cuidados do Seu Pet',
    description: 'Carteirinha digital, vacinas e saúde para seu pet',
    url: siteUrl,
    siteName: 'PETMOL',
    locale: 'pt_BR',
    type: 'website',
  },
  metadataBase: new URL(siteUrl),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className={inter.className}>
        <I18nProvider>
          <AuthProvider>
            <LocationProvider>
            <OfflineIndicator />
            <ConnectivityStatus />
            <StorageMigrator />
            <TravelDetectionNotification />
            {/* GlobalAutoDetector desativado — detecção por geolocalização removida */}
            {/* <SmartSuggestionsWidget /> */}
            {isEventNudgeEnabled() && <EventNudge />}
            <AppShell>{children}</AppShell>
            </LocationProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
