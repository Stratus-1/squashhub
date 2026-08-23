/**
 * Consolidated platform invoice builder.
 *
 * ONE invoice per club per billing month. It may contain:
 *  - a subscription line (only in the club's renewal month — every month for
 *    monthly clubs, every 6th / 12th month for upfront clubs), and/or
 *  - a WhatsApp usage line for the PREVIOUS calendar month (billed in arrears).
 *
 * If neither line applies, no invoice is created at all.
 *
 * Everything here is pure so it can be unit-tested without a database.
 */

export type LineKind = 'subscription' | 'whatsapp'
export type InvoiceKind = 'subscription' | 'whatsapp' | 'combined'

export interface InvoiceLine {
  kind: LineKind
  description: string
  quantity: number
  unit_price: number
  amount: number
  period_start?: string
  period_end?: string
  meta?: Record<string, unknown>
}

export interface SubscriptionCharge {
  /** Whether the subscription renews in this billing run. */
  due: boolean
  planName: string
  billingCycle: string
  memberCount: number
  pricePerMember: number
  amount: number
  periodStart: string
  periodEnd: string
}

export interface WhatsAppCharge {
  messageCount: number
  amount: number
  periodStart: string
  periodEnd: string
  utilityCount?: number
  serviceCount?: number
  marketingCount?: number
}

export interface ConsolidatedInvoice {
  skip: boolean
  kind: InvoiceKind | null
  lineItems: InvoiceLine[]
  subscriptionAmount: number
  whatsappAmount: number
  whatsappMessageCount: number
  subtotal: number
  vatAmount: number
  total: number
}

const round2 = (n: number) => +(Number(n) || 0).toFixed(2)
const pad = (n: number) => String(n).padStart(2, '0')

/** ISO date (UTC) for the first day of the month containing `d`. */
export function monthStartIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`
}

/** The previous calendar month relative to `billingDate`, as ISO date bounds. */
export function previousMonthRange(billingDate: Date): { start: string; end: string } {
  const y = billingDate.getUTCFullYear()
  const m = billingDate.getUTCMonth()
  const start = new Date(Date.UTC(y, m - 1, 1))
  const end = new Date(Date.UTC(y, m, 0))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: iso(start), end: iso(end) }
}

/**
 * Is the subscription's next period starting on/before the billing day?
 * Upfront clubs (6-monthly / annual) only answer true in their renewal month.
 */
export function isSubscriptionDue(periodStartIso: string, billingDayIso: string): boolean {
  return billingDayIso >= periodStartIso.slice(0, 10)
}

/** Builds the line items and money for one club's consolidated monthly invoice. */
export function buildConsolidatedInvoice(input: {
  subscription: SubscriptionCharge
  whatsapp?: WhatsAppCharge | null
  vatRate?: number
}): ConsolidatedInvoice {
  const vatRate = Number(input.vatRate || 0)
  const lineItems: InvoiceLine[] = []
  const sub = input.subscription
  const wa = input.whatsapp

  let subscriptionAmount = 0
  if (sub?.due && sub.amount > 0) {
    subscriptionAmount = round2(sub.amount)
    lineItems.push({
      kind: 'subscription',
      description: `${sub.planName} subscription (${sub.billingCycle}) — ${sub.memberCount} member${
        sub.memberCount === 1 ? '' : 's'
      }`,
      quantity: sub.memberCount,
      unit_price: round2(sub.pricePerMember),
      amount: subscriptionAmount,
      period_start: sub.periodStart,
      period_end: sub.periodEnd,
    })
  }

  let whatsappAmount = 0
  let whatsappMessageCount = 0
  if (wa && wa.messageCount > 0 && wa.amount > 0) {
    whatsappAmount = round2(wa.amount)
    whatsappMessageCount = wa.messageCount
    lineItems.push({
      kind: 'whatsapp',
      description: `WhatsApp messages — ${wa.messageCount} message${wa.messageCount === 1 ? '' : 's'}`,
      quantity: wa.messageCount,
      unit_price: round2(wa.amount / wa.messageCount),
      amount: whatsappAmount,
      period_start: wa.periodStart,
      period_end: wa.periodEnd,
      meta: {
        utility_count: wa.utilityCount ?? 0,
        service_count: wa.serviceCount ?? 0,
        marketing_count: wa.marketingCount ?? 0,
      },
    })
  }

  if (!lineItems.length) {
    return {
      skip: true,
      kind: null,
      lineItems: [],
      subscriptionAmount: 0,
      whatsappAmount: 0,
      whatsappMessageCount: 0,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
    }
  }

  const subtotal = round2(subscriptionAmount + whatsappAmount)
  const vatAmount = round2(subtotal * vatRate)
  const kind: InvoiceKind =
    subscriptionAmount > 0 && whatsappAmount > 0
      ? 'combined'
      : whatsappAmount > 0
        ? 'whatsapp'
        : 'subscription'

  return {
    skip: false,
    kind,
    lineItems,
    subscriptionAmount,
    whatsappAmount,
    whatsappMessageCount,
    subtotal,
    vatAmount,
    total: round2(subtotal + vatAmount),
  }
}
