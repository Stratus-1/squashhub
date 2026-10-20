import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TipEditor } from "./TipEditor";
import { initialMemberTip, memberSettlementTip, type ServingPerson } from "@/lib/bar/member-settlement-tip";
import { emptyTip, type TipChoice } from "@/lib/bar/tips";

export function MemberAccountTipDialog({ subtotal, staff, busy, onClose, onConfirm }: {
  subtotal: number; staff: ServingPerson[]; busy: boolean; onClose: () => void;
  onConfirm: (choice: TipChoice) => Promise<void>;
}) {
  const [choice, setChoice] = useState(() => initialMemberTip(staff));
  let error = "";
  try { memberSettlementTip(subtotal, choice, staff); }
  catch (e) { error = e instanceof Error ? e.message : "Invalid tip"; }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" onInteractOutside={e => { if (busy) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Do you want to add a tip?</DialogTitle>
        <DialogDescription>Add to my member account</DialogDescription>
      </DialogHeader>
      {staff.length > 0 ? <TipEditor subtotal={subtotal} choice={choice} onChange={setChoice} staff={staff} fixedStaff={staff.length === 1} disabled={busy} />
        : <p className="text-sm text-muted-foreground">No serving person is signed in at the bar.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy} onClick={() => onConfirm(emptyTip)}>No tip — add to account</Button>
        {choice.mode !== "none" && <Button disabled={busy || Boolean(error)} onClick={() => onConfirm(choice)}>Add tip &amp; charge account</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}