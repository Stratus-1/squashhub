import type { HistoryVenue } from './history-filter';

export const paymentCategories = [
  { value: 'all', label: 'All' }, { value: 'online', label: 'Card' },
  { value: 'cash', label: 'Cash' }, { value: 'terminal', label: 'Swipe' },
  { value: 'member_account', label: 'Member account' },
] as const;
export type PaymentCategory = typeof paymentCategories[number]['value'];
export type ClosedOrderLine = {
  id: string; orderId: string; orderNumber: number | null; name: string;
  method: string; total: number; date: string; division: string | null;
};
export function closedOrderTotals(lines: ClosedOrderLine[], method: PaymentCategory, venue: HistoryVenue) {
  const groups = new Map<string, ClosedOrderLine>();
  for (const line of lines) {
    if ((method !== 'all' && line.method !== method) || (venue !== 'both' && (line.division ?? 'bar') !== venue)) continue;
    const key = `${line.method}:${line.orderId}`;
    const group = groups.get(key);
    if (group) group.total += line.total;
    else groups.set(key, { ...line });
  }
  const orders = [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { orders, total: orders.reduce((sum, order) => sum + order.total, 0) };
}