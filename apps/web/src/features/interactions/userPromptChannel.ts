/**
 * Canal interno de prompts estruturais (camada UI)
 *
 * 2026-04: implementação mínima baseada em window.alert/confirm. Nenhum
 * canal externo é utilizado aqui. Futuras UIs (sheets, modais) podem
 * escutar getLastPrompt para oferecer experiências mais ricas.
 */

type PromptKind = 'info' | 'confirm';

export interface PromptRequest {
  kind: PromptKind;
  message: string;
}

let lastPrompt: PromptRequest | null = null;

export function getLastPrompt(): PromptRequest | null {
  return lastPrompt;
}

export function clearLastPrompt(): void {
  lastPrompt = null;
}

export function showBlockingNotice(message: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  lastPrompt = { kind: 'info', message };
  // Comportamento atual: alerta de bloqueio local
  window.alert(message);
}

export function requestUserConfirmation(message: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  lastPrompt = { kind: 'confirm', message };
  // Comportamento atual: confirmação local, sem canal externo
  return window.confirm(message);
}