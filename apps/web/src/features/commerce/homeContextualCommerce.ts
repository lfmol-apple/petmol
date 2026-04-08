export type PushActionSheetContext = 'vaccines' | 'medication' | 'parasites' | 'food' | 'grooming';

export type HomeContextualCommerceTarget = 'food' | 'parasites';

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