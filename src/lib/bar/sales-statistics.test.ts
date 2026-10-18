import { expect, it } from 'vitest';
import { isRecordedVisitorSale, salesStatistics, type SalesLine } from './sales-statistics';
const lines: SalesLine[] = [
  { id: '1', groupId: 'tab1', name: 'Guest', item: 'Drink', division: 'bar', quantity: 2, total: 40, createdAt: '', bucket: 'open', operator: null },
  { id: '2', groupId: 'tab1', name: 'Guest', item: 'Shirt', division: 'shop', quantity: 1, total: 100, createdAt: '', bucket: 'open', operator: null },
  { id: '3', groupId: 'tab2', name: 'Guest 2', item: 'Drink', division: null, quantity: 1, total: 20, createdAt: '', bucket: 'closed', operator: null },
  { id: '4', groupId: 'member1', name: 'Member', item: 'Drink', division: 'bar', quantity: 1, total: 20, createdAt: '', bucket: 'member', operator: null },
  { id: '5', groupId: 'sale1', name: 'Walk-in', item: 'Drink', division: 'bar', quantity: 1, total: 20, createdAt: '', bucket: 'direct', operator: null },
];
it('total includes open, closed, member and direct sales once', () => {
  const stats = salesStatistics(lines, 'both');
  expect(stats.total).toBe(200);
  expect(stats.buckets.map(b => b.total)).toEqual([140, 20, 20, 20]);
});
it('a shared tab retains each operator instead of attributing all sales to one server', () => {
  const stats = salesStatistics([{ ...lines[0], operator: 'Server A' }, { ...lines[1], operator: 'Server B' }], 'both');
  expect(stats.buckets[0].groups[0].operator).toBe('Server A, Server B');
  expect(stats.buckets[0].groups[0].lines.map(line => line.operator)).toEqual(['Server A', 'Server B']);
});
it('drill-through reconciles groups and item amounts with total', () => {
  const stats = salesStatistics(lines, 'both');
  expect(stats.buckets[0].groups).toHaveLength(1);
  expect(stats.buckets.flatMap(b => b.groups).reduce((sum, g) => sum + g.total, 0)).toBe(200);
  expect(stats.buckets[0].groups[0].lines.reduce((sum, line) => sum + line.total, 0)).toBe(140);
});
it('Shop and Bar filter both summary and drill-through amounts', () => {
  expect(salesStatistics(lines, 'shop').total).toBe(100);
  expect(salesStatistics(lines, 'shop').buckets[0].groups[0].lines.map(l => l.id)).toEqual(['2']);
  expect(salesStatistics(lines, 'bar').total).toBe(100);
});
it('failed and unconfirmed direct payments are not sales; pending open-tab payments retain their sales', () => {
  expect(isRecordedVisitorSale('failed', 'tab1')).toBe(false);
  expect(isRecordedVisitorSale('pending', null)).toBe(false);
  expect(isRecordedVisitorSale('pending', 'tab1')).toBe(true);
  expect(isRecordedVisitorSale('on_tab', 'tab1')).toBe(true);
});