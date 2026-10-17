import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useClubCurrency } from '@/hooks/use-currency';
import { barHistoryRange, type HistoryPeriod } from '@/lib/bar/history-range';
import { filterHistoryTabs, type HistoryVenue } from '@/lib/bar/history-filter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const PAGE_SIZE = 25;
const periods: { value: HistoryPeriod; label: string }[] = [
  { value: '24-hours', label: 'Last 24 hours' }, { value: 'week', label: 'Last week' },
  { value: 'month', label: 'Month so far' }, { value: 'last-month', label: 'Last month' },
  { value: 'year', label: 'Year to date' }, { value: 'last-year', label: 'Last year' }, { value: 'custom', label: 'Custom dates' },
];
type ClosedTab = {
  id: string; guest_name: string; operator_name: string | null; opened_at: string;
  closed_at: string | null; settled_method: string | null; status: string;
  bar_visitor_sales: { id: string; quantity: number; total: number; bar_items: { name: string; division: string | null } | null }[];
};
const when = (date: string) => new Date(date).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const methods: Record<string, string> = { cash: 'Cash', terminal: 'Swipe at bar', online: 'Online card', member_account: 'Member account' };
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
  const range = barHistoryRange(period, now, from && format(from, 'yyyy-MM-dd'), to && format(to, 'yyyy-MM-dd'));
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['bar-closed-tabs', clubId, range?.from, range?.to], enabled: !!clubId && !!range,
    queryFn: async () => {
      if (!range) return [] as ClosedTab[];
      const rows: ClosedTab[] = [];
      for (let offset = 0; ; offset += 250) {
      const { data, error } = await supabase.from('bar_guest_tabs')
        .select('id,guest_name,operator_name,opened_at,closed_at,settled_method,status,bar_visitor_sales(id,quantity,total,bar_items(name,division))')
        .eq('club_id', clubId).in('status', ['settled', 'closed']).gte('closed_at', range.from).lt('closed_at', range.to)
        .order('closed_at', { ascending: false }).order('id').range(offset, offset + 249);
      if (error) throw error;
      rows.push(...((data ?? []) as unknown as ClosedTab[]));
      if ((data?.length ?? 0) < 250) break;
      }
      return rows;
    },
  });
  const filtered = filterHistoryTabs(data ?? [], venue);
  const count = filtered.length;
  const tabs = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-medium">Closed tabs</h4><Button variant="outline" size="sm" disabled={isFetching} onClick={() => { setNow(new Date()); void refetch(); }}><RefreshCw className={`mr-1 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button></div>
    <div className="flex flex-wrap items-end gap-3"><div className="w-full sm:w-52"><Select value={period} onValueChange={value => { setPeriod(value as HistoryPeriod); setNow(new Date()); setPage(0); setExpanded(null); }}><SelectTrigger aria-label="Closed tab period"><SelectValue /></SelectTrigger><SelectContent>{periods.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex gap-1" role="group" aria-label="Shop or Bar">{(['both', 'bar', 'shop'] as const).map(value => <Button key={value} variant={venue === value ? 'default' : 'outline'} size="sm" aria-pressed={venue === value} onClick={() => { setVenue(value); setPage(0); setExpanded(null); }}>{value === 'both' ? 'Both' : value === 'bar' ? 'Bar' : 'Shop'}</Button>)}</div>
      {period === 'custom' && <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2"><HistoryDatePicker label="From date" date={from} onChange={date => { setFrom(date); setPage(0); }} /><HistoryDatePicker label="To date" date={to} onChange={date => { setTo(date); setPage(0); }} /></div>}
    </div>
    <p className="text-xs text-muted-foreground">Closed date · Johannesburg time{period === 'week' ? ' · Past 7 days' : ''}{venue !== 'both' ? ` · ${venue === 'bar' ? 'Bar' : 'Shop'} items and amounts` : ''}</p>
    {!range ? <p role="alert" className="text-sm text-destructive">Choose a start and end date, with the end on or after the start.</p>
      : error ? <div role="alert" className="text-sm text-destructive">Could not load closed tabs. <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></div>
      : isLoading ? <p className="text-sm text-muted-foreground">Loading closed tabs…</p>
      : !count ? <p className="text-sm text-muted-foreground">No closed tabs in this period.</p>
      : <><div className="bg-muted px-3 py-2 text-sm font-medium">{count} closed tab{count === 1 ? '' : 's'}</div><div className="divide-y rounded-md border">{tabs.map(tab => {
        const open = expanded === tab.id;
        const total = tab.bar_visitor_sales.reduce((sum, line) => sum + Number(line.total), 0);
        return <div key={tab.id} className="px-3 py-2"><Button variant="ghost" className="h-auto w-full justify-between gap-3 whitespace-normal px-0 text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : tab.id)}>
          <span className="min-w-0 space-y-1"><span className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{tab.guest_name}</span><Badge variant="secondary">{tab.status === 'closed' ? 'Closed — no charge' : methods[tab.settled_method ?? ''] ?? tab.settled_method ?? 'Not recorded'}</Badge></span><span className="block text-xs font-normal text-muted-foreground">{tab.closed_at ? when(tab.closed_at) : 'Date not recorded'} · {tab.operator_name ? `served by ${tab.operator_name}` : 'operator not recorded'}</span></span>
          <span className="flex shrink-0 items-center gap-2"><span>{money(total)}</span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span></Button>
          {open && <div className="mt-2 space-y-2 border-t pt-2 text-xs"><p className="text-muted-foreground">Opened {when(tab.opened_at)}</p>{!tab.bar_visitor_sales.length ? <p className="text-muted-foreground">No items charged.</p> : tab.bar_visitor_sales.map(line => <div key={line.id} className="flex justify-between gap-3"><span>{line.quantity} × {line.bar_items?.name ?? 'Item'}</span><span className="shrink-0">{money(Number(line.total))}</span></div>)}</div>}</div>;
      })}</div><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0 || isFetching} onClick={() => { setPage(page - 1); setExpanded(null); }}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= count || isFetching} onClick={() => { setPage(page + 1); setExpanded(null); }}>Next</Button></div></div></>}
  </div>;
}
