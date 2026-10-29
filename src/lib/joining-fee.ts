/**
 * Joining club fee on category selection.
 *
 * Rule (owner, Oct 2026): the pro-rata club fee must be raised the moment a
 * fee category is set for a new member application — whether the member picks
 * it in the signup wizard or an admin assigns it (member edit dialog or the
 * application approval prompt). The member wizard still raises its own fee
 * rows; this helper covers the admin paths and is idempotent: a member with
 * any existing club/membership fee record is never charged again here.
 */
import { fromExt } from "@/lib/supabase-ext";
import { computeJoinFee } from "@/lib/fee-proration";
import { supabase } from "@/integrations/supabase/client";

export interface JoiningFeeCategory {
  id: string;
  name: string;
  annual_fee: number | null;
  due_month?: number | null;
  due_day?: number | null;
  pro_rate?: boolean | null;
}

export interface JoiningClubFeeDecision {
  raise: boolean;
  amount: number;
  monthsCharged: number;
  seasonYear: number;
  fullFee: boolean;
  proRated: boolean;
}

/** Pure decision — kept separate so the charging rule is directly testable. */
export function decideJoiningClubFee(opts: {
  annualFee: number | null | undefined;
  dueMonth?: number | null;
  dueDay?: number | null;
  proRate?: boolean | null;
  joinedAt?: string | null;
  hasExistingClubFee: boolean;
  billingExempt?: boolean | null;
  now?: Date;
}): JoiningClubFeeDecision {
  const none: JoiningClubFeeDecision = {
    raise: false, amount: 0, monthsCharged: 0, seasonYear: new Date().getFullYear(), fullFee: false, proRated: false,
  };
  if (opts.billingExempt) return none;
  if (opts.hasExistingClubFee) return none;
  const annualFee = Number(opts.annualFee) || 0;
  if (annualFee <= 0) return none;

  const proRate = opts.proRate ?? true;
  const from = opts.joinedAt ? new Date(opts.joinedAt) : (opts.now ?? new Date());
  const calc = computeJoinFee(annualFee, opts.dueMonth || 1, opts.dueDay || 1, proRate, from);
  if (!(calc.amount > 0)) return none;
  return {
    raise: true,
    amount: calc.amount,
    monthsCharged: calc.monthsCharged,
    seasonYear: calc.seasonYear,
    fullFee: calc.fullFee,
    proRated: proRate && !calc.fullFee,
  };
}

/** Fee label matching the signup wizard, so statements read the same either way. */
export function joiningClubFeeLabel(category: JoiningFeeCategory, d: JoiningClubFeeDecision): string {
  const proRate = category.pro_rate ?? true;
  const suffix = !proRate
    ? ""
    : d.fullFee
      ? " — Full year (covers next season)"
      : ` — Pro-rated ${d.monthsCharged} month${d.monthsCharged === 1 ? "" : "s"}`;
  return `Club Membership (${category.name})${suffix}`;
}

/**
 * Raise the unpaid pro-rata club fee for a member if none exists yet.
 * Returns { raised, amount } — raised=false means nothing was written.
 */
export async function ensureJoiningClubFee(
  clubMemberId: string,
  category: JoiningFeeCategory,
): Promise<{ raised: boolean; amount: number }> {
  const [{ data: member, error: memErr }, { data: existing, error: feeErr }] = await Promise.all([
    fromExt("club_members").select("id, club_id, joined_at, billing_exempt").eq("id", clubMemberId).maybeSingle(),
    fromExt("club_member_fee_payments")
      .select("id")
      .eq("club_member_id", clubMemberId)
      .in("fee_type", ["club", "membership"])
      .limit(1),
  ]);
  if (memErr) throw memErr;
  if (feeErr) throw feeErr;
  if (!member) return { raised: false, amount: 0 };

  const { data: access, error: accessError } = await supabase.rpc("club_financial_access", { _club_id: member.club_id });
  if (accessError) throw accessError;
  if ((access as unknown as { chairman?: boolean })?.chairman) {
    const { data, error } = await supabase.rpc("chairman_ensure_joining_fee" as never, { _member_id: clubMemberId } as never);
    if (error) throw error;
    return data as unknown as { raised: boolean; amount: number };
  }

  const decision = decideJoiningClubFee({
    annualFee: category.annual_fee,
    dueMonth: category.due_month,
    dueDay: category.due_day,
    proRate: category.pro_rate,
    joinedAt: member.joined_at,
    hasExistingClubFee: (existing || []).length > 0,
    billingExempt: member.billing_exempt,
  });
  if (!decision.raise) return { raised: false, amount: 0 };

  const { error } = await fromExt("club_member_fee_payments").insert({
    club_member_id: clubMemberId,
    fee_type: "club",
    fee_label: joiningClubFeeLabel(category, decision),
    amount: decision.amount,
    paid: false,
    season_year: decision.seasonYear,
  });
  if (error) throw error;

  // Once-off registration fee(s): only for genuinely new members, i.e. the
  // same moment their first club fee is raised, and never twice.
  let total = decision.amount;
  const [{ data: regFees }, { data: existingReg }] = await Promise.all([
    fromExt("national_body_fees")
      .select("body_name, abbreviation, fee_annual, active")
      .eq("club_id", member.club_id)
      .eq("fee_type", "registration"),
    fromExt("club_member_fee_payments")
      .select("id").eq("club_member_id", clubMemberId).eq("fee_type", "registration").limit(1),
  ]);
  if (!(existingReg || []).length) {
    const rows = (regFees || [])
      .filter((f: any) => f.active !== false && Number(f.fee_annual) > 0)
      .map((f: any) => ({
        club_member_id: clubMemberId,
        fee_type: "registration",
        fee_label: f.body_name + (f.abbreviation ? ` (${f.abbreviation})` : ""),
        amount: Number(f.fee_annual),
        paid: false,
        season_year: decision.seasonYear,
      }));
    if (rows.length) {
      const { error: regErr } = await fromExt("club_member_fee_payments").insert(rows);
      if (regErr) throw regErr;
      total += rows.reduce((s: number, r: any) => s + r.amount, 0);
    }
  }
  return { raised: true, amount: total };
}
