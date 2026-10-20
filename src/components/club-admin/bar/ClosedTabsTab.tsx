import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClubCurrency } from '@/hooks/use-currency';
import { barHistoryRange, type HistoryPeriod } from '@/lib/bar/history-range';
import type { HistoryVenue } from '@/lib/bar/history-filter';
import { isRecordedVisitorSale, salesStatistics, type SalesLine } from '@/lib/bar/sales-statistics';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const PAGE_SIZE = 25;
const periods: { value: HistoryPeriod; label: string }[] = [
  { value: '24-hours', label: 'Last 24 hours' }, { value: 'last-day', label: 'Last day' }, { value: 'week', label: 'Last seven days' },
  { value: 'month', label: 'Month so far' }, { value: 'last-month', label: 'Last month' },
  { value: 'year', label: 'Year to date' }, { value: 'last-year', label: 'Last year' }, { value: 'custom', label: 'Custom dates' },
];
type VisitorSale = {
  counter_operator_name: string | null;
  id: string; guest_tab_id: string | null; visitor_name: string | null; quantity: number; total: number; created_at: string; payment_status: string;
  bar_items: { name: string; division: string | null } | null;
  bar_guest_tabs: { guest_name: string; operator_name: string | null; status: string } | null;
};
type MemberSale = {
  counter_operator_name: string | null;
  id: string; club_member_id: string; quantity: number; total: number; created_at: string;
  bar_items: { name: string; division: string | null } | null; club_members: { name: string } | null;
};
const when = (date: string) => new Date(date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
function HistoryDatePicker({ label, date, onChange }: { label: string; date: Date | undefined; onChange: (date: Date | undefined) => void }) {
  return <div className="space-y-1"><span className="text-xs text-muted-foreground">{label}</span><Popover>
    <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start font-normal" aria-label={label}><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, 'dd MMM yyyy') : 'Pick a date'}</Button></PopoverTrigger>
    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={date} onSelect={onChange} initialFocus className="p-3 pointer-events-auto" /></PopoverContent>
  </Popover></div>;
}
export function ClosedTabsTab({ clubId }: { clubId: string }) {
  const { format: money } = useClubCurrency();
  const [period, setPeriod] = useState<HistoryPeriod>('24-hours');
  const [venue, setVenue] = useState<HistoryVenue>('both');
  const [from, setFrom] = useState<Date | undefined>(new Date());
  const [to, setTo] = useState<Date | undefined>(new Date());
  const [now, setNow] = useState(() => new Date());
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [bucket, setBucket] = useState<string | null>(null);
  const range = barHistoryRange(period, now, from && format(from, 'yyyy-MM-dd'), to && format(to, 'yyyy-MM-dd'));
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['bar-sales-statistics', clubId, range?.from, range?.to], enabled: !!clubId && !!range,
    queryFn: async () => {
      if (!range) return [] as SalesLine[];
      const visitors: VisitorSale[] = [];
      const members: MemberSale[] = [];
      for (let offset = 0; ; offset += 250) {
        const { data, error } = await supabase.from('bar_visitor_sales')
          .select('id,guest_tab_id,visitor_name,quantity,total,created_at,payment_status,counter_operator_name,bar_items(name,division),bar_guest_tabs(guest_name,operator_name,status)')
          .eq('club_id', clubId).gte('created_at', range.from).lt('created_at', range.to)
          .order('created_at', { ascending: false }).order('id').range(offset, offset + 249);
        if (error) throw error;
        visitors.push(...((data ?? []) as unknown as VisitorSale[]));
        if ((data?.length ?? 0) < 250) break;
      }
      for (let offset = 0; ; offset += 250) {
        const { data, error } = await supabase.from('bar_tab_entries')
          .select('id,club_member_id,quantity,total,created_at,counter_operator_name,bar_items(name,division),club_members:club_member_id(name)')
          .eq('club_id', clubId).gte('created_at', range.from).lt('created_at', range.to)
          .order('created_at', { ascending: false }).order('id').range(offset, offset + 249);
        if (error) throw error;
        members.push(...((data ?? []) as unknown as MemberSale[]));
        if ((data?.length ?? 0) < 250) break;
      }
      return [
        ...visitors.filter(sale => isRecordedVisitorSale(sale.payment_status, sale.guest_tab_id)).map((sale): SalesLine => ({
          id: `visitor:${sale.id}`, groupId: sale.guest_tab_id ? `tab:${sale.guest_tab_id}` : `visitor:${sale.id}`,
          name: sale.bar_guest_tabs?.guest_name ?? sale.visitor_name ?? 'Walk-in', item: sale.bar_items?.name ?? 'Item',
          division: sale.bar_items?.division ?? null, quantity: sale.quantity, total: Number(sale.total), createdAt: sale.created_at,
          bucket: !sale.guest_tab_id ? 'direct' : ['open', 'closing'].includes(sale.bar_guest_tabs?.status ?? 'open') ? 'open' : 'closed',
          operator: sale.counter_operator_name ?? null,
        })),
        ...members.map((sale): SalesLine => ({
          id: `member:${sale.id}`, groupId: `member:${sale.club_member_id}`, name: sale.club_members?.name ?? 'Member',
          item: sale.bar_items?.name ?? 'Item', division: sale.bar_items?.division ?? null, quantity: sale.quantity,
          total: Number(sale.total), createdAt: sale.created_at, bucket: 'member', operator: sale.counter_operator_name ?? null,
        })),
      ];
    },
  });
  const stats = salesStatistics(data ?? [], venue);
  const { data: periodTips = [] } = useQuery({ queryKey: ['bar-period-tips', clubId, range?.from, range?.to], enabled: Boolean(range), queryFn: async () => {
    if (!range) return [];
    const tips: { staff_name: string; amount: number }[] = [];
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await (supabase as any).from('bar_tips').select('staff_name,amount').eq('club_id', clubId).eq('status', 'earned').gte('earned_at', range.from).lt('earned_at', range.to).order('id').range(offset, offset + 249);
      if (error) throw error;
      tips.push(...(data ?? []));
      if ((data?.length ?? 0) < 250) break;
    }
    const totals = new Map<string, number>();
    tips.forEach(tip => totals.set(tip.staff_name, (totals.get(tip.staff_name) ?? 0) + Number(tip.amount)));
    return [...totals].map(([name, amount]) => ({ name, amount }));
  }});
  const selected = stats.buckets.find(value => value.value === bucket);
  const groups = selected?.groups ?? [];
  const visible = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Sales statistics</h4><Button variant="outline" size="sm" disabled={isFetching} onClick={() => { setNow(new Date()); void refetch(); }}><RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button></div>
    <div className="flex flex-wrap items-end gap-3"><div className="w-full sm:w-52"><Select value={period} onValueChange={value => { setPeriod(value as HistoryPeriod); setNow(new Date()); setPage(0); setExpanded(null); }}><SelectTrigger aria-label="Sales period"><SelectValue /></SelectTrigger><SelectContent>{periods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-1" role="group" aria-label="Shop or Bar">{(['both', 'bar', 'shop'] as const).map(value => <Button key={value} variant={venue === value ? 'default' : 'outline'} size="sm" aria-pressed={venue === value} onClick={() => { setVenue(value); setPage(0); setExpanded(null); }}>{value === 'both' ? 'Both' : value === 'bar' ? 'Bar' : 'Shop'}</Button>)}</div>
      {period === 'custom' && <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2"><HistoryDatePicker label="From date" date={from} onChange={date => { setFrom(date); setPage(0); }} /><HistoryDatePicker label="To date" date={to} onChange={date => { setTo(date); setPage(0); }} /></div>}
    </div>
    <p className="text-xs text-muted-foreground">Sale date · Johannesburg time{period === 'week' ? ' · Past 7 days' : ''}{venue !== 'both' ? ` · ${venue === 'bar' ? 'Bar' : 'Shop'} items and amounts` : ''}</p>
    {venue !== 'shop' && periodTips.length > 0 && <div className="border-y py-2 space-y-1">{periodTips.map(tip => <div key={tip.name} className="flex justify-between text-xs gap-3"><span>Tip income — {tip.name}</span><span className="tabular-nums">{money(tip.amount)}</span></div>)}</div>}
    {!range ? <p role="alert" className="text-sm text-destructive">Choose a start and end date, with the end on or after the start.</p>
      : error ? <div role="alert" className="text-sm text-destructive">Could not load sales statistics. <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></div>
      : isLoading ? <p className="text-sm text-muted-foreground">Loading sales…</p>
      : <>
        <Button variant="outline" className="h-auto w-full justify-between gap-3 whitespace-normal p-4 text-left" aria-label="Total sales" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
          <span><span className="block text-sm font-medium">Total sales</span><span className="block text-xs font-normal text-muted-foreground">{stats.count} sale items · Open and closed tabs, member accounts and direct sales</span></span>
          <span className="flex shrink-0 items-center gap-2"><span className="text-xl font-semibold">{money(stats.total)}</span>{showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
        </Button>
        {showDetails && <div className="divide-y border-y">{stats.buckets.map(value => <div key={value.value}>
          <Button variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal py-3 text-left" aria-expanded={bucket === value.value} onClick={() => { setBucket(bucket === value.value ? null : value.value); setPage(0); setExpanded(null); }}>
            <span>{value.label}<span className="ml-2 text-xs font-normal text-muted-foreground">({value.groups.length})</span></span><span className="flex items-center gap-2">{money(value.total)}{bucket === value.value ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          </Button>
          {bucket === value.value && <div className="space-y-1 pb-3 pl-3 sm:pl-6">
            {!groups.length && <p className="text-xs text-muted-foreground">No sales in this period.</p>}
            {visible.map(group => <div key={group.id} className="border-t">
              <Button variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal py-2 text-left" aria-expanded={expanded === group.id} onClick={() => setExpanded(expanded === group.id ? null : group.id)}>
                <span className="min-w-0 break-words">{group.name}{group.operator && <span className="block text-xs font-normal text-muted-foreground">Served by {group.operator}</span>}</span>
                <span className="flex shrink-0 items-center gap-2">{money(group.total)}{expanded === group.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
              </Button>
              {expanded === group.id && <div className="space-y-2 px-3 pb-3">{group.lines.map(line => <div key={line.id} className="flex justify-between gap-3 text-xs"><span className="min-w-0 break-words">{line.quantity} × {line.item}<span className="block text-muted-foreground">{when(line.createdAt)} · {line.operator ? `Served by ${line.operator}` : 'No counter operator recorded'}</span></span><span className="shrink-0">{money(line.total)}</span></div>)}</div>}
            </div>)}
            {groups.length > PAGE_SIZE && <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, groups.length)} of {groups.length}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); setExpanded(null); }}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= groups.length} onClick={() => { setPage(page + 1); setExpanded(null); }}>Next</Button></div></div>}
          </div>}
        </div>)}</div>}
        <div className="space-y-1"><h5 className="text-sm font-medium">Items sold</h5>
          {!stats.items.length ? <p className="text-xs text-muted-foreground">No items sold in this period.</p>
            : <div className="divide-y border-y">{stats.items.map(row => <div key={row.item} className="flex justify-between gap-3 py-1.5 text-xs"><span className="min-w-0 break-words"><span className="tabular-nums font-medium">{row.quantity} ×</span> {row.item}</span><span className="shrink-0 tabular-nums">{money(row.total)}</span></div>)}
              <div className="flex justify-between py-1.5 text-xs font-medium"><span>{stats.items.reduce((s, r) => s + r.quantity, 0)} items in total</span><span className="tabular-nums">{money(stats.total)}</span></div></div>}
        </div>
      </>}
  </div>;
}
