import { useState } from "react";
import type React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cashUpDateLabel } from "@/lib/bar/cash-up-date";
import { isTipPayoutInput, validTipPayout } from "@/lib/bar/tips";

interface EditablePayout { id: string; staff_name: string; amount: number; maximum: number }
interface MethodTotal { sales: number; tips: number; count: number }
interface CashUpRow {
  id: string; period_start: string; period_end: string; expected_cash: number; counted_cash: number; variance: number;
  card_expected: number | null; card_counted: number | null; written_off: boolean | null; write_off_amount: number | null;
  note: string | null; closed_by_name: string | null;
  totals: { methods?: Record<string, MethodTotal>; total_sales?: number; total_tips?: number; tip_payouts?: number; cash_opening?: number; cash_up_date?: string } | null;
}
const MONEY = /^\d+(\.\d{1,2})?$/;
const R = (n: number | string | null | undefined) => `R${Number(n ?? 0).toFixed(2)}`;
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });

/** Running cash: the opening balance is the cash counted at the previous cash-up. */
export function cashUpFigures(c: CashUpRow, previous: CashUpRow | undefined) {
  const m = (k: string) => c.totals?.methods?.[k] ?? { sales: 0, tips: 0, count: 0 };
  const gross = (k: string) => Number(m(k).sales) + Number(m(k).tips);
  const opening = Number(previous ? previous.counted_cash : (c.totals?.cash_opening ?? 0));
  const tipsOut = Number(c.totals?.tip_payouts ?? 0);
  return { m, gross, opening, tipsOut, cashShould: opening + gross("cash") - tipsOut, cardShould: gross("card_bar") };
}

