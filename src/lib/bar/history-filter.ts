export type HistoryVenue = 'both' | 'bar' | 'shop';
export function filterHistoryTabs<T extends { bar_visitor_sales: { bar_items: { division: string | null } | null }[] }>(tabs: T[], venue: HistoryVenue): T[] {
  if (venue === 'both') return tabs;
  return tabs.map(tab => ({ ...tab, bar_visitor_sales: tab.bar_visitor_sales.filter(line => (line.bar_items?.division ?? 'bar') === venue) }))
    .filter(tab => tab.bar_visitor_sales.length > 0);
}