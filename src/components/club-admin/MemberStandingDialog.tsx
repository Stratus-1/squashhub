import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export type MemberStanding = "active" | "suspended" | "resigned";

interface Props {
  memberId: string;
  memberName: string;
  hasEmail: boolean;
  target: MemberStanding;
  onClose: () => void;
  onDone: () => void;
}

const TITLES: Record<MemberStanding, string> = {
  suspended: "Suspend member",
  resigned: "Mark member as resigned",
  active: "Reinstate member",
};

export function MemberStandingDialog({ memberId, memberName, hasEmail, target, onClose, onDone }: Props) {
  const [rule, setRule] = useState("");
  const [reason, setReason] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const isSuspend = target === "suspended";
  const tomorrow = new Date(Date.now() + 86400000);
  const minDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  const submit = async () => {
    if (isSuspend && !reason.trim()) { toast.error("Please give a reason for the suspension"); return; }
    if (isSuspend && until && until < minDate) { toast.error("The end date must be in the future"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("set-member-standing", {
      body: { member_id: memberId, status: target, rule: rule.trim() || null, reason: reason.trim() || null, until: isSuspend && until ? until : null, send_email: isSuspend && sendEmail },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Could not update member");
      return;
    }
    const email = (data as any)?.email;
    const emailNote = !isSuspend ? "" : email === "sent" ? " — suspension letter emailed" : email === "no_email" ? " — no email address on file, letter not sent" : email === "failed" || email === "suppressed" ? " — the letter could not be emailed" : "";
    toast.success(`${memberName}: ${target === "active" ? "reinstated" : target}${emailNote}`);
    onDone();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[target]}: {memberName}</DialogTitle>
          <DialogDescription>
            {isSuspend
              ? "The member can still sign in, but cannot book courts or open the door until reinstated."
              : target === "resigned"
                ? "Resigned members can no longer book courts or open the door."
                : "Restores normal bookings and door access."}
          </DialogDescription>
        </DialogHeader>
        {target !== "active" && (
          <div className="space-y-3">
            {isSuspend && (
              <div className="space-y-1">
                <Label className="text-xs">Club rule / constitution clause</Label>
                <Input value={rule} onChange={(e) => setRule(e.target.value)} placeholder="e.g. Rule 7.3" maxLength={200} />
              </div>
            )}
            {isSuspend && (
              <div className="space-y-1">
                <Label className="text-xs">Suspended until (optional)</Label>
                <Input type="date" value={until} min={minDate} onChange={(e) => setUntil(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  {until ? "Membership is reinstated automatically on this date." : "Leave empty to suspend until an admin reinstates the member."}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Reason{isSuspend ? " (included in the letter)" : " (optional)"}</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000}
                placeholder={isSuspend ? "e.g. Brought visitors onto the courts without declaring or paying the visitor fee." : ""} />
            </div>
            {isSuspend && (
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={sendEmail && hasEmail} disabled={!hasEmail} onCheckedChange={(v) => setSendEmail(!!v)} />
                {hasEmail ? "Email the suspension letter to the member" : "No email address on file — letter can't be emailed"}
              </label>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} variant={isSuspend ? "destructive" : "default"}>
            {busy ? "Saving…" : TITLES[target]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
