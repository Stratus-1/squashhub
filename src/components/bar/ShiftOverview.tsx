import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

interface M { sales: number; tips: number; count: number }
export interface ShiftData {
  period_start: string; methods: Record<string, M>; total_sales: number; total_tips: number; tip_payouts: number; expected_cash: number; cash_opening?: number;
  tabs: { id: string; name: string; method: string | null; operator: string | null; at: string; sales: number; tip: number }[];
  staff_tips: { name: string; amount: number }[];
}
const R = (n: number | string | undefined) => `R${Number(n ?? 0).toFixed(2)}`;
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
const METHOD: Record<string, string> = { terminal: "Card at bar", card: "Online card", online: "Online card", cash: "Cash", member_account: "Member account" };
const ROWS: [string, string][] = [["card_bar", "Card at the club"], ["online", "Online card"], ["member_account", "Member account"], ["cash", "Cash"]];

export function useShiftOverview(clubId: string | undefined, token: string | null) {
  return useQuery({ queryKey: ["bar-shift-overview", clubId, token], enabled: Boolean(clubId), refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_shift_overview" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return data as unknown as ShiftData;
  }});
}

export function ShiftSummary({ data, tipsEnabled }: { data?: ShiftData; tipsEnabled: boolean }) {
  if (!data) return null;
  return <Card className="p-3 space-y-3 text-xs" aria-label="Running totals">
    <div><h2 className="text-sm font-semibold">Since last cash-up</h2><p className="text-muted-foreground">From {when(data.period_start)}</p></div>
    <div className="space-y-1">{ROWS.map(([k, label]) => { const m = data.methods?.[k]; return <div key={k} className="flex justify-between"><span>{label}</span><span className="tabular-nums">{R(m?.sales)}</span></div>; })}
      <div className="flex justify-between border-t pt-1 font-semibold"><span>Total sales</span><span className="tabular-nums">{R(data.total_sales)}</span></div></div>
    {tipsEnabled && <div className="space-y-1"><div className="flex justify-between font-semibold"><span>Tips</span><span className="tabular-nums">{R(data.total_tips)}</span></div>
      {data.staff_tips.map(s => <div key={s.name} className="flex justify-between text-muted-foreground"><span>{s.name}</span><span className="tabular-nums">{R(s.amount)}</span></div>)}
      {!data.staff_tips.length && <p className="text-muted-foreground">No tips yet.</p>}</div>}
    <div className="space-y-1 border-t pt-1" aria-label="Cash balance">
      <div className="flex justify-between"><span>Opening cash</span><span className="tabular-nums">{R(data.cash_opening)}</span></div>
      <div className="flex justify-between"><span>+ Cash sales{tipsEnabled ? " & tips" : ""}</span><span className="tabular-nums">{R(Number(data.methods?.cash?.sales ?? 0) + Number(data.methods?.cash?.tips ?? 0))}</span></div>
      {tipsEnabled && <div className="flex justify-between"><span>− Tips paid out</span><span className="tabular-nums">{R(data.tip_payouts)}</span></div>}
      <div className="flex justify-between font-semibold"><span>Current cash balance</span><span className="tabular-nums">{R(data.expected_cash)}</span></div>
    </div>
  </Card>;
}

export function ShiftTabs({ data, loading }: { data?: ShiftData; loading: boolean }) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (!data?.tabs.length) return <Card className="p-6 text-center text-xs text-muted-foreground">No paid tabs since the last cash-up.</Card>;
  return <Card className="p-0 overflow-x-auto"><table className="w-full text-xs">
    <thead><tr className="border-b"><th className="text-left p-2">Time</th><th className="text-left">Tab</th><th className="text-left">Paid by</th><th className="text-left">Served by</th><th className="text-right">Sales</th><th className="text-right">Tip</th><th className="text-right p-2">Total</th></tr></thead>
    <tbody>{data.tabs.map(t => <tr key={t.id} className="border-b"><td className="p-2 whitespace-nowrap">{when(t.at)}</td><td>{t.name}</td><td>{METHOD[t.method ?? ""] ?? t.method}</td><td>{t.operator ?? "—"}</td><td className="text-right tabular-nums">{R(t.sales)}</td><td className="text-right tabular-nums">{R(t.tip)}</td><td className="text-right tabular-nums p-2 font-medium">{R(Number(t.sales) + Number(t.tip))}</td></tr>)}</tbody>
  </table></Card>;
}
