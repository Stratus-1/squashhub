/**
 * Actionable "EFT approvals outstanding" card for finance staff (club admins or
 * members holding the club-scoped `finance` permission).
 *
 * Shows the oldest pending payment (member, amount, reference, date) with:
 *  - Approve            → explicit confirmation, then the shared server action
 *                         `finance_decide_member_transaction` (permission check,
 *                         row lock, pending-only, audit row, same bookkeeping).
 *  - Keep for later     → hides the card for that payment on this device; it stays pending.
 *  - View pending approvals → Club Books → Pending with that payment highlighted.
 * Members without finance rights never see it; the server re-checks every approval.
 */

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useHasPermission } from "@/hooks/use-club-permissions";
import { Button } from "@/components/ui/button";

const TOAST_ID = "pending-eft-approvals";
const SNOOZE_KEY = (clubId: string) => `sh.eft-snoozed.${clubId}`;

type PendingTx = {
  id: string;
  amount: number;
  method: string | null;
  reference: string | null;
  description: string | null;
  created_at: string;
  club_member_id: string | null;
  memberName: string;
};

function readSnoozed(clubId: string): string[] {
  try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY(clubId)) || "[]"); } catch { return []; }
}
function snooze(clubId: string, id: string) {
  try { sessionStorage.setItem(SNOOZE_KEY(clubId), JSON.stringify([...readSnoozed(clubId), id])); } catch { /* ignore */ }
}

export const rand = (n: number) => `R${Math.abs(Number(n || 0)).toFixed(2)}`;

function ApprovalCard({ tx, total, onApprove, onLater, onView }: {
  tx: PendingTx; total: number;
  onApprove: () => Promise<void>; onLater: () => void; onView: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div role="alertdialog" aria-label="Payment waiting for approval"
      className="w-[min(92vw,380px)] rounded-xl border border-border bg-card text-card-foreground shadow-lg p-3 space-y-2 text-[13px]">
      <div className="font-semibold">
        {total === 1 ? "1 payment is waiting for your approval" : `${total} payments are waiting for your approval`}
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Member</dt><dd className="font-medium">{tx.memberName}</dd>
        <dt className="text-muted-foreground">Amount</dt><dd className="font-medium">{rand(tx.amount)} via {(tx.method || "eft").toUpperCase()}</dd>
        <dt className="text-muted-foreground">Reference</dt><dd>{tx.reference || tx.description || "—"}</dd>
        <dt className="text-muted-foreground">Submitted</dt><dd>{format(new Date(tx.created_at), "dd MMM yyyy HH:mm")}</dd>
      </dl>
      {confirming ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-2">
          <p className="text-xs">
            Approve {rand(tx.amount)} from {tx.memberName}? This records the money as received in Club Books.
            SquashHub has <strong>not</strong> checked your bank account — only approve if you have seen this deposit.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await onApprove(); } finally { setBusy(false); } }}>
              {busy ? "Approving…" : "Yes, approve"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setConfirming(true)}>Approve</Button>
          <Button size="sm" variant="outline" onClick={onLater}>Keep for later</Button>
          <Button size="sm" variant="ghost" onClick={onView}>View pending approvals</Button>
        </div>
      )}
    </div>
  );
}

export function usePendingEftApprovalToast(clubId?: string | null) {
  const canSeeFinance = useHasPermission("finance");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [snoozeTick, setSnoozeTick] = useState(0);

  const { data: pending = [] } = useQuery({
    queryKey: ["pending-eft-approval-count", clubId],
    queryFn: async (): Promise<PendingTx[]> => {
      const { data, error } = await (supabase as any)
        .from("member_credit_transactions")
        .select("id, amount, method, reference, description, created_at, club_member_id")
        .eq("club_id", clubId!)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set((data || []).map((t: any) => t.club_member_id).filter(Boolean))];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ms } = await (supabase as any).from("club_members").select("id, name").in("id", ids);
        (ms || []).forEach((m: any) => names.set(m.id, m.name));
      }
      return (data || []).map((t: any) => ({ ...t, memberName: names.get(t.club_member_id) || "A member" }));
    },
    enabled: !!clubId && canSeeFinance,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!clubId || !canSeeFinance) return;
    const snoozed = readSnoozed(clubId);
    const next = pending.find((t) => !snoozed.includes(t.id));
    if (!next) { toast.dismiss(TOAST_ID); return; }

    const approve = async () => {
      const { data, error } = await (supabase as any).rpc("finance_decide_member_transaction", {
        _tx_id: next.id, _approve: true,
      });
      if (error) { toast.error(error.message || "Could not approve the payment"); return; }
      toast.dismiss(TOAST_ID);
      if (data?.ok === false) toast.info(`This payment was already ${data.already === "confirmed" ? "approved" : data.already}.`);
      else toast.success(`${rand(next.amount)} from ${next.memberName} approved and recorded in Club Books`);
      qc.invalidateQueries({ queryKey: ["pending-eft-approval-count"] });
      qc.invalidateQueries({ queryKey: ["pending-member-transactions"] });
      qc.invalidateQueries({ queryKey: ["club-journal-entries"] });
    };

    toast.custom(
      () => (
        <ApprovalCard
          tx={next}
          total={pending.length}
          onApprove={approve}
          onLater={() => { snooze(clubId, next.id); toast.dismiss(TOAST_ID); setSnoozeTick((n) => n + 1); }}
          onView={() => { toast.dismiss(TOAST_ID); navigate(`/club-admin?tab=finance&view=pending&tx=${encodeURIComponent(next.id)}`); }}
        />
      ),
      { id: TOAST_ID, duration: Infinity },
    );
  }, [clubId, canSeeFinance, pending, navigate, qc, snoozeTick]);

  useEffect(() => () => { toast.dismiss(TOAST_ID); }, []);
}
