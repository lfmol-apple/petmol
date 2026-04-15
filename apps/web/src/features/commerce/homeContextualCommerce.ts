export type PushActionSheetContext = 'vaccines' | 'medication' | 'parasites' | 'food' | 'grooming';

export type HomeContextualCommerceTarget = 'food' | 'parasites';

export interface FoodCommerceSnapshot {
  status: 'steady' | 'attention' | 'urgent';
  title: string;
  description: string;
  ctaLabel: string;
  searchQuery: string;
}

export interface HomeContextualCommerceIntent {
  source: 'push_action_sheet';
  petId: string;
  itemName?: string;
  target: HomeContextualCommerceTarget;
}

interface ResolvePushActionSheetCommerceIntentInput {
  type: PushActionSheetContext;
  petId: string;
  itemName?: string;
}

interface HomeContextualCommerceHandlers {
  openFoodSheet: () => void;
  openParasiteSheet: () => void;
}

interface ResolveFoodCommerceSnapshotInput {
  brand: string;
  packageSizeKg?: string | null;
  daysLeft?: number | null;
  estimatedEndDate?: string | null;
}

export function resolveFoodCommerceSnapshot(
  input: ResolveFoodCommerceSnapshotInput,
): FoodCommerceSnapshot | null {
  const brand = input.brand.trim();
  if (!brand) return null;

  const sizeLabel = input.packageSizeKg ? `${input.packageSizeKg}kg` : '';
  const searchQuery = [brand, sizeLabel, 'ração pet'].filter(Boolean).join(' ').trim();

  if (input.daysLeft == null) {
    return {
      status: 'steady',
      title: 'Deixe a próxima recompra preparada',
      description: 'Abrimos um handoff direto para você pesquisar a mesma ração quando quiser.',
      ctaLabel: 'Ver opções de recompra',
      searchQuery,
    };
  }

  if (input.daysLeft < 0) {
    return {
      status: 'urgent',
      title: 'A ração já deve ter acabado',
      description: 'Leve você direto para a recompra agora, sem precisar refazer a busca manualmente.',
      ctaLabel: 'Comprar agora',
      searchQuery,
    };
  }

  if (input.daysLeft <= 5) {
    return {
      status: 'attention',
      title: 'Hora de preparar a próxima compra',
      description: input.estimatedEndDate
        ? `Pela previsão atual, a ração termina por volta de ${input.estimatedEndDate}.`
        : 'O estoque está entrando na janela de atenção para recompra.',
      ctaLabel: 'Planejar recompra',
      searchQuery,
    };
  }

  return {
    status: 'steady',
    title: 'Ciclo de alimentação sob controle',
    description: 'Deixe salvo o caminho da recompra para agir rápido quando a janela de reposição chegar.',
    ctaLabel: 'Salvar caminho de recompra',
    searchQuery,
  };
}

export function resolvePushActionSheetCommerceIntent(
  input: ResolvePushActionSheetCommerceIntentInput,
): HomeContextualCommerceIntent | null {
  if (input.type === 'food') {
    return {
      source: 'push_action_sheet',
      petId: input.petId,
      itemName: input.itemName,
      target: 'food',
    };
  }

  if (input.type === 'parasites') {
    return {
      source: 'push_action_sheet',
      petId: input.petId,
      itemName: input.itemName,
      target: 'parasites',
    };
  }

  return null;
}

export function openHomeContextualCommerce(
  intent: HomeContextualCommerceIntent,
  handlers: HomeContextualCommerceHandlers,
): void {
  switch (intent.target) {
    case 'food':
      handlers.openFoodSheet();
      break;
    case 'parasites':
      handlers.openParasiteSheet();
      break;
    default:
      break;
  }
}