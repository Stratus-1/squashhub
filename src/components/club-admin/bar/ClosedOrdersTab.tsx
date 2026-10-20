import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fromExt } from '@/lib/supabase-ext';
import { useClubCurrency } from '@/hooks/use-currency';
import { barHistoryRange, type HistoryPeriod } from '@/lib/bar/history-range';
import type { HistoryVenue } from '@/lib/bar/history-filter';
import { closedOrderTotals, paymentCategories, type PaymentCategory, type ClosedOrderLine } from '@/lib/bar/closed-orders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const periods: { value: HistoryPeriod; label: string }[] = [
  { value: '24-hours', label: 'Last 24 hours' }, { value: 'last-day', label: 'Last day' },
  { value: 'week', label: 'Last seven days' }, { value: 'month', label: 'Month so far' },
  { value: 'last-month', label: 'Last month' }, { value: 'year', label: 'Year to date' },
  { value: 'last-year', label: 'Last year' }, { value: 'custom', label: 'Custom dates' },
];
const when = (value: string) => new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function ClosedOrdersTab({ clubId }: { clubId: string }) {
  const { format: money } = useClubCurrency();
  const [method, setMethod] = useState<PaymentCategory>('all');
  const [venue, setVenue] = useState<HistoryVenue>('both');
  const [period, setPeriod] = useState<HistoryPeriod>('24-hours');
  const [now, setNow] = useState(() => new Date());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const range = barHistoryRange(period, now, from, to);
  const { data = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['bar-closed-orders', clubId, range?.from, range?.to], enabled: !!clubId && !!range,
    queryFn: async () => {
      if (!range) return [] as ClosedOrderLine[];
      const paginate = async (query: (offset: number) => any): Promise<any[]> => {
        const rows: any[] = [];
        for (let offset = 0; ; offset += 250) {
          const { data, error } = await query(offset);
          if (error) throw error;
          rows.push(...(data ?? []));
          if ((data?.length ?? 0) < 250) return rows;
        }
      };
      const [tabs, direct, members] = await Promise.all([
        paginate(offset => supabase.from('bar_guest_tabs').select('id,guest_name,settled_method,closed_at,bar_visitor_sales(id,total,bar_items(division),bar_order_lines(order_id,bar_orders(order_number)))')
          .eq('club_id', clubId).eq('status', 'settled').gte('closed_at', range.from).lt('closed_at', range.to).order('closed_at', { ascending: false }).order('id').range(offset, offset + 249)),
        paginate(offset => supabase.from('bar_visitor_sales').select('id,visitor_name,total,created_at,payment_method,payment_reference,note,bar_items(division),bar_order_lines(order_id,bar_orders(order_number))')
          .eq('club_id', clubId).is('guest_tab_id', null).in('payment_status', ['paid', 'recorded', 'settled']).gte('created_at', range.from).lt('created_at', range.to).order('created_at', { ascending: false }).order('id').range(offset, offset + 249)),
        paginate(offset => fromExt('bar_tab_entries').select('id,club_member_id,total,created_at,source,club_members:club_member_id(name),bar_items(division)')
          .eq('club_id', clubId).gte('created_at', range.from).lt('created_at', range.to).order('created_at', { ascending: false }).order('id').range(offset, offset + 249)),
      ]);
      const links = new Map<string, { orderId: string; number: number | null }>();
      for (let start = 0; start < members.length; start += 200) {
        const ids = members.slice(start, start + 200).map(row => row.id);
        const rows = await paginate(offset => fromExt('bar_order_lines').select('member_tab_entry_id,order_id,bar_orders(order_number)').eq('club_id', clubId).in('member_tab_entry_id', ids).order('id').range(offset, offset + 249));
        rows.forEach(row => links.set(row.member_tab_entry_id, { orderId: row.order_id, number: row.bar_orders?.order_number ?? null }));
      }
      return [
        ...tabs.flatMap(tab => (tab.bar_visitor_sales ?? []).map((sale: any): ClosedOrderLine => ({ id: sale.id, orderId: sale.bar_order_lines?.[0]?.order_id ?? tab.id, orderNumber: sale.bar_order_lines?.[0]?.bar_orders?.order_number ?? null, name: tab.guest_name, method: tab.settled_method ?? 'unknown', total: Number(sale.total), date: tab.closed_at, division: sale.bar_items?.division ?? null }))),
        ...direct.map((sale): ClosedOrderLine => ({ id: sale.id, orderId: sale.bar_order_lines?.[0]?.order_id ?? sale.payment_reference ?? sale.id, orderNumber: sale.bar_order_lines?.[0]?.bar_orders?.order_number ?? null, name: sale.visitor_name ?? 'Walk-in', method: sale.payment_method === 'card' ? (/paid online/i.test(sale.note ?? '') ? 'online' : 'terminal') : sale.payment_method, total: Number(sale.total), date: sale.created_at, division: sale.bar_items?.division ?? null })),
        ...members.map((sale): ClosedOrderLine => ({ id: sale.id, orderId: links.get(sale.id)?.orderId ?? `account:${sale.club_member_id}:${sale.created_at}:${sale.source}`, orderNumber: links.get(sale.id)?.number ?? null, name: sale.club_members?.name ?? 'Member', method: 'member_account', total: Number(sale.total), date: sale.created_at, division: sale.bar_items?.division ?? null })),
      ];
    },
  });
  const totals = closedOrderTotals(data, method, venue);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Closed tabs</h4><Button variant="outline" size="sm" disabled={isFetching} onClick={() => { setNow(new Date()); void refetch(); }}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button></div>
    <div className="flex flex-wrap gap-1" role="group" aria-label="Payment method">{paymentCategories.map(option => <Button key={option.value} size="sm" variant={method === option.value ? 'default' : 'outline'} aria-pressed={method === option.value} onClick={() => { setMethod(option.value); setPage(0); }}>{option.label}</Button>)}</div>
    <div className="flex flex-wrap items-center gap-3"><Select value={period} onValueChange={value => { setPeriod(value as HistoryPeriod); setNow(new Date()); setPage(0); }}><SelectTrigger className="w-full sm:w-52" aria-label="Closed tabs period"><SelectValue /></SelectTrigger><SelectContent>{periods.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>
      <div className="flex gap-1" role="group" aria-label="Shop or Bar">{(['both', 'bar', 'shop'] as const).map(value => <Button key={value} size="sm" variant={venue === value ? 'default' : 'outline'} onClick={() => { setVenue(value); setPage(0); }}>{value === 'both' ? 'Both' : value === 'bar' ? 'Bar' : 'Shop'}</Button>)}</div>
      {period === 'custom' && <div className="flex flex-wrap gap-2"><Input type="date" aria-label="From date" value={from} onChange={event => { setFrom(event.target.value); setPage(0); }} /><Input type="date" aria-label="To date" value={to} onChange={event => { setTo(event.target.value); setPage(0); }} /></div>}
    </div>
    <p className="text-xs text-muted-foreground">Closed / charged date · Johannesburg time</p>
    {!range ? <p role="alert" className="text-sm text-destructive">Choose valid start and end dates.</p> : error ? <p role="alert" className="text-sm text-destructive">Could not load closed tabs. <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></p> : isLoading ? <p className="text-sm text-muted-foreground">Loading closed tabs…</p> : <>
      <div className="flex justify-between gap-3 border-y py-3 text-sm font-semibold"><span>{totals.orders.length} orders</span><span className="tabular-nums">{money(totals.total)}</span></div>
      {!totals.orders.length && <p className="text-sm text-muted-foreground">No closed tabs for this period and payment method.</p>}
      <div className="divide-y">{totals.orders.slice(page * 25, (page + 1) * 25).map(order => <div key={`${order.method}:${order.orderId}`} className="flex items-center justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-words font-medium">{order.name}</p><p className="text-xs text-muted-foreground">{order.orderNumber != null ? `Order #${order.orderNumber}` : `Ref ${order.orderId.slice(-8)}`} · {when(order.date)} · {paymentCategories.find(option => option.value === order.method)?.label ?? 'Other'}</p></div><span className="shrink-0 tabular-nums font-semibold">{money(order.total)}</span></div>)}</div>
      {totals.orders.length > 25 && <div className="flex justify-between"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * 25 >= totals.orders.length} onClick={() => setPage(page + 1)}>Next</Button></div>}
    </>}
  </div>;
}