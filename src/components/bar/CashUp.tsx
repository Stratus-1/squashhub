import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { StaffTips } from "./StaffTips";

interface MethodTotal { sales: number; tips: number; count: number }
interface Summary { period_start: string; period_end: string; methods: Record<string, MethodTotal>; total_sales: number; total_tips: number; tip_payouts: number; expected_cash: number }
interface Closed { id: string; period_start: string; period_end: string; totals: Summary; expected_cash: number; counted_cash: number; variance: number; closed_by_name: string | null }

const LABELS: [string, string][] = [["online", "Online card (paid online)"], ["card_bar", "Card swiped at the bar"], ["cash", "Cash"], ["member_account", "Member account"]];
const R = (n: number | string | undefined) => `R${Number(n ?? 0).toFixed(2)}`;
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });

export function CashUp({ clubId, token = null, tipsEnabled }: { clubId: string; token?: string | null; tipsEnabled: boolean }) {
  const qc = useQueryClient();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const preview = useQuery({ queryKey: ["bar-cash-up", clubId, token], refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_cash_up_preview" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return data as unknown as Summary;
  }});
  const history = useQuery({ queryKey: ["bar-cash-up-history", clubId, token], queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_cash_up_history" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return (data ?? []) as unknown as Closed[];
  }});
  const s = preview.data;
  const valid = /^\d+(\.\d{1,2})?$/.test(counted);
  const variance = valid && s ? Number(counted) - Number(s.expected_cash) : null;

  async function close() {
    if (!s || !valid) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_cash_up_close" as any, { _club_id: clubId, _period_start: s.period_start, _counted_cash: Number(counted), _note: note, _request_id: requestId, _token: token });
      if (error) throw error;
      toast.success("Cash-up completed — a new shift has started");
      setCounted(""); setNote("");
      await qc.invalidateQueries({ queryKey: ["bar-cash-up"] });
      await qc.invalidateQueries({ queryKey: ["bar-cash-up-history"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not complete cash-up"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5 text-xs">
    {preview.isLoading ? <p className="text-muted-foreground">Loading…</p> : preview.error ? <p role="alert" className="text-destructive">{(preview.error as Error).message || "Could not load cash-up."}</p> : s && <section className="space-y-3" aria-label="Current shift">
      <p className="text-muted-foreground">Shift from <strong>{when(s.period_start)}</strong> to now. Everything after this cash-up falls into the next shift.</p>
      <table className="w-full"><thead><tr className="border-b"><th className="text-left py-1">Payment type</th><th className="text-right">Sales</th><th className="text-right">Tips</th><th className="text-right">Total</th></tr></thead>
        <tbody>{LABELS.map(([k, label]) => { const m = s.methods?.[k] ?? { sales: 0, tips: 0, count: 0 }; return <tr key={k} className="border-b"><td className="py-1">{label} <span className="text-muted-foreground">({m.count})</span></td><td className="text-right tabular-nums">{R(m.sales)}</td><td className="text-right tabular-nums">{R(m.tips)}</td><td className="text-right tabular-nums font-medium">{R(Number(m.sales) + Number(m.tips))}</td></tr>; })}
          <tr className="font-semibold"><td className="py-1">Total</td><td className="text-right tabular-nums">{R(s.total_sales)}</td><td className="text-right tabular-nums">{R(s.total_tips)}</td><td className="text-right tabular-nums">{R(Number(s.total_sales) + Number(s.total_tips))}</td></tr></tbody></table>
      <div className="rounded-md border p-3 space-y-2">
        <h4 className="font-semibold">Reconciliation</h4>
        <div className="grid grid-cols-2 gap-1"><span>Online card</span><span className="text-right tabular-nums">{R(Number(s.methods?.online?.sales ?? 0) + Number(s.methods?.online?.tips ?? 0))}</span>
          <span>Card at the bar</span><span className="text-right tabular-nums">{R(Number(s.methods?.card_bar?.sales ?? 0) + Number(s.methods?.card_bar?.tips ?? 0))}</span>
          <span>Member account</span><span className="text-right tabular-nums">{R(Number(s.methods?.member_account?.sales ?? 0) + Number(s.methods?.member_account?.tips ?? 0))}</span>
          <span>Cash tips paid out this shift</span><span className="text-right tabular-nums">−{R(s.tip_payouts)}</span>
          <span className="font-semibold">Expected cash in drawer</span><span className="text-right tabular-nums font-semibold">{R(s.expected_cash)}</span></div>
        <Label htmlFor="cash-counted">Cash counted (R)</Label>
        <Input id="cash-counted" inputMode="decimal" value={counted} onChange={e => setCounted(e.target.value)} disabled={busy} />
        {variance !== null && <p className={variance === 0 ? "text-muted-foreground" : "text-destructive font-medium"}>{variance === 0 ? "Cash balances." : `${variance > 0 ? "Over" : "Short"} by ${R(Math.abs(variance))}`}</p>}
        <Label htmlFor="cash-note">Note (optional)</Label>
        <Input id="cash-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} disabled={busy} />
        <Button onClick={close} disabled={busy || !valid}>Complete cash-up</Button>
      </div>
    </section>}
    {tipsEnabled && <StaffTips clubId={clubId} token={token} />}
    <section className="space-y-2" aria-label="Previous cash-ups"><h3 className="text-sm font-semibold">Previous cash-ups</h3>
      {!history.data?.length ? <p className="text-muted-foreground">None yet.</p> : <table className="w-full"><thead><tr className="border-b"><th className="text-left py-1">Shift</th><th className="text-right">Sales</th><th className="text-right">Expected cash</th><th className="text-right">Counted</th><th className="text-right">Variance</th></tr></thead>
        <tbody>{history.data.map(h => <tr key={h.id} className="border-b"><td className="py-1">{when(h.period_start)} → {when(h.period_end)}{h.closed_by_name ? ` · ${h.closed_by_name}` : ""}</td><td className="text-right tabular-nums">{R(h.totals?.total_sales)}</td><td className="text-right tabular-nums">{R(h.expected_cash)}</td><td className="text-right tabular-nums">{R(h.counted_cash)}</td><td className={`text-right tabular-nums ${Number(h.variance) ? "text-destructive" : ""}`}>{R(h.variance)}</td></tr>)}</tbody></table>}
    </section>
  </div>;
}
