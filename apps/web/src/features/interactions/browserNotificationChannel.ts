import { loadMasterInteractionRules } from './preferences';

export interface BrowserNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  autoCloseMs?: number;
  onClickUrl?: string;
  onClick?: () => void;
}

export function canUseBrowserNotifications(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const master = loadMasterInteractionRules();

  // Governança MASTER: canais externos desligados por padrão.
  if (!master.enabled
    || !master.externalChannels.browserNotifications.allowed
    || !master.externalChannels.browserNotifications.active) {
    return false;
  }

  return 'Notification' in window && Notification.permission === 'granted';
}

export function showBrowserNotification({
  title,
  body,
  icon,
  badge,
  tag,
  requireInteraction = false,
  autoCloseMs,
  onClickUrl,
  onClick,
}: BrowserNotificationPayload): Notification | null {
  if (!canUseBrowserNotifications()) {
    return null;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon,
      badge,
      tag,
      requireInteraction,
    });

    if (onClick || onClickUrl) {
      notification.onclick = () => {
        window.focus();
        onClick?.();
        if (onClickUrl) {
          window.location.href = onClickUrl;
        }
        notification.close();
      };
    }

    if (autoCloseMs && autoCloseMs > 0 && !requireInteraction) {
      window.setTimeout(() => notification.close(), autoCloseMs);
    }

    return notification;
  } catch {
    return null;
  }
}