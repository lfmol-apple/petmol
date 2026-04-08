/**
 * handleNotificationClick.ts
 *
 * Roteador de clique de notificação.
 * Recebe um NotificationPayload e navega para o destino correto.
 *
 * Uso:
 *   handleNotificationClick(notification, router)
 */

import type { NotificationDestination, NotificationPayload } from './notificationDispatcher';

interface RouterLike {
  push: (href: string) => void;
}

// ---------------------------------------------------------------------------
// Mapa de destinos → rota
// ---------------------------------------------------------------------------

function resolveClickUrl(
  destination: NotificationDestination,
  type: string,
  petId: string,
): string {
  const params = new URLSearchParams({ petId });

  // Mapear type (careKey) para action_target parcial
  const healthRouteMap: Record<string, string> = {
    vaccines: 'health/vaccines',
    medication: 'health/medication',
    dewormer: 'health/parasites/dewormer',
    flea_tick: 'health/parasites/flea_tick',
    collar: 'health/parasites/collar',
    food: 'health/food',
    grooming: 'health/grooming',
    emergency: 'health/eventos',
    documents: 'home',
  };

  const healthRoute = healthRouteMap[type] ?? 'home';

  switch (destination) {
    case 'purchase':
      // Abre fluxo de compra contextual
      return `/buy?${params}&from=${healthRoute}`;

    case 'register':
      // Abre modal/aba de registro no módulo de saúde
      return `/${healthRoute}?${params}&mode=register`;

    case 'edit':
      return `/${healthRoute}?${params}&mode=edit`;

    case 'history':
      return `/${healthRoute}?${params}&view=history`;

    case 'central':
      return `/home?openCenter=1&${params}`;

    case 'detail':
    default:
      return `/${healthRoute}?${params}`;
  }
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

/**
 * Navega para o destino da notificação usando o router do Next.js.
 *
 * @param notification - Payload gerado pelo dispatcher
 * @param router - Instância de useRouter()
 * @param onNavigate - Callback opcional chamado antes de navegar (ex: fechar drawer)
 */
export function handleNotificationClick(
  notification: Pick<NotificationPayload, 'destination' | 'type' | 'petId'>,
  router: RouterLike,
  onNavigate?: () => void,
): void {
  const url = resolveClickUrl(notification.destination, notification.type, notification.petId);
  onNavigate?.();
  router.push(url);
}

/**
 * Variante sem router — retorna apenas a URL calculada.
 * Útil para construção de links estáticos.
 */
export function getNotificationClickUrl(
  notification: Pick<NotificationPayload, 'destination' | 'type' | 'petId'>,
): string {
  return resolveClickUrl(notification.destination, notification.type, notification.petId);
}
