/** Mixers remain independent basket lines, never automatic spirit add-ons. */
export function withSpiritMixers<T extends { id: string }>(items: T[], mixers: T[], category: string): T[] {
  if (!/^(custom_)?spirits$/i.test(category.trim())) return items;
  const ids = new Set(items.map(item => item.id));
  return [...items, ...mixers.filter(item => !ids.has(item.id))];
}
