export function removePreviewItem<T extends { id: string }>(items: T[], activeId: string, removedId: string) {
  const removedIndex = items.findIndex((item) => item.id === removedId);
  if (removedIndex < 0) return { items, activeId };
  const remaining = items.filter((item) => item.id !== removedId);
  const nextActiveId = remaining.some((item) => item.id === activeId)
    ? activeId
    : remaining[Math.min(removedIndex, remaining.length - 1)]?.id || '';
  return { items: remaining, activeId: nextActiveId };
}
