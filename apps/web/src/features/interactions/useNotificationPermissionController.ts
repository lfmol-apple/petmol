/**
 * useNotificationPermissionController.ts
 *
 * Controla o ciclo de vida de Web Push Notifications.
 * Integra com os endpoints do backend PETMOL:
 *   GET  /notifications/vapid-public-key
 *   POST /notifications/subscribe
 *   DELETE /notifications/subscribe
 *   POST /notifications/test
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converte a VAPID public key (base64url) para Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

/** Extrai os campos p256dh e auth de uma PushSubscription. */
function serializeSubscription(sub: PushSubscription) {
  const key = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: key ? btoa(Array.from(new Uint8Array(key)).map((b) => String.fromCharCode(b)).join('')) : '',
      auth: auth ? btoa(Array.from(new Uint8Array(auth)).map((b) => String.fromCharCode(b)).join('')) : '',
    },
  };
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
  if (!res.ok) throw new Error('VAPID key indisponível');
  const data = await res.json();
  return data.publicKey as string;
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ subscription: serializeSubscription(sub) }),
  });
  if (!res.ok) throw new Error('Erro ao registrar subscription');
}

async function deleteSubscription(): Promise<void> {
  await fetch(`${API_BASE_URL}/notifications/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
}

async function postTestNotification(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? 'Erro ao enviar push de teste');
  }
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationPermissionController() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Detect support and initial state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    // Check existing subscription
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) {
          setIsSubscribed(true);
          setSubscription(sub);
        }
      })
      .catch(() => { /* silently ignore */ });
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, [isSupported]);

  const subscribeToPush = useCallback(async (): Promise<PushSubscription | null> => {
    if (!isSupported || permission !== 'granted') return null;
    try {
      const vapidKey = await fetchVapidPublicKey();
      const reg = await getSwRegistration();
      const keyArray = urlBase64ToUint8Array(vapidKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArray.buffer as ArrayBuffer,
      });
      await postSubscription(sub);
      setSubscription(sub);
      setIsSubscribed(true);
      return sub;
    } catch (err) {
      console.error('[push] subscribeToPush falhou', err);
      return null;
    }
  }, [isSupported, permission]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!subscription) return;
    try {
      await subscription.unsubscribe();
      await deleteSubscription();
    } catch { /* melhor esforço */ } finally {
      setSubscription(null);
      setIsSubscribed(false);
    }
  }, [subscription]);

  const sendTestNotification = useCallback(async (): Promise<void> => {
    await postTestNotification();
  }, []);

  return {
    permission,
    isSupported,
    isSubscribed,
    subscription,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    sendTestNotification,
  };
}
