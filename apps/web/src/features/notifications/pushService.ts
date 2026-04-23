/**
 * pushService.ts
 *
 * Envia push notifications via backend PETMOL.
 * Endpoint: POST /notifications/send
 */

import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export interface PushPayload {
  /** ID único para deduplicação */
  id: string;
  petId: string;
  petName: string;
  title: string;
  body: string;
  /** URL de ícone */
  icon?: string;
  /** Destino ao clicar (rota interna) */
  clickUrl?: string;
  /** Tag para sobreposição no SO */
  tag?: string;
  /** Horário preferencial (HH:mm) */
  preferredHour?: string;
  /** Domínio de origem */
  domain?: string;
}

// ---------------------------------------------------------------------------
// Deduplicação em memória (por sessão)
// ---------------------------------------------------------------------------
const sentInSession = new Set<string>();

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Envia um push para o dispositivo do tutor via backend.
 * Deduplica por `payload.id` dentro da sessão atual.
 */
export async function sendPush(payload: PushPayload): Promise<void> {
  if (typeof window === 'undefined') return;
  if (sentInSession.has(payload.id)) return;

  sentInSession.add(payload.id);

  const token = getToken();
  try {
    await fetch(`${API_BASE_URL}/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.clickUrl ?? '/home',
        tag: payload.tag ?? 'petmol',
        icon: payload.icon ?? '/icons/icon-192x192.png',
      }),
    });
  } catch {
    // Push é best-effort — falha silenciosa para não bloquear a UI
  }
}

/**
 * Limpa o registro de sessão (útil para testes ou reset manual).
 */
export function clearPushSessionCache(): void {
  sentInSession.clear();
}
