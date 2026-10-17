import { expect, it } from 'vitest';
import { filterHistoryTabs } from './history-filter';
const tabs = [
  { id: 'mixed', bar_visitor_sales: [{ total: 20, bar_items: { division: 'bar' } }, { total: 100, bar_items: { division: 'shop' } }] },
  { id: 'empty', bar_visitor_sales: [] },
  { id: 'legacy', bar_visitor_sales: [{ total: 10, bar_items: { division: null } }] },
];
it('Both preserves all tabs and mixed totals', () => expect(filterHistoryTabs(tabs, 'both')).toEqual(tabs));
it('Shop selects matching tabs and only shop amounts', () => expect(filterHistoryTabs(tabs, 'shop')).toEqual([{ id: 'mixed', bar_visitor_sales: [{ total: 100, bar_items: { division: 'shop' } }] }]));
it('Bar selects bar amounts including legacy bar items', () => {
  const result = filterHistoryTabs(tabs, 'bar');
  expect(result.map(tab => tab.id)).toEqual(['mixed', 'legacy']);
  expect(result[0].bar_visitor_sales.reduce((sum, line) => sum + line.total, 0)).toBe(20);
  expect(tabs[0].bar_visitor_sales.length).toBe(2);
});