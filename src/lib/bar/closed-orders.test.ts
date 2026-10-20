import { expect, it } from 'vitest';
import { closedOrderTotals, type ClosedOrderLine } from './closed-orders';
const line: ClosedOrderLine = { id: '1', orderId: 'order1', orderNumber: 12, name: 'Guest', method: 'cash', total: 20, date: '2026-10-20', division: 'bar' };
it('shows one order total instead of individual sale lines', () => {
  const result = closedOrderTotals([line, { ...line, id: '2', total: 30 }], 'all', 'both');
  expect(result.orders).toHaveLength(1);
  expect(result.orders[0].total).toBe(50);
});
it('keeps separate member-account orders separate for the same person', () => {
  expect(closedOrderTotals([{ ...line, method: 'member_account' }, { ...line, id: '2', orderId: 'order2', method: 'member_account' }], 'member_account', 'both').orders).toHaveLength(2);
});
it('filters cash, online card, swipe and member-account totals independently', () => {
  const lines = ['cash', 'online', 'terminal', 'member_account'].map((method, i) => ({ ...line, method, total: (i + 1) * 20 }));
  expect(closedOrderTotals(lines, 'cash', 'both').total).toBe(20);
  expect(closedOrderTotals(lines, 'online', 'both').total).toBe(40);
  expect(closedOrderTotals(lines, 'terminal', 'both').total).toBe(60);
  expect(closedOrderTotals(lines, 'member_account', 'both').total).toBe(80);
});
it('division filters apply to order totals without counting excluded items', () => {
  expect(closedOrderTotals([line, { ...line, id: '2', division: 'shop', total: 100 }], 'all', 'shop').total).toBe(100);
});