import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberSearchPicker, type PickedMember } from "./MemberSearchPicker";
import { transferProblem } from "@/lib/finance/manual-journal";

export const CREDIT_TRANSFER_KEYS = ["member-credit-transfers", "member-transferable-credit"];

/**
 * Start a credit transfer from one member to another. The receiver must accept before any credit moves.
 * `from` is the sender; when `chooseSender` is set (admin on a member's behalf) the sender is picked here.
 */
export function CreditTransferDialog({ clubId, open, onOpenChange, from, chooseSender = false, money }: {
  clubId: string; open: boolean; onOpenChange: (v: boolean) => void;
  from?: PickedMember | null; chooseSender?: boolean; money: (n: number) => string;
}) {
  const qc = useQueryClient();
  const [sender, setSender] = useState<PickedMember | null>(from ?? null);
  const [to, setTo] = useState<PickedMember | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setSender(from ?? null); setTo(null); setAmount(""); setNote(""); } }, [open, from]);

  const { data: available = 0, isLoading } = useQuery({
    queryKey: ["member-transferable-credit", clubId, sender?.id],
    enabled: open && !!sender?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("member_transferable_credit", { _club_id: clubId, _member_id: sender!.id });
      if (error) throw error;
      return Number(data || 0);
    },
  });
  const problem = sender ? transferProblem(amount, available) : "Choose who sends the credit";

  const submit = async () => {
    if (!sender || !to || problem) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("request_member_credit_transfer", {
        _club_id: clubId, _from_member_id: sender.id, _to_member_id: to.id, _amount: Number(amount), _note: note.trim() || null,
      });
      if (error) throw error;
      toast.success(`Transfer sent — ${to.name} needs to accept it`);
      CREDIT_TRANSFER_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not start the transfer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer credit</DialogTitle>
          <DialogDescription className="text-xs">
            The other member gets a notice and must accept. Nothing moves until they do, and pending transfers expire after 14 days.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {chooseSender && (
            <div className="space-y-1">
              <Label className="text-xs">From member</Label>
              <MemberSearchPicker clubId={clubId} value={sender} onChange={setSender} />
            </div>
          )}
          {sender && (
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Checking available credit…" : <>Available to transfer: <b className="text-foreground">{money(available)}</b></>}
            </p>
          )}
          <div className="space-y-1">
            <Label className="text-xs">To member</Label>
            <MemberSearchPicker clubId={clubId} value={to} onChange={setTo} excludeId={sender?.id} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. For the doubles entry" className="h-9 text-xs" />
          </div>
          {amount.trim() && problem && <p className="text-[11px] text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !to || !!problem}>{saving ? "Sending…" : "Send transfer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
