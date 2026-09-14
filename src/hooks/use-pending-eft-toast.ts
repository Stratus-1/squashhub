/**
 * Persistent "EFT approvals outstanding" toast for finance staff.
 *
 * Members with the `finance` permission (or club admins) see a sticky toast
 * whenever the club has pending EFT top-ups / payments awaiting approval.
 * It stays on screen until dismissed and disappears automatically as soon as
 * the last pending item is approved. Members without finance rights never see it.
 */

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHasPermission } from "@/hooks/use-club-permissions";

const TOAST_ID = "pending-eft-approvals";

export function usePendingEftApprovalToast(clubId?: string | null) {
  const canSeeFinance = useHasPermission("finance");
  const navigate = useNavigate();
  const shownCount = useRef<number | null>(null);

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["pending-eft-approval-count", clubId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("member_credit_transactions")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId!)
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!clubId && canSeeFinance,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!clubId || !canSeeFinance) return;

    if (!pendingCount) {
      // Approved / cleared — take the toast away immediately.
      if (shownCount.current !== null) {
        toast.dismiss(TOAST_ID);
        shownCount.current = null;
      }
      return;
    }

    // Only (re)raise when the number actually changes, so it doesn't flicker.
    if (shownCount.current === pendingCount) return;
    shownCount.current = pendingCount;

    toast.warning(
      pendingCount === 1
        ? "1 payment is waiting for your approval"
        : `${pendingCount} payments are waiting for your approval`,
      {
        id: TOAST_ID,
        duration: Infinity,
        closeButton: true,
        description:
          "Members have submitted EFT payments that still need to be checked and confirmed.",
        action: {
          label: "Review",
          onClick: () => {
            toast.dismiss(TOAST_ID);
            navigate("/club-admin?tab=finance&view=pending");
          },
        },
      },
    );
  }, [clubId, canSeeFinance, pendingCount, navigate]);

  useEffect(() => () => toast.dismiss(TOAST_ID), []);
}