export function CashUpsReport({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [from, setFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [to, setTo] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ cash: "", card: "", note: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [payoutEdits, setPayoutEdits] = useState<Record<string, string>>({});
  const payouts = useQuery({
    queryKey: ["bar-cash-up-edit-payouts", clubId, openId],
    enabled: !!openId,
    queryFn: async () => {
      if (!openId) return [];
      const { data, error } = await supabase.rpc("bar_cash_up_edit_payouts", { _id: openId });
      if (error) throw error;
      return (data ?? []) as unknown as EditablePayout[];
    },
  });

  const all = useQuery({
    queryKey: ["bar-cash-up-report", clubId, "all"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_cash_up_report" as any, { _club_id: clubId, _from: "2000-01-01", _to: "2100-01-01" });
      if (error) throw error;
      return (data ?? []) as unknown as CashUpRow[];
    },
  });
  const rows = (all.data ?? []).filter(c => {
    const d = cashUpDateLabel(c.totals?.cash_up_date) ? c.totals?.cash_up_date ?? "" : format(new Date(c.period_end), "yyyy-MM-dd");
    return d >= from && d <= to;
  });
  const prevOf = (c: CashUpRow) => (all.data ?? []).find(p => p.period_end < c.period_end);
  const open = (all.data ?? []).find(c => c.id === openId) ?? null;

  const show = (c: CashUpRow) => {
    setOpenId(c.id);
    setPayoutEdits({});
    setEdit({ cash: Number(c.counted_cash).toFixed(2), card: Number(c.card_counted ?? c.card_expected ?? 0).toFixed(2), note: c.note ?? "", reason: "" });
  };

  async function save() {
    if (!open) return;
    setBusy(true);
    try {
      const changes = (payouts.data ?? []).filter(p => payoutEdits[p.id] !== undefined && Number(payoutEdits[p.id]) !== Number(p.amount));
      if (changes.some(p => !validTipPayout(payoutEdits[p.id] ?? "", Number(p.maximum)))) throw new Error("Enter a positive paid-tip amount within the staff balance");
      const { error } = await supabase.rpc("bar_cash_up_admin_correct", {
        _id: open.id, _counted_cash: Number(edit.cash), _card_counted: Number(edit.card), _note: edit.note, _reason: edit.reason,
        _payouts: changes.map(p => ({ id: p.id, expected_amount: Number(p.amount), amount: Number(payoutEdits[p.id]) })),
      });
      if (error) throw error;
      toast.success("Cash-up updated");
      setEdit(e => ({ ...e, reason: "" }));
      await Promise.all(["bar-cash-up-edit-payouts", "bar-cash-up-report", "bar-cash-up-history", "bar-cash-up-preview", "bar-cash-up", "bar-staff-tips", "bar-shift-overview", "income-statement"].map(k => qc.invalidateQueries({ queryKey: [k] })));
      setPayoutEdits({});
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update cash-up"); }
    finally { setBusy(false); }
  }

  const isLatest = (c: CashUpRow) => !(all.data ?? []).some(p => p.period_end > c.period_end);

  const renderDetail = (c: CashUpRow) => {
    const saved = cashUpFigures(c, prevOf(c));
    const payoutDelta = (payouts.data ?? []).reduce((sum, p) => {
      const value = payoutEdits[p.id];
      return sum + (value !== undefined && MONEY.test(value) ? Number(value) - Number(p.amount) : 0);
    }, 0);
    const f = { ...saved, tipsOut: saved.tipsOut + payoutDelta, cashShould: saved.cashShould - payoutDelta };
    const locked = !!c.written_off || busy;
    const vCash = MONEY.test(edit.cash) ? Number(edit.cash) - f.cashShould : null;
    const vCard = MONEY.test(edit.card) ? Number(edit.card) - f.cardShould : null;
    const variance = vCash === null || vCard === null ? null : Math.round((vCash + vCard) * 100) / 100;
    const valid = MONEY.test(edit.cash) && MONEY.test(edit.card) && edit.reason.trim().length > 0 && !payouts.isLoading && !payouts.error
      && (payouts.data ?? []).every(p => payoutEdits[p.id] === undefined || validTipPayout(payoutEdits[p.id], Number(p.maximum)));
    const row = (label: string, k: string, out: number, should: number, actual: React.ReactNode) =>
      <tr key={k} className="border-b"><td className="py-1">{label} <span className="text-muted-foreground">({f.m(k).count})</span></td>
        <td className="text-right tabular-nums">{R(f.m(k).sales)}</td><td className="text-right tabular-nums">{R(f.m(k).tips)}</td>
        <td className="text-right tabular-nums">{out ? R(out) : "—"}</td><td className="text-right tabular-nums font-medium">{R(should)}</td>
        <td className="text-right pl-2">{actual}</td></tr>;
    return <div className="space-y-4 text-xs">
      <p className="text-muted-foreground">Shift from <strong>{when(c.period_start)}</strong> to <strong>{when(c.period_end)}</strong>{c.closed_by_name ? ` · closed by ${c.closed_by_name}` : ""}</p>
      <div className="overflow-x-auto"><h4 className="font-semibold mb-1">Reconciliation</h4>
        <table className="w-full"><thead><tr className="border-b"><th className="text-left py-1">Payment type</th><th className="text-right">Sales</th><th className="text-right">Tips</th><th className="text-right">Tips paid in cash</th><th className="text-right">Should be</th><th className="text-right pl-2">Actual</th></tr></thead>
          <tbody>
            {row("Online card (paid online)", "online", 0, f.gross("online"), <span className="tabular-nums">{R(f.gross("online"))}</span>)}
            {row("Card swiped at the bar", "card_bar", 0, f.cardShould, <Input aria-label="Actual card at the bar" inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={edit.card} disabled={locked} onChange={e => setEdit({ ...edit, card: e.target.value })} />)}
            {row("Cash", "cash", f.tipsOut, f.cashShould, <Input aria-label="Cash counted" inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={edit.cash} disabled={locked} onChange={e => setEdit({ ...edit, cash: e.target.value })} />)}
            {row("Member account", "member_account", 0, f.gross("member_account"), <span className="tabular-nums">{R(f.gross("member_account"))}</span>)}
            <tr className="font-semibold"><td className="py-1">Total</td><td className="text-right tabular-nums">{R(c.totals?.total_sales)}</td><td className="text-right tabular-nums">{R(c.totals?.total_tips)}</td><td className="text-right tabular-nums">{f.tipsOut ? R(f.tipsOut) : "—"}</td>
              <td className="text-right tabular-nums">{R(f.gross("online") + f.cardShould + f.cashShould + f.gross("member_account"))}</td>
              <td className="text-right tabular-nums pl-2">{MONEY.test(edit.cash) && MONEY.test(edit.card) ? R(f.gross("online") + Number(edit.card) + Number(edit.cash) + f.gross("member_account")) : "—"}</td></tr>
          </tbody></table></div>
      <div className="rounded-md border p-3 space-y-1 max-w-sm" aria-label="Cash balance">
        <h4 className="font-semibold">Cash balance</h4>
        <div className="flex justify-between"><span>Opening balance (counted at previous cash-up)</span><span className="tabular-nums">{R(f.opening)}</span></div>
        <div className="flex justify-between"><span>+ New cash sales &amp; tips</span><span className="tabular-nums">{R(f.gross("cash"))}</span></div>
        <div className="flex justify-between"><span>− Tips paid out</span><span className="tabular-nums">{R(f.tipsOut)}</span></div>
        <div className="flex justify-between font-semibold border-t pt-1"><span>Should be in the till</span><span className="tabular-nums">{R(f.cashShould)}</span></div>
        <div className="flex justify-between"><span>Closing balance (counted)</span><span className="tabular-nums">{MONEY.test(edit.cash) ? R(edit.cash) : "—"}</span></div>
      </div>
      {payouts.isLoading ? <p className="text-muted-foreground">Loading paid tips…</p> : payouts.error ? <p role="alert" className="text-destructive">Could not load paid tips. Close and reopen this cash-up to try again.</p> : (payouts.data ?? []).length > 0 && <div className="space-y-2">
        <h4 className="font-semibold">Tips paid in cash</h4>
        {(payouts.data ?? []).map(p => <div key={p.id} className="flex items-center justify-between gap-3">
          <Label htmlFor={`cu-tip-${p.id}`}>Tips paid to {p.staff_name}</Label>
          <Input id={`cu-tip-${p.id}`} inputMode="decimal" className="h-8 w-28 text-right" value={payoutEdits[p.id] ?? Number(p.amount).toFixed(2)} disabled={busy || !isLatest(c)}
            onChange={e => { if (isTipPayoutInput(e.target.value)) setPayoutEdits(values => ({ ...values, [p.id]: e.target.value })); }} />
        </div>)}
        {!isLatest(c) && <p className="text-muted-foreground">Paid tips can only be corrected on the most recent cash-up.</p>}
      </div>}
      <div className="rounded-md border p-3 space-y-2">
        {variance !== null && <p className={variance === 0 ? "text-muted-foreground" : "text-destructive font-medium"}>{variance === 0 ? "Everything balances." : `${variance > 0 ? "Surplus" : "Shortfall"} of ${R(Math.abs(variance))}`}</p>}
        {c.written_off && <p className="text-muted-foreground">At closing, {R(c.write_off_amount)} was written off to bar cost of sales. Counted amounts stay locked. Saving a paid-tip correction also adjusts the write-off without changing counted cash.</p>}
        <Label htmlFor="cu-note">Note</Label>
        <Input id="cu-note" maxLength={500} value={edit.note} disabled={busy} onChange={e => setEdit({ ...edit, note: e.target.value })} />
        <Label htmlFor="cu-reason">Reason for change (required)</Label>
        <Input id="cu-reason" maxLength={500} value={edit.reason} disabled={busy} onChange={e => setEdit({ ...edit, reason: e.target.value })} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy || !valid}>Save changes</Button>
        </div>
      </div>
    </div>;
  };

  return (
    <section className="space-y-3 text-xs" aria-label="Cash-ups report">
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="cu-from">From</Label><Input id="cu-from" type="date" className="h-8" value={from} max={to} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="cu-to">To</Label><Input id="cu-to" type="date" className="h-8" value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => { setFrom(today); setTo(today); }}>Today</Button>
      </div>
      {all.isLoading ? <p className="text-muted-foreground">Loading…</p>
        : all.error ? <p role="alert" className="text-destructive">{(all.error as Error).message}</p>
        : !rows.length ? <p className="text-muted-foreground">No cash-ups in this period.</p>
        : <div className="overflow-x-auto"><table className="w-full">
          <thead><tr className="border-b"><th className="text-left py-1">Shift</th><th className="text-left">By</th><th className="text-right">Sales</th><th className="text-right">Opening cash</th><th className="text-right">Cash should be</th><th className="text-right">Closing (counted)</th><th className="text-right">Difference</th><th /></tr></thead>
          <tbody>{rows.map(c => { const f = cashUpFigures(c, prevOf(c)); const d = Number(c.counted_cash) - f.cashShould + Number(c.card_counted ?? f.cardShould) - f.cardShould; return <tr key={c.id} className="border-b">
            <td className="py-1">{cashUpDateLabel(c.totals?.cash_up_date) && <div className="font-semibold">{cashUpDateLabel(c.totals?.cash_up_date)}</div>}{when(c.period_start)} → {when(c.period_end)}</td>
            <td>{c.closed_by_name ?? "—"}</td>
            <td className="text-right tabular-nums">{R(c.totals?.total_sales)}</td>
            <td className="text-right tabular-nums">{R(f.opening)}</td>
            <td className="text-right tabular-nums">{R(f.cashShould)}</td>
            <td className="text-right tabular-nums">{R(c.counted_cash)}</td>
            <td className={`text-right tabular-nums ${Math.abs(d) > 0.004 ? "text-destructive" : ""}`}>{R(d)}{c.written_off ? " · written off" : ""}</td>
            <td className="text-right pl-2"><Button size="sm" variant="outline" className="h-7" onClick={() => show(c)}>View / edit</Button></td>
          </tr>; })}</tbody>
        </table></div>}

      <Dialog open={!!open} onOpenChange={v => !v && setOpenId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Cash-up {open ? cashUpDateLabel(open.totals?.cash_up_date) ?? when(open.period_end) : ""}</DialogTitle></DialogHeader>
          {open && renderDetail(open)}
        </DialogContent>
      </Dialog>
    </section>
  );
}
