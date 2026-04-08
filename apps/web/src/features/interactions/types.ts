import type {
  CanonicalEventActionTarget,
  CanonicalEventDomain,
  CanonicalEventSeverity,
  CanonicalEventStatus,
  CanonicalPetEvent,
} from '@/features/events/types';

// ---------------------------------------------------------------------------
// Tipos canônicos de interação (independentes do modelo de alerts legado)
// ---------------------------------------------------------------------------

export type InteractionChannel = 'home-panel' | 'home-badge' | 'in-app-notification';

// Domínio/categoria da interação (focado em cuidado do pet)
export type InteractionCategory = CanonicalEventDomain | 'general';

// Severidade da interação
export type InteractionSeverity = CanonicalEventSeverity;

// Status em nível de interação (espelha o factual por enquanto)
export type InteractionStatus = CanonicalEventStatus;

// Destino/CTA principal da interação
export type InteractionActionTarget = CanonicalEventActionTarget;

// Origem da interação para auditoria/feature flags
export type InteractionOrigin = 'pet-care-domain' | 'system' | 'user';

// Destino lógico de clique configurável pelo MASTER.
// Pode apontar para um target canônico ou para destinos sem rota direta
// (ex.: abrir central, histórico, nenhuma ação externa).
export type InteractionClickDestination =
  | 'none'
  | 'open-central'
  | 'open-history'
  | 'open-register'
  | 'open-edit'
  | 'open-shopping'
  | InteractionActionTarget;

// Item canônico de interação utilizado pela Home/Central
export interface PetInteractionItem {
  id: string;
  pet_id: string;
  pet_name: string;
  care_key?: string;
  category: InteractionCategory;
  /** rótulo amigável (ex: "V10 Quíntupla", "Banho") */
  type_label: string;
  severity: InteractionSeverity;
  status: InteractionStatus;
  due_date?: string;
  /** dias em atraso (negativo = adiantado; 0 = hoje) */
  days_overdue?: number;
  action_target: InteractionActionTarget;
  action_label?: string;
  origin: InteractionOrigin;
  priority?: number;
  show_on_home?: boolean;
  show_in_center?: boolean;
  show_on_app_open?: boolean;
}

// Decisão de interação para canais específicos (ex.: in-app-notification)
export interface InteractionDecision {
  id: string;
  channel: InteractionChannel;
  category: InteractionCategory;
  severity: InteractionSeverity;
  pet_id: string;
  pet_name: string;
  title: string;
  body: string;
  action_target: InteractionActionTarget;
  source_event_id: CanonicalPetEvent['id'];
  source_key: CanonicalPetEvent['key'];
  due_date?: string;
  requireInteraction?: boolean;
  autoCloseMs?: number;
  dedup_key?: string;
}

export interface InteractionPreferences {
  enabled: boolean;
  categories: Partial<Record<InteractionCategory, boolean>>;
  advance_days: number;
}

// Política detalhada por cuidado configurada pelo MASTER.
export interface CareInteractionPolicy {
  enabled: boolean;
  showOnHome: boolean;
  showInCenter: boolean;
  severity: InteractionSeverity | string;
  priority: number | 'low' | 'medium' | 'high' | 'critical';
  advance_days: number;
  cooldown_hours: number;
  resurfacing: 'never' | 'daily' | 'weekly' | 'until-resolved' | 'always' | 'smart';
  persistence: 'session' | 'until-resolved' | 'one-shot' | 'critical' | string;
  label?: string;
  description?: string;
  icon?: string;
  domainType?: string;
  expiredBehavior?: 'persistent' | 'soft' | 'dismiss-once';
  dueSoonBehavior?: 'highlight' | 'normal';
  allowMarkAsOk?: boolean;
  allowResolve?: boolean;
  allowEdit?: boolean;
  showOnAppOpen?: boolean;
  showHomeBadge?: boolean;
  openPriority?: number;
  commercialFocus?: 'none' | 'soft' | 'medium' | 'strong';
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  purchaseDestination?: string;
  registerDestination?: string;
  editDestination?: string;
  historyDestination?: string;
  internalCenterEnabled?: boolean;
  homeEnabled?: boolean;
  badgeEnabled?: boolean;
  browserEnabled?: boolean;
  pushEnabled?: boolean;
  /** Título da notificação push no celular */
  pushTitle?: string;
  /** Texto da notificação push no celular */
  pushBody?: string;
  /** Horário preferencial de envio do push (HH:mm) */
  pushPreferredHour?: string;
  /** Máximo de vezes que o push pode ser reenviado */
  pushRepeatLimit?: number;
  primary: {
    label: string;
    destination: InteractionClickDestination;
    allowContextualPurchase: boolean;
  };
  secondary?: {
    label: string;
    destination: InteractionClickDestination;
  };
  allowRemindLater: boolean;
  allowManualTracking: boolean;
  allowSilence: boolean;
}

// Regras de governança master (camada 1)
// Controlam quais domínios podem gerar interação, canais permitidos e
// se canais externos (ex.: browser notifications) podem ser usados.
export interface MasterInteractionRules {
  /** Se a política master de interações está ativa globalmente */
  enabled: boolean;
  /** Quais domínios podem gerar interações automáticas */
  categories: Partial<Record<InteractionCategory, boolean>>;
  /** Antecedência máxima (limite superior) permitida para avisos futuros */
  advance_days: number;
  /** Se o tutor tem permissão para silenciar cada domínio */
  canBeSilenced: Partial<Record<InteractionCategory, boolean>>;
  /** Política global de intensidade, cooldown e comportamento padrão */
  globalPolicy: {
    intensity: 'low' | 'medium' | 'high';
    cooldown_hours: number;
    resurfacing: 'never' | 'daily' | 'weekly' | 'until-resolved';
    insistenceLimit: number;
    quietHours: {
      enabled: boolean;
      start: string; // HH:mm
      end: string; // HH:mm
    };
    expiredBehavior: 'keep-showing' | 'central-only' | 'archive';
    dueSoonBehavior: 'home-and-central' | 'central-only';
  };
  /** Canais internos globais (central, home, badges) */
  channels: {
    internalCenter: {
      enabled: boolean;
    };
    homePanel: {
      enabled: boolean;
    };
    homeBadge: {
      enabled: boolean;
    };
  };
  /** Configuração de canais externos globais (ex.: browser notifications) */
  externalChannels: {
    browserNotifications: {
      /** Se a arquitetura pode usar browser notifications em geral */
      allowed: boolean;
      /** Se browser notifications estão ativas neste ambiente */
      active: boolean;
    };
    pushNotifications: {
      /** Arquitetura preparada para push, porém DESLIGADA por padrão */
      allowed: boolean;
      active: boolean;
    };
  };
  /** Política detalhada por cuidado (vacinas, emergência, etc.) */
  carePolicies: Record<string, CareInteractionPolicy>;
  /** Política multipet (agrupamento e ordenação da fila) */
  multipet: {
    grouping: 'by-pet' | 'by-severity' | 'none';
    showOverdueFirst: boolean;
    consolidatedOnAppOpen: boolean;
    multiplePendingBehavior: 'stack' | 'summarize' | 'highest-only';
    maxItemsPerPet: number;
  };
}