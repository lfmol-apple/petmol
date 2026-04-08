interface RouterLike {
  push: (href: string) => void;
}

export function navigateToPetHealthTab(
  router: RouterLike,
  petId: string | null | undefined,
  tab: string,
): void {
  if (!petId) {
    return;
  }

  router.push(`/saude/${petId}?tab=${tab}`);
}