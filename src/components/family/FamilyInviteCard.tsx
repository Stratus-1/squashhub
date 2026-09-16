import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useClubCurrency } from "@/hooks/use-currency";
import { FAMILY_ADDITIONAL_LABEL } from "@/lib/family/family-package";

interface Props {
  clubMemberId: string | null;
}

/**
 * Shown to a member who has been invited onto someone else's family package.
 * Nothing on their account changes until they accept here.
 */
export function FamilyInviteCard({ clubMemberId }: Props) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const [busy, setBusy] = useState(false);

  const { data: invite } = useQuery({
    queryKey: ["my-family-invite", clubMemberId],
    enabled: !!clubMemberId,
    queryFn: async () => {
      const { data: row } = await fromExt("club_family_members")
        .select("id, relationship, family_group_id")
        .eq("club_member_id", clubMemberId)
        .eq("status", "invited")
        .maybeSingle();
      if (!row) return null;
      const { data: group } = await fromExt("club_family_groups")
        .select("primary_member_id")
        .eq("id", (row as any).family_group_id)
        .maybeSingle();
      let primaryName = "A member";
      let fee: number | null = null;
      if (group) {
        const { data: p } = await fromExt("club_members")
          .select("name, fee_category_id")
          .eq("id", (group as any).primary_member_id)
          .maybeSingle();
        primaryName = (p as any)?.name || primaryName;
        if ((p as any)?.fee_category_id) {
          const { data: cat } = await fromExt("member_fee_categories")
            .select("family_additional_category_id")
            .eq("id", (p as any).fee_category_id)
            .maybeSingle();
          const addId = (cat as any)?.family_additional_category_id;
          if (addId) {
            const { data: addCat } = await fromExt("member_fee_categories")
              .select("annual_fee")
              .eq("id", addId)
              .maybeSingle();
            fee = Number((addCat as any)?.annual_fee ?? 0);
          }
        }
      }
      return { ...(row as any), primaryName, fee };
    },
  });

  if (!invite) return null;

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("family_respond_invite", {
        _family_member_id: invite.id,
        _accept: accept,
      });
      if (error) throw error;
      toast.success(
        accept
          ? "You're now on the family package — your fee is recorded against them."
          : "Request declined — nothing on your account changed.",
      );
      qc.invalidateQueries({ queryKey: ["my-family-invite", clubMemberId] });
      qc.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    } catch (e: any) {
      toast.error(e.message || "Could not respond to that request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div className="px-4 mt-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-4 border-primary/40">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold font-heading">Family package request</h2>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          <strong>{invite.primaryName}</strong> would like to add you to their family package
          {invite.relationship ? ` as ${invite.relationship}` : ""} and pay your club fee. If you accept, your
          membership becomes {FAMILY_ADDITIONAL_LABEL}
          {invite.fee != null ? ` (${money(invite.fee)} for the season)` : ""} with them recorded as the payer.
          Nothing on your account changes unless you accept.
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-8 text-xs" disabled={busy} onClick={() => respond(true)}>
            {busy && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Accept
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" disabled={busy} onClick={() => respond(false)}>
            Decline
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
