/** Move unpaid tips from one staff member to another (total tips unchanged, reason kept for audit). */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Person { id: string; name: string; remaining: number }

export function TipTransferDialog({ clubId, from, staff, onClose }: { clubId: string; from: Person | null; staff: Person[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [to, setTo] = useState(""); const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setTo(""); setAmount(""); setReason(""); }, [from?.id]);
  const max = Number(from?.remaining ?? 0);
  const n = Number(amount);
  const valid = Boolean(from && to && to !== from.id && /^\d+(\.\d{1,2})?$/.test(amount) && n > 0 && n <= max + 0.0001 && reason.trim());
  async function save() {
    if (!from || !valid) return; setBusy(true);
    try {
      const { error } = await supabase.rpc("bar_transfer_staff_tips" as any, { _club_id: clubId, _from: from.id, _to: to, _amount: n, _reason: reason.trim() });
      if (error) throw error;
      await Promise.all(["bar-staff-pay", "bar-staff-tips"].map(k => qc.invalidateQueries({ queryKey: [k] })));
      toast.success(`Moved R${n.toFixed(2)} tips`); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not move tips"); } finally { setBusy(false); }
  }
  return <Dialog open={Boolean(from)} onOpenChange={o => { if (!o && !busy) onClose(); }}>
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>Move tips · {from?.name}</DialogTitle><DialogDescription>Available to move: R{max.toFixed(2)}. Total tips stay the same.</DialogDescription></DialogHeader>
      <Label htmlFor="tip-to">To</Label>
      <select id="tip-to" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={to} onChange={e => setTo(e.target.value)}>
        <option value="">Choose staff member</option>
        {staff.filter(s => s.id !== from?.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <Label htmlFor="tip-amount">Amount (R)</Label>
      <Input id="tip-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
      <Label htmlFor="tip-reason">Reason</Label>
      <Input id="tip-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. shared tips 2 Nov" />
      <Button disabled={busy || !valid} onClick={save}>Move tips</Button>
    </DialogContent>
  </Dialog>;
}
