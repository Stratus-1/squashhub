/**
 * Shared membership pro-rata rules.
 *
 * Club rule:
 *  - Joining within ONE MONTH of the renewal date → charge the FULL annual fee,
 *    and that payment covers the upcoming fee year (member is not billed again
 *    at the next renewal).
 *  - Joining earlier than one month before renewal → charge pro-rata for the
 *    whole months remaining until the renewal date; the member is invoiced
 *    again at the next renewal.
 */

export interface ProRataResult {
  /** Amount to charge now. */
  amount: number;
  /** Whole months charged (12 when the full fee applies). */
  monthsCharged: number;
  /** Fee year the payment belongs to (calendar year of the renewal it covers). */
  seasonYear: number;
  /** True when the full fee was charged because the join is close to renewal. */
  fullFee: boolean;
}

/** Date of the next renewal on/after `from`. */
export function nextRenewalDate(dueMonth: number, dueDay = 1, from: Date = new Date()): Date {
  const y = from.getFullYear();
  let next = new Date(y, (dueMonth || 1) - 1, dueDay || 1);
  if (next <= from) next = new Date(y + 1, (dueMonth || 1) - 1, dueDay || 1);
  return next;
}

/** Fractional months between `from` and the next renewal. */
export function monthsUntilRenewal(dueMonth: number, dueDay = 1, from: Date = new Date()): number {
  const next = nextRenewalDate(dueMonth, dueDay, from);
  return (next.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

/**
 * Compute the joining fee for a member.
 * `proRate=false` always charges the full annual fee for the current fee year.
 */
export function computeJoinFee(
  annualFee: number,
  dueMonth: number,
  dueDay = 1,
  proRate = true,
  from: Date = new Date(),
): ProRataResult {
  const renewal = nextRenewalDate(dueMonth, dueDay, from);
  const months = monthsUntilRenewal(dueMonth, dueDay, from);

  // The fee year currently running ends at the upcoming renewal, so it is
  // identified by the year of the PREVIOUS renewal date.
  const currentSeasonYear = renewal.getFullYear() - 1;
  // The fee year that starts at the upcoming renewal.
  const upcomingSeasonYear = renewal.getFullYear();

  if (!annualFee || annualFee <= 0) {
    return { amount: 0, monthsCharged: 0, seasonYear: currentSeasonYear, fullFee: false };
  }

  // Within a month of renewal → full fee that covers the fee year starting at
  // the upcoming renewal (so that renewal invoice is skipped for them).
  if (months <= 1) {
    return { amount: annualFee, monthsCharged: 12, seasonYear: upcomingSeasonYear, fullFee: true };
  }

  // Pro-rata disabled → full fee for the fee year currently running; the member
  // is invoiced again at the upcoming renewal.
  if (!proRate) {
    return { amount: annualFee, monthsCharged: 12, seasonYear: currentSeasonYear, fullFee: true };
  }

  const monthsCharged = Math.min(12, Math.max(1, Math.ceil(months)));
  const amount = Math.round((annualFee / 12) * monthsCharged * 100) / 100;
  return { amount, monthsCharged, seasonYear: currentSeasonYear, fullFee: false };
}
