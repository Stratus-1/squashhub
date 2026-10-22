import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isTipPayoutInput, validTipPayout } from "@/lib/bar/tips";
interface Balance { staff_id: string; name: string; earned: number; paid: number; remaining: number }
export function StaffTips({ clubId, token = null }: { clubId: string; token?: string | null }) {
  const qc = useQueryClient();
  const [person, setPerson] = useState<Balance | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState("");
  const { data = [], isLoading, error } = useQuery({ queryKey: ["bar-staff-tips", clubId, token], refetchInterval: 30000, queryFn: async () => {
    const { data, error } = await supabase.rpc("bar_staff_tip_balances" as any, { _club_id: clubId, _token: token });
    if (error) throw error;
    return (data ?? []) as unknown as Balance[];
  }});
  async function pay() {
    if (!person || !validTipPayout(amount, Number(person.remaining))) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_pay_staff_tips" as any, { _club_id: clubId, _staff_id: person.staff_id, _amount: Number(amount), _request_id: requestId, _token: token });
      if (error) throw error;
      setPerson(null);
      await qc.invalidateQueries({ queryKey: ["bar-staff-tips"] });
      await qc.invalidateQueries({ queryKey: ["income-statement"] });
      toast.success("Cash tip payout recorded");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not record payout"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3" aria-label="Staff tips">
    <h3 className="text-sm font-semibold">Staff tips</h3>
    {isLoading ? <p className="text-muted-foreground text-xs">Loading…</p> : error ? <p role="alert" className="text-destructive text-xs">Could not load staff tips.</p> : <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="border-b"><th className="text-left py-2">Staff</th><th className="text-right">Earned</th><th className="text-right">Cash paid</th><th className="text-right">Unpaid</th><th /></tr></thead>
      <tbody>{data.map(row => <tr className="border-b" key={row.staff_id}><td className="py-2">{row.name}</td>{[row.earned, row.paid, row.remaining].map((n, i) => <td key={i} className="text-right tabular-nums px-1">R{Number(n).toFixed(2)}</td>)}<td className="text-right"><Button size="sm" variant="outline" disabled={Number(row.remaining) <= 0} onClick={() => { setPerson(row); setAmount(""); setRequestId(crypto.randomUUID()); }}>Pay cash</Button></td></tr>)}</tbody>
    </table>{!data.length && <p className="text-muted-foreground text-xs py-3">No staff tips recorded.</p>}</div>}
    <Dialog open={Boolean(person)} onOpenChange={open => { if (!busy && !open) setPerson(null); }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Cash tips — {person?.name}</DialogTitle><DialogDescription>Unpaid tips: R{Number(person?.remaining ?? 0).toFixed(2)}</DialogDescription></DialogHeader>
      <Label htmlFor="tip-cash-payout">Cash paid out (R)</Label><Input id="tip-cash-payout" inputMode="decimal" value={amount} onChange={e => { if (isTipPayoutInput(e.target.value)) setAmount(e.target.value); }} disabled={busy} />
      <Button onClick={pay} disabled={busy || !validTipPayout(amount, Number(person?.remaining ?? 0))}>Confirm cash handed over</Button>
    </DialogContent></Dialog>
  </section>;
}