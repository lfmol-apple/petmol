type PromptKind = 'info' | 'confirm';
type PromptTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface PromptRequest {
  kind: PromptKind;
  message: string;
}

export interface PromptNotice {
  id: number;
  kind: 'info';
  message: string;
  title?: string;
  tone: PromptTone;
}

export interface PromptDecisionRequest {
  id: number;
  kind: 'confirm';
  message: string;
  title?: string;
  tone: PromptTone;
  confirmLabel: string;
  cancelLabel: string;
}

export interface PromptChannelState {
  notice: PromptNotice | null;
  confirm: PromptDecisionRequest | null;
}

interface PromptDecisionOptions {
  title?: string;
  tone?: PromptTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface BlockingNoticeOptions {
  title?: string;
  tone?: PromptTone;
}

let lastPrompt: PromptRequest | null = null;
let promptSequence = 0;
let activeNotice: PromptNotice | null = null;
let activeConfirm: PromptDecisionRequest | null = null;
let confirmResolver: ((value: boolean) => void) | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function nextPromptId(): number {
  promptSequence += 1;
  return promptSequence;
}

export function subscribePromptChannel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPromptChannelState(): PromptChannelState {
  return {
    notice: activeNotice,
    confirm: activeConfirm,
  };
}

export function dismissPromptNotice(): void {
  if (!activeNotice) return;
  activeNotice = null;
  emitChange();
}

export function resolvePromptDecision(accepted: boolean): void {
  const resolver = confirmResolver;
  activeConfirm = null;
  confirmResolver = null;
  emitChange();
  resolver?.(accepted);
}

export function getLastPrompt(): PromptRequest | null {
  return lastPrompt;
}

export function clearLastPrompt(): void {
  lastPrompt = null;
}

export function showBlockingNotice(message: string, options: BlockingNoticeOptions = {}): void {
  if (typeof window === 'undefined') {
    return;
  }

  lastPrompt = { kind: 'info', message };
  activeNotice = {
    id: nextPromptId(),
    kind: 'info',
    message,
    title: options.title,
    tone: options.tone ?? 'warning',
  };
  emitChange();
}

export function requestUserDecision(
  message: string,
  options: PromptDecisionOptions = {},
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  if (confirmResolver) {
    confirmResolver(false);
  }

  lastPrompt = { kind: 'confirm', message };
  activeConfirm = {
    id: nextPromptId(),
    kind: 'confirm',
    message,
    title: options.title,
    tone: options.tone ?? 'warning',
    confirmLabel: options.confirmLabel ?? 'Confirmar',
    cancelLabel: options.cancelLabel ?? 'Cancelar',
  };

  emitChange();

  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve;
  });
}

export function requestUserConfirmation(message: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  lastPrompt = { kind: 'confirm', message };
  return window.confirm(message);
}