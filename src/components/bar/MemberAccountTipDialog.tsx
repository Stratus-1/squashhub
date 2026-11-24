import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TipEditor } from "./TipEditor";
import { initialMemberTip, memberSettlementTip, type ServingPerson } from "@/lib/bar/member-settlement-tip";
import { emptyTip, type TipChoice } from "@/lib/bar/tips";
import { useAccountChargePreview } from "@/hooks/use-account-charge-preview";
import { EARLY_ACCOUNT_WARNING } from "@/lib/account-charge-gate";

export function MemberAccountTipDialog({ subtotal, staff, busy, onClose, onConfirm, memberId, accountLines = [], paymentError }: {
  subtotal: number; staff: ServingPerson[]; busy: boolean; onClose: () => void;
  onConfirm: (choice: TipChoice) => Promise<void>;
  memberId?: string; accountLines?: { division?: string | null; total: number }[]; paymentError?: string;
}) {
  const [choice, setChoice] = useState(() => initialMemberTip(staff));
  let error = "";
  let tip = 0;
  try { tip = memberSettlementTip(subtotal, choice, staff).tip; }
  catch (e) { error = e instanceof Error ? e.message : "Invalid tip"; }
  const baseGate = useAccountChargePreview(memberId, accountLines);
  const tipGate = useAccountChargePreview(memberId, [...accountLines, { total: tip, division: accountLines[0]?.division }]);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto" onInteractOutside={e => { if (busy) e.preventDefault(); }}>
      <DialogHeader>
        <DialogTitle>Do you want to add a tip?</DialogTitle>
        <DialogDescription>Add to my member account</DialogDescription>
      </DialogHeader>
      {staff.length > 0 ? <TipEditor subtotal={subtotal} choice={choice} onChange={setChoice} staff={staff} fixedStaff={staff.length === 1} disabled={busy} />
        : <p className="text-sm text-muted-foreground">No serving person is signed in at the bar.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {(baseGate.blocked || tipGate.blocked || paymentError) && <p role="alert" className="rounded-md border border-destructive p-3 text-sm font-medium text-destructive">{paymentError || EARLY_ACCOUNT_WARNING}</p>}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={busy || baseGate.blocked} onClick={() => onConfirm(emptyTip)}>No tip — add to account</Button>
        {choice.mode !== "none" && <Button disabled={busy || Boolean(error) || tipGate.blocked} onClick={() => onConfirm(choice)}>Add tip &amp; charge account</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}