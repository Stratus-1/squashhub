import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface MethodTotal { sales: number; tips: number; count: number }
interface CashUpRow {
  id: string; period_start: string; period_end: string; expected_cash: number; counted_cash: number; variance: number;
  card_expected: number | null; card_counted: number | null; written_off: boolean | null; write_off_amount: number | null;
  note: string | null; closed_by_name: string | null;
  totals: { methods?: Record<string, MethodTotal>; total_sales?: number; total_tips?: number; tip_payouts?: number; cash_opening?: number } | null;
}
const MONEY = /^\d+(\.\d{1,2})?$/;
const R = (n: number | string | null | undefined) => `R${Number(n ?? 0).toFixed(2)}`;
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
const LABELS: Record<string, string> = { online: "Online card", card_bar: "Card at the bar", cash: "Cash", member_account: "Member account" };

export function CashUpsReport({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [open, setOpen] = useState<CashUpRow | null>(null);
  const [edit, setEdit] = useState({ cash: "", card: "", note: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ["bar-cash-up-report", clubId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_cash_up_report" as any, { _club_id: clubId, _from: from, _to: to });
      if (error) throw error;
      return (data ?? []) as unknown as CashUpRow[];
    },
  });

  const show = (c: CashUpRow) => {
    setOpen(c);
    setEdit({ cash: Number(c.counted_cash).toFixed(2), card: Number(c.card_counted ?? c.card_expected ?? 0).toFixed(2), note: c.note ?? "", reason: "" });
  };

  const valid = MONEY.test(edit.cash) && MONEY.test(edit.card) && edit.reason.trim().length > 0;
  async function save() {
    if (!open || !valid) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("bar_cash_up_admin_update" as any, {
        _id: open.id, _counted_cash: Number(edit.cash), _card_counted: Number(edit.card), _note: edit.note, _reason: edit.reason,
      });
      if (error) throw error;
      toast.success("Cash-up updated");
      setOpen(data as unknown as CashUpRow);
      setEdit(e => ({ ...e, reason: "" }));
      await Promise.all(["bar-cash-up-report", "bar-cash-up-history"].map(k => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update cash-up"); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-3 text-xs" aria-label="Cash-ups report">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="cu-from">From</Label><Input id="cu-from" type="date" className="h-8" value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="cu-to">To</Label><Input id="cu-to" type="date" className="h-8" value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => { setFrom(today); setTo(today); }}>Today</Button>
      </div>
      {list.isLoading ? <p className="text-muted-foreground">Loading…</p>
        : list.error ? <p role="alert" className="text-destructive">{(list.error as Error).message}</p>
        : !list.data?.length ? <p className="text-muted-foreground">No cash-ups in this period.</p>
        : <div className="overflow-x-auto"><table className="w-full">
          <thead><tr className="border-b"><th className="text-left py-1">Shift</th><th className="text-left">By</th><th className="text-right">Sales</th><th className="text-right">Tips paid</th><th className="text-right">Expected cash</th><th className="text-right">Counted</th><th className="text-right">Difference</th><th /></tr></thead>
          <tbody>{list.data.map(c => <tr key={c.id} className="border-b">
            <td className="py-1">{when(c.period_start)} → {when(c.period_end)}</td>
            <td>{c.closed_by_name ?? "—"}</td>
            <td className="text-right tabular-nums">{R(c.totals?.total_sales)}</td>
            <td className="text-right tabular-nums">{R(c.totals?.tip_payouts)}</td>
            <td className="text-right tabular-nums">{R(c.expected_cash)}</td>
            <td className="text-right tabular-nums">{R(c.counted_cash)}</td>
            <td className={`text-right tabular-nums ${Number(c.variance) ? "text-destructive" : ""}`}>{R(c.variance)}{c.written_off ? " · written off" : ""}</td>
            <td className="text-right pl-2"><Button size="sm" variant="outline" className="h-7" onClick={() => show(c)}>View / edit</Button></td>
          </tr>)}</tbody>
        </table></div>}

      <Dialog open={!!open} onOpenChange={v => !v && setOpen(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Cash-up {open ? when(open.period_end) : ""}</DialogTitle></DialogHeader>
          {open && <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">Shift {when(open.period_start)} → {when(open.period_end)}{open.closed_by_name ? ` · closed by ${open.closed_by_name}` : ""}</p>
            <table className="w-full"><thead><tr className="border-b"><th className="text-left py-1">Payment type</th><th className="text-right">Sales</th><th className="text-right">Tips</th><th className="text-right">Count</th></tr></thead>
              <tbody>{Object.entries(open.totals?.methods ?? {}).map(([k, m]) => <tr key={k} className="border-b"><td className="py-1">{LABELS[k] ?? k}</td><td className="text-right tabular-nums">{R(m.sales)}</td><td className="text-right tabular-nums">{R(m.tips)}</td><td className="text-right tabular-nums">{m.count}</td></tr>)}</tbody></table>
            <div className="rounded-md border p-2 space-y-1">
              <div className="flex justify-between"><span>Opening cash</span><span className="tabular-nums">{R(open.totals?.cash_opening)}</span></div>
              <div className="flex justify-between"><span>Tips paid out</span><span className="tabular-nums">{R(open.totals?.tip_payouts)}</span></div>
              <div className="flex justify-between"><span>Expected cash</span><span className="tabular-nums">{R(open.expected_cash)}</span></div>
              <div className="flex justify-between"><span>Expected card</span><span className="tabular-nums">{R(open.card_expected)}</span></div>
              <div className={`flex justify-between font-semibold ${Number(open.variance) ? "text-destructive" : ""}`}><span>Difference</span><span className="tabular-nums">{R(open.variance)}{open.written_off ? ` · written off ${R(open.write_off_amount)}` : ""}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="cu-cash">Cash counted</Label><Input id="cu-cash" inputMode="decimal" className="h-8 text-right" value={edit.cash} disabled={busy || !!open.written_off} onChange={e => setEdit({ ...edit, cash: e.target.value })} /></div>
              <div><Label htmlFor="cu-card">Card counted</Label><Input id="cu-card" inputMode="decimal" className="h-8 text-right" value={edit.card} disabled={busy || !!open.written_off} onChange={e => setEdit({ ...edit, card: e.target.value })} /></div>
            </div>
            {open.written_off && <p className="text-muted-foreground">The difference was written off, so the amounts are locked. Record a correcting transaction in Club Finance instead.</p>}
            <div><Label htmlFor="cu-note">Note</Label><Input id="cu-note" maxLength={500} value={edit.note} disabled={busy} onChange={e => setEdit({ ...edit, note: e.target.value })} /></div>
            <div><Label htmlFor="cu-reason">Reason for change (required)</Label><Input id="cu-reason" maxLength={500} value={edit.reason} disabled={busy} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></div>
            <Button onClick={save} disabled={busy || !valid}>Save changes</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
