'use client';

import { useEffect } from 'react';
import { PWA_ASSET_VERSION } from '@/lib/pwaVersion';

const RECOVERY_MARKER_KEY = 'petmol-client-recovery-version';
const RECOVERY_RELOAD_KEY = 'petmol-client-recovery-reloaded';

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

      if (cancelled) return;

      window.localStorage.setItem(RECOVERY_MARKER_KEY, PWA_ASSET_VERSION);

      const hasReloaded = window.sessionStorage.getItem(RECOVERY_RELOAD_KEY) === PWA_ASSET_VERSION;
      if (changed && !hasReloaded) {
        window.sessionStorage.setItem(RECOVERY_RELOAD_KEY, PWA_ASSET_VERSION);
        window.location.replace(window.location.href);
      }
    }

    void recoverClientState();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}