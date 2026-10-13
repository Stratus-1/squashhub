/** Mixers remain independent basket lines, never automatic spirit add-ons. */
export function spiritMixers<T extends { id: string; name: string; item_kind?: string | null; stock_parent_id?: string | null }>(items: T[]): T[] {
  const parents = new Set(items.map(item => item.stock_parent_id).filter(Boolean));
  return items.filter(item => item.item_kind !== "special"
    && /\b(budd(?:y|ies)|coke|cola|soda|tonic|mixer)\b/i.test(item.name)
    && !/\b(and|plus)\b/i.test(item.name)
    && !parents.has(item.id));
}

export function withSpiritMixers<T extends { id: string }>(items: T[], mixers: T[], category: string): T[] {
  if (!/^(custom_)?spirits$/i.test(category.trim())) return items;
  const ids = new Set(items.map(item => item.id));
  return [...items, ...mixers.filter(item => !ids.has(item.id))];
}
