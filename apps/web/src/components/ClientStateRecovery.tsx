'use client';

import { useEffect } from 'react';
import { PWA_ASSET_VERSION } from '@/lib/pwaVersion';

const RECOVERY_MARKER_KEY = 'petmol-client-recovery-version';
const RECOVERY_RELOAD_KEY = 'petmol-client-recovery-reloaded';
const COOKIE_CLEAR_CANDIDATES = [
  'petmol_auth',
  'petmol_redirect',
  'petmol_install_prompt_dismissed',
];

function isPetmolHost(hostname: string): boolean {
  return hostname === 'petmol.com.br' || hostname === 'www.petmol.com.br';
}

export function ClientStateRecovery() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isPetmolHost(window.location.hostname)) return;

    const previousVersion = window.localStorage.getItem(RECOVERY_MARKER_KEY);
    if (previousVersion === PWA_ASSET_VERSION) return;

    let cancelled = false;

    async function recoverClientState() {
      let changed = false;

      try {
        const cookieDomains = [window.location.hostname, '.petmol.com.br'];
        for (const cookieName of COOKIE_CLEAR_CANDIDATES) {
          for (const cookieDomain of cookieDomains) {
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${cookieDomain}`;
          }
          document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        }
      } catch {}

      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map(async (registration) => {
              const didUnregister = await registration.unregister();
              changed = changed || didUnregister;
            }),
          );
        } catch {}
      }

      if ('caches' in window) {
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(
            cacheKeys.map(async (cacheKey) => {
              const deleted = await caches.delete(cacheKey);
              changed = changed || deleted;
            }),
          );
        } catch {}
      }

      try {
        const preservedVersion = PWA_ASSET_VERSION;
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem(RECOVERY_MARKER_KEY, preservedVersion);
        changed = true;
      } catch {}

      try {
        const indexedDbApi = window.indexedDB;
        if (indexedDbApi && typeof indexedDbApi.databases === 'function') {
          const databases = await indexedDbApi.databases();
          await Promise.all(
            databases.map(async (database) => {
              if (!database.name) return;
              await new Promise<void>((resolve) => {
                const request = indexedDbApi.deleteDatabase(database.name!);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
              });
              changed = true;
            }),
          );
        }
      } catch {}

      if (cancelled) return;

      window.localStorage.setItem(RECOVERY_MARKER_KEY, PWA_ASSET_VERSION);

      const hasReloaded = window.sessionStorage.getItem(RECOVERY_RELOAD_KEY) === PWA_ASSET_VERSION;
      if (changed && !hasReloaded) {
        window.sessionStorage.setItem(RECOVERY_RELOAD_KEY, PWA_ASSET_VERSION);
        window.location.replace('https://www.petmol.com.br/login?reset=1');
      }
    }

    void recoverClientState();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}