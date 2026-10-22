import type React from "react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsSuperAdmin } from "@/hooks/use-club";
import { CashUpsReport } from "@/components/club-admin/bar/CashUpsReport";
import { isTipPayoutInput, validTipPayout } from "@/lib/bar/tips";
import { cashUpDateLabel } from "@/lib/bar/cash-up-date";
export { cashUpDateLabel } from "@/lib/bar/cash-up-date";

interface MethodTotal { sales: number; tips: number; count: number }
interface Summary { period_start: string; period_end: string; methods: Record<string, MethodTotal>; total_sales: number; total_tips: number; tip_payouts: number; expected_cash: number; cash_opening?: number; cash_up_date?: string }
interface Closed { id: string; period_start: string; period_end: string; totals: Summary; expected_cash: number; counted_cash: number; variance: number; closed_by_name: string | null; written_off?: boolean }
interface Balance { staff_id: string; name: string; earned: number; paid: number; remaining: number }
const MONEY = /^\d+(\.\d{1,2})?$/;

const R = (n: number | string | undefined) => `R${Number(n ?? 0).toFixed(2)}`;
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });

export function CashUp({ clubId, token = null, tipsEnabled }: { clubId: string; token?: string | null; tipsEnabled: boolean }) {
  const qc = useQueryClient();
  const isSuperAdmin = useIsSuperAdmin();
  const [manageHistory, setManageHistory] = useState(false);
  const [counted, setCounted] = useState("");
  const [card, setCard] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<Record<string, string>>({});
  const [writeOff, setWriteOff] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const preview = useQuery({ queryKey: ["bar-cash-up", clubId, token], refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_cash_up_preview" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return data as unknown as Summary;
  }});
  const staff = useQuery({ queryKey: ["bar-staff-tips", clubId, token], enabled: tipsEnabled, refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_staff_tip_balances" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return (data ?? []) as unknown as Balance[];
  }});
  const history = useQuery({ queryKey: ["bar-cash-up-history", clubId, token], queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_cash_up_history" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return (data ?? []) as unknown as Closed[];
  }});
  const s = preview.data;
  const owed = (staff.data ?? []).filter(b => Number(b.remaining) > 0);
  const payFor = (b: Balance) => payouts[b.staff_id] ?? "0";
  const payoutsValid = owed.every(b => validTipPayout(payFor(b), Number(b.remaining), true));
  const newTips = owed.reduce((t, b) => t + (MONEY.test(payFor(b)) ? Number(payFor(b)) : 0), 0);
  const m = (k: string) => s?.methods?.[k] ?? { sales: 0, tips: 0, count: 0 };
  const gross = (k: string) => Number(m(k).sales) + Number(m(k).tips);
  const tipsOut = Number(s?.tip_payouts ?? 0) + newTips;
  const cardShould = gross("card_bar");
  const opening = Number(s?.cash_opening ?? 0);
  const cashShould = opening + gross("cash") - tipsOut;
  const cardActual = card ?? cardShould.toFixed(2);
  const valid = MONEY.test(counted) && MONEY.test(cardActual) && payoutsValid;
  const vCash = MONEY.test(counted) ? Number(counted) - cashShould : null;
  const vCard = MONEY.test(cardActual) ? Number(cardActual) - cardShould : 0;
  const variance = vCash === null ? null : Math.round((vCash + vCard) * 100) / 100;

  async function close() {
    if (!s || !valid) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_cash_up_close_v2" as any, {
        _club_id: clubId, _period_start: s.period_start,
        _tip_payouts: owed.map(b => ({ staff_id: b.staff_id, amount: Number(payFor(b)) })).filter(x => x.amount > 0),
        _card_counted: Number(cardActual), _counted_cash: Number(counted), _write_off: writeOff && variance !== 0,
        _note: note, _request_id: requestId, _token: token,
      });
      if (error) throw error;
      toast.success("Cash-up completed — a new shift has started");
      setCounted(""); setNote(""); setCard(null); setPayouts({}); setWriteOff(false); setRequestId(crypto.randomUUID());
      await Promise.all(["bar-cash-up", "bar-cash-up-history", "bar-staff-tips", "income-statement"].map(k => qc.invalidateQueries({ queryKey: [k] })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not complete cash-up"); }
    finally { setBusy(false); }
  }

  const row = (label: string, k: string, out: number, should: number, actual: React.ReactNode) =>
    <tr key={k} className="border-b"><td className="py-1">{label} <span className="text-muted-foreground">({m(k).count})</span></td>
      <td className="text-right tabular-nums">{R(m(k).sales)}</td><td className="text-right tabular-nums">{R(m(k).tips)}</td>
      <td className="text-right tabular-nums">{out ? R(out) : "—"}</td><td className="text-right tabular-nums font-medium">{R(should)}</td>
      <td className="text-right pl-2">{actual}</td></tr>;

  return <div className="space-y-5 text-xs">
    {preview.isLoading ? <p className="text-muted-foreground">Loading…</p> : preview.error ? <p role="alert" className="text-destructive">{(preview.error as Error).message || "Could not load cash-up."}</p> : s && <section className="space-y-3" aria-label="Current shift">
      <p className="text-muted-foreground">Shift from <strong>{when(s.period_start)}</strong> to now. Everything after this cash-up falls into the next shift.</p>

      {tipsEnabled && owed.length > 0 && <div className="rounded-md border p-3 space-y-2">
        <h4 className="font-semibold">1. Tips to pay out in cash now</h4>
        <p className="text-muted-foreground">Starts at 0 — enter only the tips taken in cash now. Anything left stays owed to the staff member.</p>
        {owed.map(b => <div key={b.staff_id} className="grid grid-cols-[1fr_auto_7rem] items-center gap-2">
          <span>{b.name}</span><span className="text-muted-foreground tabular-nums">owed {R(b.remaining)}</span>
          <Input aria-label={`Tips paid to ${b.name}`} inputMode="decimal" className="h-8 text-right" value={payFor(b)} disabled={busy}
            onChange={e => { const value = e.target.value; if (isTipPayoutInput(value)) setPayouts(p => ({ ...p, [b.staff_id]: value })); }} />
        </div>)}
        {!payoutsValid && <p className="text-destructive">Enter a positive amount no greater than the tips owed, or 0 for no payout.</p>}
      </div>}

      <div className="overflow-x-auto"><h4 className="font-semibold mb-1">{tipsEnabled && owed.length > 0 ? "2. " : ""}Reconciliation</h4>
      <table className="w-full"><thead><tr className="border-b"><th className="text-left py-1">Payment type</th><th className="text-right">Sales</th><th className="text-right">Tips</th><th className="text-right">Tips paid in cash</th><th className="text-right">Should be</th><th className="text-right pl-2">Actual</th></tr></thead>
        <tbody>
          {row("Online card (paid online)", "online", 0, gross("online"), <span className="tabular-nums">{R(gross("online"))}</span>)}
          {row("Card swiped at the bar", "card_bar", 0, cardShould, <Input aria-label="Actual card at the bar" inputMode="decimal" className="h-8 w-28 ml-auto text-right" value={cardActual} disabled={busy} onChange={e => setCard(e.target.value)} />)}
          {row("Cash", "cash", tipsOut, cashShould, <Input aria-label="Cash counted" inputMode="decimal" placeholder="Count" className="h-8 w-28 ml-auto text-right" value={counted} disabled={busy} onChange={e => setCounted(e.target.value)} />)}
          {row("Member account", "member_account", 0, gross("member_account"), <span className="tabular-nums">{R(gross("member_account"))}</span>)}
          <tr className="font-semibold"><td className="py-1">Total</td><td className="text-right tabular-nums">{R(s.total_sales)}</td><td className="text-right tabular-nums">{R(s.total_tips)}</td><td className="text-right tabular-nums">{tipsOut ? R(tipsOut) : "—"}</td>
            <td className="text-right tabular-nums">{R(gross("online") + cardShould + cashShould + gross("member_account"))}</td>
            <td className="text-right tabular-nums pl-2">{MONEY.test(counted) && MONEY.test(cardActual) ? R(gross("online") + Number(cardActual) + Number(counted) + gross("member_account")) : "—"}</td></tr>
        </tbody></table></div>

      <div className="rounded-md border p-3 space-y-1 max-w-sm" aria-label="Cash balance">
        <h4 className="font-semibold">Cash balance</h4>
        <div className="flex justify-between"><span>Opening balance</span><span className="tabular-nums">{R(opening)}</span></div>
        <div className="flex justify-between"><span>+ New cash sales{tipsEnabled ? " & tips" : ""}</span><span className="tabular-nums">{R(gross("cash"))}</span></div>
        <div className="flex justify-between"><span>− Tips paid out</span><span className="tabular-nums">{R(tipsOut)}</span></div>
        <div className="flex justify-between font-semibold border-t pt-1"><span>New balance (should be in the till)</span><span className="tabular-nums">{R(cashShould)}</span></div>
        <p className="text-muted-foreground">Any difference must be cleared by an admin — record it below or enter a transaction.</p>
      </div>

      <div className="rounded-md border p-3 space-y-2">
        {variance !== null && <p className={variance === 0 ? "text-muted-foreground" : "text-destructive font-medium"}>{variance === 0 ? "Everything balances." : `${variance > 0 ? "Surplus" : "Shortfall"} of ${R(Math.abs(variance))}`}</p>}
        {variance !== null && variance !== 0 && <label className="flex items-start gap-2">
          <Checkbox checked={writeOff} onCheckedChange={v => setWriteOff(v === true)} disabled={busy} />
          <span>Record the {variance > 0 ? "surplus" : "shortfall"} against bar cost of sales {variance > 0 ? "(reduces cost of sales)" : "(adds to cost of sales)"}</span>
        </label>}
        <Label htmlFor="cash-note">Note (optional)</Label>
        <Input id="cash-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} disabled={busy} />
        <Button onClick={close} disabled={busy || !valid}>Complete cash-up</Button>
      </div>
    </section>}
    <section className="space-y-2" aria-label="Previous cash-ups"><h3 className="text-sm font-semibold">Previous cash-ups</h3>
      {isSuperAdmin && <Button size="sm" variant="outline" onClick={() => setManageHistory(v => !v)} aria-expanded={manageHistory}>View / edit cash-ups</Button>}
      {isSuperAdmin && manageHistory && <CashUpsReport clubId={clubId} />}
      {!history.data?.length ? <p className="text-muted-foreground">None yet.</p> : <table className="w-full"><thead><tr className="border-b"><th className="text-left py-1">Shift</th><th className="text-right">Sales</th><th className="text-right">Tips paid</th><th className="text-right">Expected cash</th><th className="text-right">Counted</th><th className="text-right">Difference</th></tr></thead>
        <tbody>{history.data.map(h => <tr key={h.id} className="border-b"><td className="py-1">{cashUpDateLabel(h.totals?.cash_up_date) && <div className="font-semibold">{cashUpDateLabel(h.totals?.cash_up_date)}</div>}{when(h.period_start)} → {when(h.period_end)}{h.closed_by_name ? ` · ${h.closed_by_name}` : ""}</td><td className="text-right tabular-nums">{R(h.totals?.total_sales)}</td><td className="text-right tabular-nums">{R(h.totals?.tip_payouts)}</td><td className="text-right tabular-nums">{R(h.expected_cash)}</td><td className="text-right tabular-nums">{R(h.counted_cash)}</td><td className={`text-right tabular-nums ${Number(h.variance) ? "text-destructive" : ""}`}>{R(h.variance)}{h.written_off ? Number(h.variance) > 0 ? " · surplus recorded" : Number(h.variance) < 0 ? " · shortfall recorded" : " · reconciled" : ""}</td></tr>)}</tbody></table>}
    </section>
  </div>;
}
