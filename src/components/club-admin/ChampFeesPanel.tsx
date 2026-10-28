import { useState } from "react";
import { useFinancialAccess } from "@/hooks/use-financial-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { rand } from "@/lib/tournaments/entry-fees";

const db = supabase as any;
type PreviewRow = { registration_id: string; club_member_id: string; member_name: string | null; shared_email: boolean; division: number | null; amount_cents: number; action: string; existing_paid: boolean | null };
const ACTION_LABEL: Record<string, string> = { create: "Will charge", skip_existing: "Already charged", skip_zero: "No fee", blocked_missing_member: "Blocked: no member record", blocked_legacy_fee: "Blocked: older fee record linked" };

/**
 * Admin fees & payment reconciliation for one tournament. Posting and approvals go through audited,
 * idempotent server functions; nothing is posted or marked paid without an explicit click + confirmation.
 */
export function ChampFeesPanel({ champId, clubId, entrants }: { champId: string; clubId: string; entrants: Array<{ id: string; name: string }> }) {
  const { canChange } = useFinancialAccess(clubId);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [offline, setOffline] = useState({ memberIds: [] as string[], amount: "", method: "eft", reference: "", paidOn: "" });

  const { data: basis } = useQuery({
    queryKey: ["champ-fee-basis", champId],
    queryFn: async () => (await db.from("tournaments").select("entry_fee_basis, entry_fee_mixed_rule").eq("id", champId).maybeSingle()).data,
  });
  const { data: claims = [], refetch: refetchClaims } = useQuery({
    queryKey: ["champ-claims", champId],
    queryFn: async () => (await db.from("champ_payment_claims").select("*, champ_payment_claim_allocations(*)").eq("champ_id", champId).order("created_at", { ascending: false })).data ?? [],
  });
  const nameOf = (id: string) => entrants.find((e) => e.id === id)?.name ?? "Member";
  const needsConfirm = !basis?.entry_fee_basis;

  const loadPreview = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("champ_fee_charge_preview", { p_champ: champId });
    setBusy(false);
    if (error) return toast.error(error.message);
    setPreview(data ?? []); setConfirmPost(false);
  };
  const toCreate = (preview ?? []).filter((r) => r.action === "create");
  const createTotal = toCreate.reduce((t, r) => t + r.amount_cents, 0);
  const blocked = (preview ?? []).filter((r) => r.action.startsWith("blocked"));
  const post = async () => {
    setBusy(true);
    const { data, error } = await db.rpc("champ_fee_post_charges", { p_champ: champId, p_expected_total_cents: createTotal });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data} charge${data === 1 ? "" : "s"} posted to member accounts`);
    qc.invalidateQueries(); loadPreview();
  };

  const review = async (claim: any, action: "approve" | "reject" | "needs_proof") => {
    let reason: string | null = null;
    if (action !== "approve") { reason = window.prompt(action === "reject" ? "Reason for rejecting (shown to the member in the app)" : "What proof is needed?"); if (!reason?.trim()) return; }
    else if (!window.confirm(`Approve ${rand(claim.amount_cents)} as verified against your bank/card records? This settles the member charge(s); any excess stays as account credit.`)) return;
    const { error } = await db.rpc("champ_payment_claim_review", { p_claim: claim.id, p_action: action, p_reason: reason, p_allocations: null });
    if (error) return toast.error(error.message);
    toast.success("Claim updated"); refetchClaims(); qc.invalidateQueries();
  };
  const openProof = async (path: string) => {
    const { data } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };
  const recordOffline = async () => {
    const cents = Math.round(Number(offline.amount) * 100);
    if (!offline.memberIds.length || !(cents > 0)) return toast.error("Choose members and an amount");
    const n = offline.memberIds.length;
    const each = Math.floor(cents / n);
    const allocations = offline.memberIds.map((id, i) => ({ club_member_id: id, amount_cents: i === 0 ? cents - each * (n - 1) : each, admin: true }));
    const { error } = await db.rpc("champ_payment_claim_submit", { p_champ: champId, p_method: offline.method, p_paid_on: offline.paidOn || null, p_reference: offline.reference, p_amount_cents: cents, p_proof_path: null, p_allocations: allocations });
    if (error) return toast.error(error.message);
    toast.success("Recorded for verification — approve it below once reconciled");
    setOffline({ memberIds: [], amount: "", method: "eft", reference: "", paidOn: "" }); refetchClaims();
  };

  const open = claims.filter((c: any) => c.status === "reported" || c.status === "needs_proof");
  return (
    <details className="rounded-md border p-3 text-sm" data-testid="champ-fees-panel">
      <summary className="cursor-pointer font-semibold">
        Fees & payments {needsConfirm ? <Badge variant="outline" className="ml-2">Fee basis: Needs confirmation</Badge> : <Badge variant="secondary" className="ml-2">{basis.entry_fee_basis === "per_player" ? "Once per player" : "Per category entered"}</Badge>}
        {open.length > 0 && <Badge className="ml-2">{open.length} payment report{open.length === 1 ? "" : "s"} to verify</Badge>}
      </summary>
      <div className="mt-3 space-y-4">
        <p className="text-xs text-muted-foreground">Entries stay confirmed and draw-eligible when pay-before-entry is No. Nothing here sends messages.</p>
        {needsConfirm && <p className="rounded-md border border-dashed p-2 text-xs">Choose how the entry fee is charged in <b>Edit tournament setup → Fees & Payment</b>. Charges and approvals are blocked until then.</p>}

        <p className="text-xs text-muted-foreground">Each entry fee is charged to the member's own account when they enter, report a payment or pay by card; a verified payment then settles that charge once.</p>

        <section className="space-y-2">
          <div className="font-semibold">1. Payments already made (offline reconciliation)</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select multiple className="h-28 rounded border bg-background p-1 text-xs" aria-label="Members covered" value={offline.memberIds}
              onChange={(e) => setOffline({ ...offline, memberIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
              {entrants.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <div className="space-y-1">
              <Input placeholder="Amount (R)" type="number" min={0} value={offline.amount} onChange={(e) => setOffline({ ...offline, amount: e.target.value })} />
              <select className="w-full rounded border bg-background p-2 text-xs" value={offline.method} onChange={(e) => setOffline({ ...offline, method: e.target.value })}>
                <option value="eft">EFT / bank transfer</option><option value="card">Card</option><option value="cash">Cash</option>
              </select>
              <Input placeholder="Reference" maxLength={120} value={offline.reference} onChange={(e) => setOffline({ ...offline, reference: e.target.value })} />
              <Input type="date" value={offline.paidOn} onChange={(e) => setOffline({ ...offline, paidOn: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Selecting several members splits the amount evenly; it is recorded for verification and only settles fees once approved below.</p>
          <Button disabled={!canChange} size="sm" variant="outline" onClick={recordOffline}>Record for verification</Button>
        </section>

        <section className="space-y-2">
          <div className="font-semibold">3. Payment reports</div>
          {claims.length === 0 && <p className="text-xs text-muted-foreground">No payment reports yet.</p>}
          {claims.map((c: any) => (
            <div key={c.id} className="rounded border p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <b>{rand(c.amount_cents)}</b> · {c.method.toUpperCase()}{c.reference ? ` · ref ${c.reference}` : ""}{c.paid_on ? ` · ${c.paid_on}` : ""}
                <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "outline"}>
                  {c.status === "reported" ? "Payment reported — awaiting verification" : c.status === "needs_proof" ? "Proof requested" : c.status === "approved" ? "Verified" : "Rejected"}
                </Badge>
                {c.recorded_by_admin && <Badge variant="secondary">Recorded by admin</Badge>}
              </div>
              <div className="mt-1">For: {(c.champ_payment_claim_allocations ?? []).map((a: any) => `${nameOf(a.club_member_id)} ${rand(a.amount_cents)}${a.credit_cents ? ` (credit ${rand(a.credit_cents)})` : ""}`).join(", ")}</div>
              {c.review_reason && <div className="text-muted-foreground">Note: {c.review_reason}</div>}
              <div className="mt-1 flex flex-wrap gap-2">
                {c.proof_path && <Button size="sm" variant="ghost" onClick={() => openProof(c.proof_path)}>View proof</Button>}
                {(c.status === "reported" || c.status === "needs_proof") && <>
                  <Button size="sm" onClick={() => review(c, "approve")} disabled={!canChange || needsConfirm}>Approve (verified)</Button>
                  <Button disabled={!canChange} size="sm" variant="outline" onClick={() => review(c, "needs_proof")}>Request proof</Button>
                  <Button disabled={!canChange} size="sm" variant="destructive" onClick={() => review(c, "reject")}>Reject</Button>
                </>}
              </div>
            </div>
          ))}
        </section>
      </div>
    </details>
  );
}
