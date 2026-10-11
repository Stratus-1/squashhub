import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { rand } from "@/lib/tournaments/entry-fees";

const db = supabase as any;
const Schema = z.object({
  method: z.enum(["eft", "card"]),
  amountCents: z.number().int().positive().max(10_000_000),
  reference: z.string().trim().max(120),
  paidOn: z.string().max(10),
});
const STATUS: Record<string, string> = {
  reported: "Payment reported — awaiting admin verification",
  needs_proof: "Proof requested by the club",
  approved: "Payment verified",
  rejected: "Payment report rejected",
};

/**
 * Member "I've already paid". Records a claim only — never marks paid or credits the account.
 * Always for the selected member id (shared family logins pick the person via the account switcher).
 */
export function ReportPaymentButton({ champId, clubId, memberId, memberName, suggestedCents }: { champId: string; clubId: string; memberId: string; memberName?: string; suggestedCents: number }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ method: "eft" as "eft" | "card", amount: suggestedCents ? String(suggestedCents / 100) : "", reference: "", paidOn: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: claims = [], refetch } = useQuery({
    queryKey: ["my-champ-claims", champId, memberId],
    queryFn: async () => (await db.from("champ_payment_claim_allocations").select("amount_cents, champ_payment_claims!inner(id, champ_id, status, review_reason, created_at)").eq("club_member_id", memberId).eq("champ_payment_claims.champ_id", champId)).data ?? [],
  });
  const latest = [...claims].sort((a: any, b: any) => String(b.champ_payment_claims.created_at).localeCompare(a.champ_payment_claims.created_at))[0]?.champ_payment_claims;

  const submit = async () => {
    const parsed = Schema.safeParse({ method: f.method, amountCents: Math.round(Number(f.amount) * 100), reference: f.reference, paidOn: f.paidOn });
    if (!parsed.success) return toast.error("Enter the amount you paid");
    if (file && file.size > 10 * 1024 * 1024) return toast.error("Proof must be under 10 MB");
    setBusy(true);
    try {
      let proofPath: string | null = null;
      if (file) {
        const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5);
        proofPath = `${clubId}/${memberId}/champ-claims/${champId}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("payment-proofs").upload(proofPath, file, { upsert: false });
        if (error) throw error;
      }
      const d = parsed.data;
      const { error } = await db.rpc("champ_payment_claim_submit", {
        p_champ: champId, p_method: d.method, p_paid_on: d.paidOn || null, p_reference: d.reference, p_amount_cents: d.amountCents,
        p_proof_path: proofPath, p_allocations: [{ club_member_id: memberId, amount_cents: d.amountCents }],
      });
      if (error) throw error;
      toast.success("Thanks — the club will verify your payment.");
      setOpen(false); refetch();
    } catch (e: any) {
      toast.error(e.message || "Could not report payment");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-1">
      {latest && <p className="text-xs" data-testid="claim-status"><b>{STATUS[latest.status] ?? latest.status}</b>{latest.review_reason ? ` — ${latest.review_reason}` : ""}</p>}
      {(!latest || latest.status === "rejected" || latest.status === "needs_proof") && (
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setOpen(true)}>I've already paid</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirm payment made{memberName ? ` — ${memberName}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">The club checks this against its bank or card records before marking it paid. Your entry stays confirmed meanwhile.</p>
            <div className="grid grid-cols-2 gap-2">
              {(["eft", "card"] as const).map((m) => (
                <Button key={m} type="button" size="sm" variant={f.method === m ? "default" : "outline"} onClick={() => setF({ ...f, method: m })}>{m === "eft" ? "EFT / bank transfer" : "Card"}</Button>
              ))}
            </div>
            <Input aria-label="Amount paid (R)" placeholder={`Amount paid (R)${suggestedCents ? ` — due ${rand(suggestedCents)}` : ""}`} type="number" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <Input aria-label="Payment reference" placeholder="Reference (optional)" maxLength={120} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
            <label className="block text-xs">Date paid (optional)<Input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></label>
            <label className="block text-xs">Proof of payment (optional)<Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          </div>
          <DialogFooter><Button onClick={submit} disabled={busy}>{busy ? "Sending…" : "Report payment"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
