import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";

export type SuspensionBlock = "bookings" | "door" | "league" | "challenges" | "events" | "bar";
export type SuspensionStatus = "active" | "warning" | "suspended" | "manual_hold";

export interface SuspensionRules {
  enabled: boolean;
  grace_days: number;
  amount_threshold: number;
  age_days_threshold: number;
  exempt_with_mandate: boolean;
  blocks: SuspensionBlock[];
  grace_message: string;
}

const DEFAULTS: SuspensionRules = {
  enabled: false,
  grace_days: 30,
  amount_threshold: 500,
  age_days_threshold: 60,
  exempt_with_mandate: true,
  blocks: ["bookings", "door", "league", "challenges", "events", "bar"],
  grace_message: "Your account is in arrears. Please settle outstanding fees to restore access.",
};

export interface MemberAccessGate {
  status: SuspensionStatus;
  suspended: boolean;
  warning: boolean;
  reason: string | null;
  outstanding: number;
  blocks: SuspensionBlock[];
  rules: SuspensionRules;
  message: string;
  /** Convenience: is this action blocked? */
  isBlocked: (b: SuspensionBlock) => boolean;
}

export function useMemberAccessGate(): MemberAccessGate {
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const club = clubData?.club as any;
  const clubId = club?.id;
  const memberId = activeMember?.id;

  const rules: SuspensionRules = {
    ...DEFAULTS,
    ...((club?.suspension_rules as Partial<SuspensionRules>) || {}),
  };

  const { data } = useQuery({
    enabled: !!memberId && !!clubId,
    queryKey: ["access-gate", memberId, clubId],
    staleTime: 60_000,
    queryFn: async () => {
      const [memberRes, feesRes, mandateRes] = await Promise.all([
        supabase
          .from("club_members")
          .select("suspension_status, suspension_reason, suspension_outstanding, suspension_manual")
          .eq("id", memberId!)
          .maybeSingle(),
        supabase
          .from("club_member_fee_payments")
          .select("amount, invoice_due_date, created_at")
          .eq("club_member_id", memberId!)
          .eq("paid", false),
        supabase
          .from("stitch_mandates")
          .select("id")
          .eq("club_member_id", memberId!)
          .in("status", ["active", "pending"])
          .limit(1),
      ]);

      const fees = (feesRes.data || []) as any[];
      const graceMs = rules.grace_days * 86400000;
      const now = Date.now();
      let outstanding = 0;
      let oldestUnpaidAgeDays = 0;
      for (const f of fees) {
        const due = f.invoice_due_date
          ? new Date(f.invoice_due_date).getTime()
          : new Date(f.created_at).getTime();
        if (now - due < graceMs) continue; // still within grace
        outstanding += Number(f.amount || 0);
        const ageDays = Math.floor((now - due) / 86400000);
        if (ageDays > oldestUnpaidAgeDays) oldestUnpaidAgeDays = ageDays;
      }

      const hasMandate = (mandateRes.data || []).length > 0;
      return {
        member: memberRes.data as any,
        outstanding,
        oldestUnpaidAgeDays,
        hasMandate,
      };
    },
  });

  const manualStatus = (data?.member?.suspension_status as SuspensionStatus) || "active";
  const manualFlag = !!data?.member?.suspension_manual;
  const outstanding = data?.outstanding ?? 0;
  const oldestAge = data?.oldestUnpaidAgeDays ?? 0;
  const hasMandate = !!data?.hasMandate;

  let status: SuspensionStatus = "active";
  let reason: string | null = null;

  if (manualFlag && (manualStatus === "suspended" || manualStatus === "manual_hold")) {
    status = manualStatus;
    reason = data?.member?.suspension_reason || "Manually suspended by club admin";
  } else if (rules.enabled) {
    const exempt = rules.exempt_with_mandate && hasMandate;
    const overAmount = outstanding >= rules.amount_threshold;
    const overAge = oldestAge >= rules.age_days_threshold;
    if (!exempt && (overAmount || overAge)) {
      status = "suspended";
      const parts: string[] = [];
      if (overAmount) parts.push(`R${outstanding.toFixed(0)} outstanding`);
      if (overAge) parts.push(`${oldestAge} days overdue`);
      reason = parts.join(" · ");
    } else if (!exempt && outstanding > 0 && outstanding >= rules.amount_threshold * 0.5) {
      status = "warning";
      reason = `Approaching suspension threshold — R${outstanding.toFixed(0)} outstanding`;
    }
  }

  const suspended = status === "suspended" || status === "manual_hold";
  const blocks = suspended ? rules.blocks : [];

  return {
    status,
    suspended,
    warning: status === "warning",
    reason,
    outstanding,
    blocks,
    rules,
    message: rules.grace_message,
    isBlocked: (b) => suspended && blocks.includes(b),
  };
}
