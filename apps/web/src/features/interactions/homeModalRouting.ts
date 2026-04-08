export type HomePushActionType = 'vaccines' | 'medication' | 'parasites' | 'food' | 'grooming';

export type HomeSurfaceResolution =
  | {
      kind: 'push-action-sheet';
      actionSheetType: HomePushActionType;
    }
  | {
      kind: 'health-modal';
      healthModalMode: 'health' | 'grooming' | 'food' | 'full';
      healthActiveTab?: 'vaccines' | 'parasites' | 'medication' | 'eventos';
    }
  | {
      kind: 'health-options';
    }
  | {
      kind: 'sheet';
      sheet: 'grooming' | 'food' | 'vaccines' | 'vermifugo' | 'antipulgas' | 'coleira';
    }
  | {
      kind: 'edit-pet';
      initialSection: 'food';
    };

export function resolveHomeDeepLinkDestination(
  modal: string | null,
  tabParam: string | null,
): HomeSurfaceResolution | null {
  if (!modal) return null;

  const actionSheetTypes: HomePushActionType[] = ['vaccines', 'parasites', 'medication', 'food', 'grooming'];
  if (actionSheetTypes.includes(modal as HomePushActionType)) {
    return {
      kind: 'push-action-sheet',
      actionSheetType: modal as HomePushActionType,
    };
  }

  if (modal === 'food-setup') {
    return { kind: 'edit-pet', initialSection: 'food' };
  }

  if (modal === 'eventos') {
    return { kind: 'health-modal', healthModalMode: 'health', healthActiveTab: 'eventos' };
  }

  if (modal === 'health') {
    return { kind: 'health-options' };
  }

  if (modal === 'manage') {
    if (tabParam === 'banho') {
      return { kind: 'sheet', sheet: 'grooming' };
    }

    if (tabParam === 'alimentacao') {
      return { kind: 'sheet', sheet: 'food' };
    }

    const modeMap: Record<string, 'health' | 'grooming' | 'food'> = {
      vacinas: 'health',
      antiparasitario: 'health',
      medicacao: 'health',
    };
    const tabMap: Record<string, 'vaccines' | 'parasites' | 'medication'> = {
      vacinas: 'vaccines',
      antiparasitario: 'parasites',
      medicacao: 'medication',
    };

    return {
      kind: 'health-modal',
      healthModalMode: modeMap[tabParam ?? ''] ?? 'health',
      healthActiveTab: tabMap[tabParam ?? ''],
    };
  }

  if (modal === 'vaccine-sheet') {
    return { kind: 'sheet', sheet: 'vaccines' };
  }

  if (modal === 'vermifugo') {
    return { kind: 'sheet', sheet: 'vermifugo' };
  }

  if (modal === 'antipulgas') {
    return { kind: 'sheet', sheet: 'antipulgas' };
  }

  if (modal === 'coleira') {
    return { kind: 'sheet', sheet: 'coleira' };
  }

  if (modal === 'banho' || modal === 'grooming') {
    return { kind: 'sheet', sheet: 'grooming' };
  }

  return null;
}

export function resolvePushActionSheetFullDestination(type: HomePushActionType): HomeSurfaceResolution {
  if (type === 'food') {
    return { kind: 'edit-pet', initialSection: 'food' };
  }

  if (type === 'grooming') {
    return { kind: 'sheet', sheet: 'grooming' };
  }

  if (type === 'vaccines') {
    return { kind: 'sheet', sheet: 'vaccines' };
  }

  if (type === 'parasites') {
    return { kind: 'sheet', sheet: 'vermifugo' };
  }

  return { kind: 'health-modal', healthModalMode: 'health', healthActiveTab: type };
}