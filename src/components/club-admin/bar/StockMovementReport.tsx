import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadStockCsv, stockColumns, stockDateRange, stockMovementCsv, stockToday, type StockMovementReport as Report, type StockPeriod } from "@/lib/bar/stock-movement-report";

export function StockMovementReport({ clubId }: { clubId: string }) {
  const [period, setPeriod] = useState<StockPeriod>("month");
  const [range, setRange] = useState(() => stockDateRange("month"));
  const [search, setSearch] = useState("");
  const valid = !!range.from && !!range.to && range.from <= range.to && range.to <= stockToday();
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["bar-stock-movement-report", clubId, range.from, range.to],
    enabled: valid && !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_stock_movement_report", { _club_id: clubId, _from: range.from, _to: range.to });
      if (error) throw error;
      return data as unknown as Report;
    },
  });
  const rows = useMemo(() => (data?.rows ?? []).filter(row => row.name.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const changePeriod = (value: string) => {
    const next = value as StockPeriod;
    setPeriod(next);
    if (next !== "custom") setRange(stockDateRange(next));
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1 min-w-40"><Label>Period</Label><Select value={period} onValueChange={changePeriod}><SelectTrigger aria-label="Stock report period"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="day">Last day (today)</SelectItem><SelectItem value="week">Last seven days</SelectItem><SelectItem value="month">This month</SelectItem><SelectItem value="last-month">Last month</SelectItem><SelectItem value="custom">Custom dates</SelectItem>
      </SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="stock-report-from">From</Label><Input id="stock-report-from" type="date" value={range.from} max={range.to || stockToday()} onChange={e => { setPeriod("custom"); setRange({ ...range, from: e.target.value }); }} /></div>
      <div className="space-y-1"><Label htmlFor="stock-report-to">To</Label><Input id="stock-report-to" type="date" value={range.to} min={range.from} max={stockToday()} onChange={e => { setPeriod("custom"); setRange({ ...range, to: e.target.value }); }} /></div>
      <Button variant="outline" size="icon" aria-label="Refresh stock report" title="Refresh stock report" disabled={!valid || isFetching} onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
      <Button variant="outline" disabled={!valid || isFetching || !!error || !rows.length} onClick={() => data && downloadStockCsv(stockMovementCsv(rows, range.from, range.to, data.generated_at), `stock-movements-${range.from}-to-${range.to}.csv`)}><Download className="mr-2 h-4 w-4" />CSV / Excel</Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">Stock movement report</h3>
      <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Search stock report" placeholder="Search items" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} /></div>
    </div>
    {!valid ? <p className="text-destructive" role="alert">Choose valid dates up to today.</p> : error ? <p className="text-destructive" role="alert">Could not load stock movements. Please try again.</p> : isFetching ? <p role="status" className="text-muted-foreground">Loading stock movements…</p> : <>
      {data && <p className="text-xs text-muted-foreground">{range.from} – {range.to} · Current stock as at {new Date(data.generated_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })} (Johannesburg) · {rows.length} items</p>}
      {data && !data.history_complete && <p role="alert" className="text-sm text-muted-foreground">Recorded stock history starts on 27 September 2026. Earlier opening balances are unavailable; movements before that date may be incomplete.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="border-b bg-muted"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Division</th><th className="p-2 text-left">Stock unit</th>{stockColumns.map(([key, label]) => <th key={key} className="p-2 text-right">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} className="border-b"><td className="p-2 font-medium">{row.name}</td><td className="p-2 capitalize">{row.division}</td><td className="p-2">{row.unit_label}</td>{stockColumns.map(([key]) => <td key={key} className="p-2 text-right tabular-nums">{row[key] == null ? "—" : row[key].toLocaleString("en-ZA")}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {!rows.length && <p className="py-4 text-muted-foreground">No stock items found.</p>}
    </>}
  </section>;
}