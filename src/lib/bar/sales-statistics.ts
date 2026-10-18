import type { HistoryVenue } from './history-filter';

export type SalesBucket = 'open' | 'closed' | 'member' | 'direct';
export type SalesLine = {
  id: string; groupId: string; name: string; item: string; division: string | null;
  quantity: number; total: number; createdAt: string; bucket: SalesBucket; operator: string | null;
};
export const salesBuckets: { value: SalesBucket; label: string }[] = [
  { value: 'open', label: 'Open tabs' }, { value: 'closed', label: 'Closed tabs' },
  { value: 'member', label: 'Member account sales' }, { value: 'direct', label: 'Direct sales' },
];
export function isRecordedVisitorSale(status: string, tabId: string | null) {
  return ['recorded', 'paid', 'settled', 'on_tab', 'awaiting_cash', 'awaiting_terminal'].includes(status)
    || (status === 'pending' && tabId !== null);
}
export function salesStatistics(lines: SalesLine[], venue: HistoryVenue) {
  const filtered = lines.filter(line => venue === 'both' || (line.division ?? 'bar') === venue);
  return {
    total: filtered.reduce((sum, line) => sum + line.total, 0),
    count: filtered.length,
    buckets: salesBuckets.map(bucket => {
      const selected = filtered.filter(line => line.bucket === bucket.value);
      const groups = new Map<string, { id: string; name: string; operator: string | null; total: number; lines: SalesLine[] }>();
      for (const line of selected) {
        const group = groups.get(line.groupId) ?? { id: line.groupId, name: line.name, operator: line.operator, total: 0, lines: [] };
        group.total += line.total;
        group.lines.push(line);
        groups.set(line.groupId, group);
      }
      return { ...bucket, total: selected.reduce((sum, line) => sum + line.total, 0), groups: [...groups.values()] };
    }),
  };
}