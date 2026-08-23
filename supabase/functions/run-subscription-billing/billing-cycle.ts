export type BillingCycle = 'monthly' | 'biannual' | 'annual'

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  biannual: 6,
  annual: 12,
}

export const cycleDiscount = (cycle: BillingCycle): number =>
  cycle === 'annual' ? 0.9 : cycle === 'biannual' ? 0.95 : 1

/** Adds a billing period in UTC and clamps month-end dates (31 Aug + 6 months = 28 Feb). */
export const addBillingMonths = (from: Date, cycle: BillingCycle): Date => {
  const months = CYCLE_MONTHS[cycle]
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay))
  return target
}