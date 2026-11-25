export interface RecentAppOrderLine { bar_item_id: string; item_name: string; quantity: number }

/** Names of basket items that were already ordered on the app for this tab recently. */
export function appOrderDuplicates(basket: { bar_item_id: string; quantity: number }[], recent: RecentAppOrderLine[]): string[] {
  const names = new Map<string, string>();
  for (const r of recent) if (r?.bar_item_id && r.quantity > 0) names.set(r.bar_item_id, r.item_name);
  return Array.from(new Set(basket.filter((b) => b.quantity > 0 && names.has(b.bar_item_id)).map((b) => names.get(b.bar_item_id)!)));
}
