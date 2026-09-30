/**
 * Recurring payments: gateway capability + club rules.
 *
 * Which gateways can run recurring payments is declared ONCE here. Screens
 * must call `supportsRecurring()` / `clubRecurringAvailable()` and never
 * compare gateway names themselves.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { enabledGatewayIds } from "@/lib/club-gateways";

export type RecurringKind = "card" | "debit_order";

/** Gateways that support recurring collections, and how. Add new gateways here only. */
export const RECURRING_GATEWAYS: Record<string, { kind: RecurringKind; label: string; capped: boolean }> = {
  payfast: { kind: "card", label: "recurring card payment", capped: false },
  stitch: { kind: "debit_order", label: "debit order", capped: true },
};

export const supportsRecurring = (gateway: string | null | undefined) =>
  !!gateway && !!RECURRING_GATEWAYS[String(gateway).toLowerCase()];

/** First gateway the club has switched on that can run recurring payments. */
export function recurringGatewayFor(club: { payment_gateway?: string | null; payment_gateways?: string[] | null } | null | undefined) {
  return enabledGatewayIds(club).find((g) => supportsRecurring(g)) || null;
}

/** Whether a higher monthly amount needs the payer to re-approve (bank-capped rails). */
export const needsReapprovalToIncrease = (gateway: string | null | undefined) =>
  !!RECURRING_GATEWAYS[String(gateway || "").toLowerCase()]?.capped;

export const PERIOD_CHOICES = [2, 3, 4, 6, 9, 10, 12];

export interface RecurringSettings {
  club_id: string;
  recurring_enabled: boolean;
  allowed_months: number[];
  arrears_enabled: boolean;
  arrears_from: string | null;
  arrears_until: string | null;
  arrears_max_months: number;
  arrears_min_amount: number;
}

export const DEFAULT_RECURRING_SETTINGS = (clubId: string): RecurringSettings => ({
  club_id: clubId,
  recurring_enabled: true,
  allowed_months: [3, 4, 6, 10, 12],
  arrears_enabled: false,
  arrears_from: null,
  arrears_until: null,
  arrears_max_months: 6,
  arrears_min_amount: 0,
});

/** Recurring is offered when the club has a capable gateway AND the switch is on. */
export function clubRecurringAvailable(gateway: string | null | undefined, s: RecurringSettings | null | undefined) {
  return supportsRecurring(gateway) && (s?.recurring_enabled ?? true);
}

/** Periods a member may choose; for outstanding balances also capped at the max. */
export function allowedPeriods(s: RecurringSettings | null | undefined, forArrears = false): number[] {
  const base = (s?.allowed_months?.length ? s.allowed_months : [3, 4, 6, 10, 12]).filter((m) => m >= 1);
  const list = forArrears && s ? base.filter((m) => m <= s.arrears_max_months) : base;
  return [...new Set(list)].sort((a, b) => a - b);
}

/** Is the outstanding-balance offer open on `today` (YYYY-MM-DD) for this balance? */
export function arrearsOfferOpen(s: RecurringSettings | null | undefined, outstanding: number, today = new Date().toISOString().slice(0, 10)) {
  if (!s || !s.recurring_enabled || !s.arrears_enabled) return false;
  if (s.arrears_from && today < s.arrears_from) return false;
  if (s.arrears_until && today > s.arrears_until) return false;
  if (!(outstanding > 0) || outstanding < Number(s.arrears_min_amount || 0)) return false;
  return allowedPeriods(s, true).length > 0;
}

/** Monthly instalment rounded UP to the cent so the balance is always covered. */
export const monthlyInstalment = (outstanding: number, months: number) =>
  months > 0 ? Math.ceil((outstanding / months) * 100) / 100 : 0;

/** Extra to add to this charge: never more than what is left on the plan or owed. */
export function planChargeExtra(plan: { total_amount: number; monthly_extra: number; amount_collected: number }, stillOwed: number) {
  const left = Math.max(0, Number(plan.total_amount) - Number(plan.amount_collected));
  return Math.round(Math.max(0, Math.min(Number(plan.monthly_extra), left, Math.max(0, stillOwed))) * 100) / 100;
}

export function useClubRecurringSettings(clubId?: string | null) {
  return useQuery({
    queryKey: ["club-recurring-settings", clubId],
    enabled: !!clubId,
    queryFn: async (): Promise<RecurringSettings> => {
      const { data, error } = await (supabase as any)
        .from("club_recurring_settings").select("*").eq("club_id", clubId!).maybeSingle();
      if (error) throw error;
      return data ? { ...data, arrears_min_amount: Number(data.arrears_min_amount || 0) } : DEFAULT_RECURRING_SETTINGS(clubId!);
    },
  });
}
