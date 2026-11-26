import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditTransferDialog, CREDIT_TRANSFER_KEYS } from "./CreditTransferDialog";
import { listCreditTransfers, TRANSFER_STATUS_LABEL, type CreditTransfer } from "./creditTransfers";

/** My Account: transfers waiting for this member, their own pending transfers, and "Transfer credit". */
export function MemberCreditTransfersCard({ clubId, memberId, memberName, money, canTransfer = true }: {
  clubId: string; memberId: string; memberName: string; money: (n: number) => string; canTransfer?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["member-credit-transfers", clubId, "mine"],
    enabled: !!clubId,
    queryFn: () => listCreditTransfers(clubId, "mine"),
  });
  const mine = rows.filter((r) => r.from_member_id === memberId || r.to_member_id === memberId);
  const incoming = mine.filter((r) => r.status === "pending" && r.to_member_id === memberId);
  const outgoing = mine.filter((r) => r.status === "pending" && r.from_member_id === memberId);
  const history = mine.filter((r) => r.status !== "pending").slice(0, 10);

  const refresh = () => {
    [...CREDIT_TRANSFER_KEYS, "member-journal-entries", "member-account-balance", "account-journal", "my-account-journal"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }));
    qc.invalidateQueries();
  };
  const run = async (id: string, fn: () => Promise<{ error: any; data?: any }>, ok: string) => {
    setBusy(id);
    try {
      const { error, data } = await fn();
      if (error) throw error;
      if (data && data.ok === false && data.status === "expired") toast.error("This transfer has expired");
      else toast.success(ok);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  const cancel = (t: CreditTransfer) =>
    run(t.id, () => (supabase as any).rpc("cancel_member_credit_transfer", { _transfer_id: t.id }), "Transfer cancelled");

  if (!canTransfer && incoming.length === 0 && outgoing.length === 0) return null;

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Credit transfers</p>
        </div>
        {canTransfer && (
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>Transfer credit</Button>
        )}
      </div>

      {incoming.map((t) => (
        <div key={t.id} className="rounded-md border border-primary/40 bg-primary/5 p-2.5 space-y-2">
          <p className="text-xs">
            Older transfer from <b>{t.from_name}</b>: <b>{money(t.amount)}</b>.
            {t.note ? <span className="text-muted-foreground"> “{t.note}”</span> : null}
          </p>
          <p className="text-[11px] text-muted-foreground">Not completed. Ask the sender to cancel and resend for an immediate transfer.</p>
        </div>
      ))}

      {outgoing.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-xs">
          <span>Older incomplete transfer to <b>{t.to_name}</b> · <b>{money(t.amount)}</b>. Cancel and resend.</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === t.id} onClick={() => cancel(t)}>Cancel</Button>
        </div>
      ))}

      {incoming.length === 0 && outgoing.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Send available account credit to your children or another club member. It reflects immediately.</p>
      )}

      {history.length > 0 && (
        <div>
          <Button variant="link" className="h-auto p-0 text-[11px]" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide" : "Show"} recent transfers
          </Button>
          {showHistory && (
            <div className="mt-1 space-y-1">
              {history.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate">
                    {t.from_member_id === memberId ? `To ${t.to_name}` : `From ${t.from_name}`} · {money(t.amount)}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{TRANSFER_STATUS_LABEL[t.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <CreditTransferDialog clubId={clubId} open={open} onOpenChange={setOpen} from={{ id: memberId, name: memberName }} money={money} />
    </Card>
  );
}
