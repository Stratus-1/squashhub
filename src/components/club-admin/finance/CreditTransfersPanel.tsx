import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeftRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditTransferDialog, CREDIT_TRANSFER_KEYS } from "@/components/finance/CreditTransferDialog";
import { listCreditTransfers, TRANSFER_STATUS_LABEL, type CreditTransfer } from "@/components/finance/creditTransfers";

/** Finance > Credit transfers: every member-to-member transfer, plus starting one on a member's behalf. */
export function CreditTransfersPanel({ clubId, readOnly, money }: { clubId: string; readOnly?: boolean; money: (n: number) => string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | CreditTransfer["status"]>("all");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["member-credit-transfers", clubId, "club"],
    queryFn: () => listCreditTransfers(clubId, "club"),
  });
  const shown = status === "all" ? rows : rows.filter((r) => r.status === status);

  const cancel = async (t: CreditTransfer) => {
    setBusy(t.id);
    const { error } = await (supabase as any).rpc("cancel_member_credit_transfer", { _transfer_id: t.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Transfer cancelled");
    CREDIT_TRANSFER_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Credit transfers</h3>
          <Badge variant="outline" className="text-[10px]">{rows.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {(Object.keys(TRANSFER_STATUS_LABEL) as CreditTransfer["status"][]).map((s) => (
                <SelectItem key={s} value={s}>{TRANSFER_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" disabled={readOnly} onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />Transfer for a member
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Credit moves from one member's account to another only when the receiving member accepts. No income, expense or bank movement.
      </p>
      <div className="divide-y rounded-md border">
        {shown.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate"><b>{t.from_name}</b> → <b>{t.to_name}</b>{t.note ? <span className="text-muted-foreground"> · {t.note}</span> : null}</span>
            <span className="tabular-nums font-semibold">{money(t.amount)}</span>
            <span className="text-muted-foreground">{format(new Date(t.created_at), "d MMM yyyy")}{t.requested_as === "admin" ? " · by treasurer" : ""}</span>
            <Badge variant={t.status === "pending" ? "default" : "outline"} className="text-[10px]">{TRANSFER_STATUS_LABEL[t.status]}</Badge>
            {t.status === "pending" && !readOnly && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === t.id} onClick={() => cancel(t)}>Cancel</Button>
            )}
          </div>
        ))}
        {!isLoading && shown.length === 0 && <p className="px-3 py-3 text-xs text-muted-foreground">No transfers.</p>}
      </div>
      <CreditTransferDialog clubId={clubId} open={open} onOpenChange={setOpen} chooseSender money={money} />
    </Card>
  );
}
