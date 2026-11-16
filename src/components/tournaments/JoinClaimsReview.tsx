import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Claim = { id: string; member_name: string; club_name: string; claimant_email: string | null; created_at: string };

/**
 * Organiser review of open-link name-only profile claims (no NSA number match).
 * Approving links the listed profile to the claimant's login; rejecting
 * cancels the unpaid entry made through the claim.
 */
export function JoinClaimsReview({ champId }: { champId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: claims = [] } = useQuery({
    queryKey: ["tournament-join-claims", champId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("tournament_join_pending_claims", { p_champ_id: champId });
      if (error) throw error;
      return (data ?? []) as Claim[];
    },
    retry: false,
  });
  if (!claims.length) return null;
  const review = async (id: string, approve: boolean) => {
    setBusy(id);
    const { error } = await (supabase as any).rpc("tournament_join_review_claim", { p_claim_id: id, p_approve: approve });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "Profile linked — the player can now enter." : "Claim rejected.");
    qc.invalidateQueries({ queryKey: ["tournament-join-claims", champId] });
  };
  return (
    <div className="space-y-1.5 rounded border border-border p-2 text-xs" data-testid="join-claims">
      <p className="font-medium">Profile claims to confirm ({claims.length})</p>
      <p className="text-muted-foreground">These players said a listed profile is theirs but gave no matching NSA number.</p>
      <ul className="divide-y divide-border">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
            <span><span className="font-medium">{c.member_name}</span> · {c.club_name}{c.claimant_email ? ` · login ${c.claimant_email}` : ""}</span>
            <span className="flex gap-2">
              <Button size="sm" disabled={busy === c.id} onClick={() => review(c.id, true)}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => review(c.id, false)}>Reject</Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
