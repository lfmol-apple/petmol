'use client';

/**
 * PushAutoRefresh
 *
 * Componente invisível que roda em toda página (via layout.tsx).
 * Renova silenciosamente a push subscription do dispositivo atual
 * sempre que o usuário abre o app, garantindo que o backend sempre
 * tenha o endpoint correto para este dispositivo.
 *
 * Não exibe nenhuma UI. Não pede permissão (só renova se já foi concedida).
 */

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}

function serializeSubscription(existing: PushSubscription) {
  const keyBuf = existing.getKey('p256dh');
  const authBuf = existing.getKey('auth');

  return {
    endpoint: existing.endpoint,
    keys: {
      p256dh: keyBuf ? btoa(String.fromCharCode(...new Uint8Array(keyBuf))) : '',
      auth: authBuf ? btoa(String.fromCharCode(...new Uint8Array(authBuf))) : '',
    },
  };
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  return navigator.serviceWorker.ready;
}

export function PushAutoRefresh() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;

    const token = getToken();
    if (!token) return; // Não está logado — não tenta renovar

    ensureServiceWorkerReady()
      .then(async (reg) => {
        const existing = await reg.pushManager.getSubscription();
        if (!existing) return; // Sem subscription ativa — não força

        const response = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            subscription: serializeSubscription(existing),
          }),
        });

        if (!response.ok) {
          console.warn('[push] PushAutoRefresh nao conseguiu sincronizar a subscription', response.status);
        }
      })
      .catch((error) => {
        console.warn('[push] PushAutoRefresh falhou', error);
      });
  }, []); // roda uma vez por mount (= uma vez por navegação full-page)

  return null;
}
