import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { addBillingMonths, CYCLE_MONTHS, cycleDiscount, type BillingCycle } from './billing-cycle.ts'
import {
import { sendAppEmail } from '../_shared/send-app-email.ts'
  buildConsolidatedInvoice,
  monthStartIso,
  previousMonthRange,
} from './consolidated.ts'


interface RequestBody {
  dryRun?: boolean
  subscriptionIds?: string[]
  billingDate?: string // ISO date; defaults to today
  vatRate?: number // 0..1 override; falls back to settings/0
  /** Fixed day of the month invoices are issued/emailed on (1-28, default 25). */
  issueDay?: number
  /** Run even when today is not the fixed issue day. */
  force?: boolean

}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: RequestBody = {}
  try {
    if (req.method === 'POST') body = (await req.json().catch(() => ({}))) as RequestBody
  } catch (_) {}

  const dryRun = !!body.dryRun
  const runDate = body.billingDate ? new Date(body.billingDate) : new Date()


  // 1) Load platform invoice settings + per-currency SaaS rates. Base is ZAR;
  //    USD/EUR clubs are billed at their configured rate.
  const { data: allSettings, error: settingErr } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'platform_invoice_settings',
      'platform_stitch_private_settings',
       'saas_rate_zar_monthly', 'saas_rate_zar_biannual', 'saas_rate_zar_annual',
       'saas_rate_usd_monthly', 'saas_rate_usd_biannual', 'saas_rate_usd_annual',
       'saas_rate_eur_monthly', 'saas_rate_eur_biannual', 'saas_rate_eur_annual',
      'saas_min_charge_monthly', 'saas_min_charge_biannual', 'saas_min_charge_annual',
      'fx_usd_to_zar', 'fx_eur_to_zar',
      // Graduated ("sliding scale") pricing — when enabled these override the flat rates.
      'saas_tiers_enabled',
      'saas_tiers_zar_monthly', 'saas_tiers_zar_biannual', 'saas_tiers_zar_annual',
      'saas_tiers_usd_monthly', 'saas_tiers_usd_biannual', 'saas_tiers_usd_annual',
      'saas_tiers_eur_monthly', 'saas_tiers_eur_biannual', 'saas_tiers_eur_annual',
      'saas_tier_min_zar_monthly', 'saas_tier_min_zar_biannual', 'saas_tier_min_zar_annual',
      'saas_tier_min_usd_monthly', 'saas_tier_min_usd_biannual', 'saas_tier_min_usd_annual',
      'saas_tier_min_eur_monthly', 'saas_tier_min_eur_biannual', 'saas_tier_min_eur_annual',
    ])

  if (settingErr && settingErr.code !== 'PGRST116') {
    return json({ error: `Failed to load invoice settings: ${settingErr.message}` }, 500)
  }
  const settingsMap = new Map<string, string>((allSettings || []).map((r: any) => [r.key, r.value]))
  const settings = settingsMap.get('platform_invoice_settings')
    ? JSON.parse(settingsMap.get('platform_invoice_settings')!)
    : {}
  let stitchCreds: any = null
  try {
    const raw = settingsMap.get('platform_stitch_private_settings')
    if (raw) stitchCreds = JSON.parse(raw)
  } catch (_) { stitchCreds = null }
  const invoicePrefix: string = settings.invoice_prefix || 'INV-'
  const vatRate: number =
    typeof body.vatRate === 'number' ? body.vatRate : settings.vat_number ? 0.15 : 0

  // --- Fixed monthly issue day -------------------------------------------
  // Invoices are created + emailed on a FIXED day of every month (default the
  // 25th). Each invoice is still DATED on the club's own renewal date, but the
  // send run happens on the issue day and covers every renewal that falls
  // before the following month's issue day.
  const issueDayRaw =
    typeof body.issueDay === 'number'
      ? body.issueDay
      : Number(settings.issue_day_of_month ?? settings.invoice_issue_day ?? 25)
  const issueDay = isFinite(issueDayRaw) ? Math.max(1, Math.min(28, Math.round(issueDayRaw))) : 25

  const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const issueDayIn = (year: number, monthIdx: number) => {
    const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate()
    return new Date(Date.UTC(year, monthIdx, Math.min(issueDay, lastDay)))
  }
  /** First issue-day on or after `d`. */
  const issueDayOnOrAfter = (d: Date) => {
    const base = dateOnly(d)
    const thisMonth = issueDayIn(base.getUTCFullYear(), base.getUTCMonth())
    return thisMonth >= base ? thisMonth : issueDayIn(base.getUTCFullYear(), base.getUTCMonth() + 1)
  }
  /** Last issue-day on or before `d`. */
  const issueDayOnOrBefore = (d: Date) => {
    const base = dateOnly(d)
    const thisMonth = issueDayIn(base.getUTCFullYear(), base.getUTCMonth())
    return thisMonth <= base ? thisMonth : issueDayIn(base.getUTCFullYear(), base.getUTCMonth() - 1)
  }

  const today = dateOnly(runDate)
  const isIssueDay = today.getTime() === issueDayIn(today.getUTCFullYear(), today.getUTCMonth()).getTime()
  // Renewals up to (and including) the NEXT send run are covered by this run.
  const coverageEnd = isIssueDay
    ? issueDayIn(today.getUTCFullYear(), today.getUTCMonth() + 1)
    : issueDayOnOrAfter(today)
  const nextIssueDate = isIssueDay ? today : issueDayOnOrAfter(today)
  const billingDate = runDate

  // Guard: the scheduler fires daily; only the fixed issue day actually bills.
  // Manual/dry runs and targeted subscription runs bypass the guard.
  if (!dryRun && !body.force && !body.subscriptionIds?.length && !isIssueDay) {
    return json({
      skipped: true,
      reason: 'not-issue-day',
      runDate: runDate.toISOString().slice(0, 10),
      issue_day_of_month: issueDay,
      next_issue_date: nextIssueDate.toISOString().slice(0, 10),
    })
  }





  // Per-currency rate resolver. Falls back to plan.price_per_member (ZAR base) if unset.
  const num = (k: string, d: number) => {
    const v = settingsMap.get(k)
    const n = v == null ? NaN : Number(v)
    return isFinite(n) && n > 0 ? n : d
  }
  const rateFor = (ccy: string, cycle: BillingCycle, fallback: number): number => {
    const c = (ccy || 'ZAR').toUpperCase()
    const disc = cycleDiscount(cycle)
    if (c === 'USD') return num(`saas_rate_usd_${cycle}`, +(0.35 * disc).toFixed(2))
    if (c === 'EUR') return num(`saas_rate_eur_${cycle}`, +(0.32 * disc).toFixed(2))
    return num(`saas_rate_zar_${cycle}`, +(fallback * disc).toFixed(2))
  }
  const minChargeFor = (cycle: BillingCycle, fallback: number): number =>
    num(`saas_min_charge_${cycle}`, fallback)
  // FX rates: how many ZAR per 1 unit of foreign currency. Stitch only charges ZAR,
  // so USD/EUR clubs see "~$X per member" for reference but are actually billed in ZAR.
  const fxToZar = (ccy: string): number => {
    const c = (ccy || 'ZAR').toUpperCase()
    if (c === 'ZAR') return 1
    if (c === 'USD') return num('fx_usd_to_zar', 18.5)
    if (c === 'EUR') return num('fx_eur_to_zar', 20)
    return 1
  }

  // --- Graduated ("sliding scale") pricing -------------------------------
  // Bands work like tax brackets: the first N members are charged at band 1,
  // the next block at band 2, etc. Currency bands are stored separately so
  // USD/EUR pricing stays proportional to the ZAR structure.
  // Sliding scale is the only pricing model — always on.
  const tiersEnabled = true
  const tiersFor = (ccy: string, cycle: BillingCycle): Array<{ upTo: number | null; rate: number }> | null => {
    const c = (ccy || 'ZAR').toUpperCase()
    const key = `saas_tiers_${c.toLowerCase()}_${cycle}`
    const raw = settingsMap.get(key)
    if (!raw) return null
    try {
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr) || !arr.length) return null
      return arr.map((t: any) => ({
        upTo: t.upTo == null || t.upTo === '' ? null : Number(t.upTo),
        rate: Number(t.rate) || 0,
      }))
    } catch {
      return null
    }
  }
  const tierMinFor = (ccy: string, cycle: BillingCycle): number | null => {
    const c = (ccy || 'ZAR').toUpperCase()
    const v = settingsMap.get(`saas_tier_min_${c.toLowerCase()}_${cycle}`)
    const n = v == null ? NaN : Number(v)
    return isFinite(n) ? n : null
  }
  const graduatedTotal = (members: number, tiers: Array<{ upTo: number | null; rate: number }>): number => {
    let remaining = Math.max(0, Math.floor(members || 0))
    let lower = 0
    let total = 0
    for (const t of tiers) {
      if (remaining <= 0) break
      const width = t.upTo == null ? remaining : Math.max(0, t.upTo - lower)
      const take = Math.min(remaining, width)
      total += take * t.rate
      remaining -= take
      lower = t.upTo == null ? lower + take : t.upTo
    }
    return +total.toFixed(2)
  }


  if (!settings.company_name && !dryRun) {
    return json(
      { error: 'Invoice details not configured. Set company_name in Super Admin → Subscriptions → Invoice Details.' },
      400,
    )
  }

  // 2) Fetch subscriptions to bill
  let query = supabase
    .from('club_subscriptions')
    .select(
      `id, club_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, member_count,
       clubs:club_id ( name, subdomain ),
       subscription_plans:plan_id ( name, price_per_member, billing_cycle, minimum_charge, max_billable_members )`,
    )
    .in('status', ['active', 'trial', 'past_due'])
    .limit(1000)

  if (body.subscriptionIds?.length) query = query.in('id', body.subscriptionIds)

  const { data: subs, error: subsErr } = await query
  if (subsErr) return json({ error: subsErr.message }, 500)

  // 3) Refresh member_count from club_members for accuracy
  const clubIds = Array.from(new Set((subs || []).map((s: any) => s.club_id)))
  const memberCounts = new Map<string, number>()
  if (clubIds.length) {
    // Fetch billing admin email per club too
    // Billable = active members only. Visitors (tournament/guest records) are
    // never charged for.
    const { data: members } = await supabase
      .from('club_members')
      .select('club_id, email, role')
      .in('club_id', clubIds)
      .neq('role', 'visitor')
      .eq('billing_exempt', false)
      .eq('status', 'active')
      .range(0, 99999)
    for (const m of members || []) {
      memberCounts.set(m.club_id, (memberCounts.get(m.club_id) || 0) + 1)
    }
  }

  // 4) Determine invoice recipients + billing currency per club. Invoices go to the
  //    club billing email (clubs.email), every club admin, and the office bearers
  //    (chairman, secretary, club captain). Currency comes from clubs.currency_code.
  const clubEmails = new Map<string, string>()
  const clubCurrencies = new Map<string, string>()
  const clubCycles = new Map<string, BillingCycle>()
  const officerMemberIds: string[] = []
  const clubOfficerIds = new Map<string, string[]>()
  if (clubIds.length) {
    const { data: clubRows } = await supabase
      .from('clubs')
      .select('id, email, currency_code, sla_billing_option, allow_annual_billing, allow_biannual_billing, chairman_member_id, secretary_member_id, club_captain_member_id')
      .in('id', clubIds)
    for (const c of clubRows || []) {
      if (c.email && String(c.email).trim()) clubEmails.set(c.id, String(c.email).trim())
      clubCurrencies.set(c.id, String((c as any).currency_code || 'ZAR').toUpperCase())
      // The club's chosen billing frequency wins over the plan default, but annual
      // upfront only applies when the platform has enabled it for that club.
      if ((c as any).sla_billing_option) {
        // clubs.sla_billing_option is the single source of truth for invoice
        // frequency — every club may choose monthly / 6-monthly / annual.
        const opt = String((c as any).sla_billing_option)
        const wanted: BillingCycle =
          opt === 'annual_upfront' ? 'annual' : opt === 'biannual_upfront' ? 'biannual' : 'monthly'
        clubCycles.set(c.id, wanted)
      }
      const ids = [
        (c as any).chairman_member_id,
        (c as any).secretary_member_id,
        (c as any).club_captain_member_id,
      ].filter(Boolean) as string[]
      clubOfficerIds.set(c.id, ids)
      officerMemberIds.push(...ids)
    }
  }

  // Club admins (all of them) + office bearers, per club.
  const clubRecipients = new Map<string, Set<string>>()
  const addRecipient = (clubId: string, email?: string | null) => {
    const e = String(email || '').trim().toLowerCase()
    if (!e || !e.includes('@')) return
    if (!clubRecipients.has(clubId)) clubRecipients.set(clubId, new Set())
    clubRecipients.get(clubId)!.add(e)
  }
  if (clubIds.length) {
    const { data: admins } = await supabase
      .from('club_members')
      .select('club_id, email')
      .in('club_id', clubIds)
      .eq('role', 'admin')
      .eq('status', 'active')
      .not('email', 'is', null)
    for (const a of admins || []) addRecipient(a.club_id, a.email)
  }
  if (officerMemberIds.length) {
    const { data: officers } = await supabase
      .from('club_members')
      .select('id, club_id, email')
      .in('id', Array.from(new Set(officerMemberIds)))
      .not('email', 'is', null)
    for (const o of officers || []) addRecipient(o.club_id, o.email)
  }
  for (const [clubId, email] of clubEmails) addRecipient(clubId, email)

  // Club-managed billing profile (Club Admin → Subscription → Billing Information).
  // Its emails receive every invoice and its primary email becomes the "To" address.
  const clubBillingProfiles = new Map<string, any>()
  if (clubIds.length) {
    const { data: profiles } = await supabase
      .from('club_billing_profiles')
      .select('*')
      .in('club_id', clubIds)
    for (const p of profiles || []) {
      clubBillingProfiles.set(p.club_id, p)
      for (const e of (p.emails || [])) addRecipient(p.club_id, e)
    }
  }

  /** Primary "To" address — billing profile first, then the club billing email. */
  const recipientFor = (clubId: string) => {
    const profileEmail = (clubBillingProfiles.get(clubId)?.emails || [])[0]
    if (profileEmail) return String(profileEmail).trim().toLowerCase()
    const billing = clubEmails.get(clubId)
    if (billing) return billing.trim().toLowerCase()
    const set = clubRecipients.get(clubId)
    return set && set.size ? Array.from(set)[0] : null
  }
  /**
   * Everyone who should receive a copy of this club's invoice.
   * The platform billing mailbox always gets a copy for record-keeping.
   */
  const PLATFORM_COPY_EMAIL = 'admin@stratsol.co.za'
  const recipientsFor = (clubId: string) => {
    const set = new Set(clubRecipients.get(clubId) || [])
    set.add(PLATFORM_COPY_EMAIL)
    return Array.from(set)
  }



  const results: any[] = []
  let issued = 0
  let skipped = 0
  let failed = 0

  const yearStr = billingDate.getFullYear().toString()

  // Billing starts the DAY AFTER each club's trial ends.
  // e.g. trial ends 11 Aug 2026 → first invoice issued 12 Aug 2026 covering 12 Aug – 11 Sep.
  const dayAfter = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)


  // --- Consolidated monthly billing -------------------------------------
  // One invoice per club per billing month: subscription (renewal months only)
  // + WhatsApp usage for the PREVIOUS calendar month (billed in arrears).
  const billingMonth = monthStartIso(billingDate)
  const waRangeMonth = previousMonthRange(billingDate)
  // Because invoices are issued a few days early, the arrears month is not
  // complete yet at run time. We bill every unbilled message up to the moment of
  // issuing; anything after that is picked up by the next invoice.
  const waCutoff = runDate < new Date(`${waRangeMonth.end}T23:59:59.999Z`)
    ? runDate.toISOString()
    : `${waRangeMonth.end}T23:59:59.999Z`
  const waRange = { start: waRangeMonth.start, end: waCutoff.slice(0, 10) }

  // Existing invoice for this club + month → idempotency. A previously failed
  // invoice is retried by reusing its row. Because invoices are dated on each
  // club's own renewal date (not the run date), we index every month.
  const existingByClubMonth = new Map<string, any>()
  if (clubIds.length) {
    const { data: existing } = await supabase
      .from('platform_subscription_invoices')
      .select('id, club_id, invoice_number, status, billing_month')
      .in('club_id', clubIds)
    for (const e of existing || []) existingByClubMonth.set(`${e.club_id}|${e.billing_month}`, e)
  }


  // Unbilled WhatsApp usage per club for the previous month.
  const waUsage = new Map<
    string,
    { count: number; amount: number; utility: number; service: number; marketing: number; ids: string[] }
  >()
  if (clubIds.length) {
    const { data: waRows } = await supabase
      .from('whatsapp_send_log')
      .select('id, club_id, category, unit_cost')
      .in('club_id', clubIds)
      .eq('status', 'sent')
      .eq('billable', true)
      .is('platform_invoice_id', null)
      .is('invoice_id', null)
      .gte('created_at', `${waRange.start}T00:00:00Z`)
      .lt('created_at', waCutoff)

      .range(0, 99999)
    for (const r of waRows || []) {
      const cur =
        waUsage.get(r.club_id) ?? { count: 0, amount: 0, utility: 0, service: 0, marketing: 0, ids: [] }
      cur.count++
      cur.amount += Number(r.unit_cost || 0)
      if (r.category === 'utility') cur.utility++
      else if (r.category === 'service') cur.service++
      else if (r.category === 'marketing') cur.marketing++
      cur.ids.push(r.id)
      waUsage.set(r.club_id, cur)
    }
  }

  // Get current invoice count for this year to build sequential numbers
  const { count: existingCount } = await supabase
    .from('platform_subscription_invoices')
    .select('id', { count: 'exact', head: true })
    .gte('issued_at', `${yearStr}-01-01`)
    .lte('issued_at', `${yearStr}-12-31`)
  let seq = (existingCount || 0) + 1

  for (const sub of (subs as any[]) || []) {
    try {
      const plan = sub.subscription_plans
      const club = sub.clubs
      if (!plan) {
        skipped++
        results.push({ subscription_id: sub.id, status: 'skipped', reason: 'No plan assigned' })
        continue
      }

      const memberCount = memberCounts.get(sub.club_id) ?? sub.member_count ?? 0
      const cap = plan.max_billable_members ? Number(plan.max_billable_members) : null
      const billableMembers = cap && cap > 0 ? Math.min(memberCount, cap) : memberCount

      // Per-club display currency + rate (what the admin sees, e.g. "$0.35/member").
      // We always CHARGE in ZAR because Stitch only accepts ZAR — convert the local
      // total to ZAR via the configured FX rate.
      const displayCurrency = clubCurrencies.get(sub.club_id) || 'ZAR'
      const cycle: BillingCycle =
        clubCycles.get(sub.club_id) ??
        (plan.billing_cycle === 'annual'
          ? 'annual'
          : plan.billing_cycle === 'biannual'
            ? 'biannual'
            : 'monthly')
      const planPriceZar = +Number(plan.price_per_member).toFixed(2)
      const planMinZar = +Number(plan.minimum_charge || 0).toFixed(2)
      const flatRateLocal = +rateFor(displayCurrency, cycle, planPriceZar).toFixed(2)

      // Graduated bands take precedence when enabled and configured for the currency.
      const tiers = tiersEnabled ? tiersFor(displayCurrency, cycle) : null
      const tierMin = tiers ? tierMinFor(displayCurrency, cycle) : null
      const minimumChargeLocal = +(tiers && tierMin != null
        ? tierMin
        : minChargeFor(cycle, planMinZar)
      ).toFixed(2)

      // Tier/flat rates are quoted per member per MONTH. Upfront invoices cover
      // 6 (biannual) or 12 (annual) months, so multiply the monthly-equivalent.
      const months = CYCLE_MONTHS[cycle]
      const grossLocal = tiers
        ? graduatedTotal(billableMembers, tiers)
        : billableMembers * flatRateLocal
      const monthlyEquivalent = +Math.max(grossLocal, minimumChargeLocal).toFixed(2)
      const subtotalLocal = +(monthlyEquivalent * months).toFixed(2)
      // Effective (blended) per-member rate — what appears on the invoice line.
      const pricePerMemberLocal = billableMembers > 0
        ? +(subtotalLocal / billableMembers).toFixed(2)
        : +(flatRateLocal * months).toFixed(2)

      // Convert to ZAR (actual charge currency).
      const fxRate = fxToZar(displayCurrency)
      const billingCurrency = 'ZAR'
      const pricePerMemberZar = +(pricePerMemberLocal * fxRate).toFixed(2)
      const minimumChargeZar = +(minimumChargeLocal * fxRate).toFixed(2)
      const subscriptionZar = +(subtotalLocal * fxRate).toFixed(2)

      // The first billable period starts the DAY AFTER the trial ends; afterwards
      // we continue from the last invoiced period_end.
      const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null
      const firstBillableStart = trialEnd ? dayAfter(trialEnd) : null
      let periodStart: Date
      const lastEnd = sub.current_period_end ? new Date(sub.current_period_end) : null
      if (firstBillableStart && (!lastEnd || lastEnd < firstBillableStart)) {
        periodStart = firstBillableStart
      } else if (lastEnd) {
        periodStart = new Date(Date.UTC(lastEnd.getUTCFullYear(), lastEnd.getUTCMonth(), lastEnd.getUTCDate()))
      } else {
        periodStart = new Date(Date.UTC(billingDate.getUTCFullYear(), billingDate.getUTCMonth(), billingDate.getUTCDate()))
      }

      const periodEnd = addBillingMonths(periodStart, cycle)

      // A real run bills every renewal that falls before the NEXT send run.
      // A dry run (preview) always projects the upcoming invoice, however far
      // away the renewal is, so admins can inspect it at any time.
      const subDueForRun = iso(periodStart) <= iso(coverageEnd)
      const subDue = dryRun ? true : subDueForRun
      // The send run that will actually create/email this invoice: the fixed
      // issue day on or before the renewal date. If that day has already passed
      // (overdue), it goes out with the very next run.
      const scheduledSend = (() => {
        const candidate = issueDayOnOrBefore(periodStart)
        return candidate < today ? today : candidate
      })()


      // Every subscription invoice is DATED on the club's renewal date.
      // WhatsApp-only invoices stay on the run's billing date.
      const invoiceDate = subDue ? periodStart : billingDate
      const invoiceMonth = monthStartIso(invoiceDate)



      const usage = waUsage.get(sub.club_id)
      const consolidated = buildConsolidatedInvoice({
        subscription: {
          due: subDue,
          planName: plan.name,
          billingCycle: cycle,
          memberCount: billableMembers,
          pricePerMember: pricePerMemberZar,
          amount: subscriptionZar,
          periodStart: iso(periodStart),
          periodEnd: iso(periodEnd),
        },
        whatsapp: usage
          ? {
              messageCount: usage.count,
              amount: +usage.amount.toFixed(2),
              periodStart: waRange.start,
              periodEnd: waRange.end,
              utilityCount: usage.utility,
              serviceCount: usage.service,
              marketingCount: usage.marketing,
            }
          : null,
        vatRate,
      })

      // Nothing to bill this month at all (no renewal, no WhatsApp usage).
      if (consolidated.skip) {
        skipped++
        results.push({
          subscription_id: sub.id,
          club: club?.name,
          status: 'skipped',
          reason: subDue ? 'Nothing billable this month' : `Next renewal ${iso(periodStart)}`,
          billing_cycle: cycle,
          period_start: iso(periodStart),
          period_end: iso(periodEnd),
          next_renewal: iso(periodStart),
          scheduled_send: iso(scheduledSend),
          in_this_run: subDueForRun,
        })

        continue
      }

      const subtotal = consolidated.subtotal
      const vatAmount = consolidated.vatAmount
      const total = consolidated.total
      const displayTotal = +((subtotal + vatAmount) / (fxRate || 1)).toFixed(2)

      // Fixed due date: the 7th of the month. Invoices are SENT on the fixed
      // issue day (25th) and fall due on the 7th of the following month —
      // but never earlier than the invoice's own date (mid-month renewals).
      const dueDate = (() => {
        let d = new Date(Date.UTC(scheduledSend.getUTCFullYear(), scheduledSend.getUTCMonth() + 1, 7))
        while (d < invoiceDate) {
          d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 7))
        }
        return d
      })()

      // Idempotency: one invoice per club per billing month. An existing issued
      // or paid invoice is left alone; a failed one is retried in place.
      const prior = existingByClubMonth.get(`${sub.club_id}|${invoiceMonth}`)
      if (!dryRun && prior && prior.status !== 'failed') {
        skipped++
        results.push({
          subscription_id: sub.id,
          club: club?.name,
          invoice_number: prior.invoice_number,
          status: 'skipped',
          reason: `Already invoiced for ${invoiceMonth}`,
        })
        continue
      }

      const invoiceNumber = prior?.invoice_number || `${invoicePrefix}${yearStr}-${String(seq).padStart(5, '0')}`

      if (dryRun) {
        results.push({
          subscription_id: sub.id,
          club: club?.name,
          invoice_number: invoiceNumber,
          billing_month: invoiceMonth,

          invoice_kind: consolidated.kind,
          billing_cycle: cycle,
          period_start: iso(periodStart),
          period_end: iso(periodEnd),
          next_renewal: iso(periodEnd),
          subscription_due: subDue,
          in_this_run: subDueForRun,
          scheduled_send: iso(scheduledSend),
          issue_date: iso(invoiceDate),
          due_date: iso(dueDate),

          line_items: consolidated.lineItems,
          member_count: memberCount,
          currency: billingCurrency,
          price_per_member: pricePerMemberZar,
          subscription_amount: consolidated.subscriptionAmount,
          whatsapp_amount: consolidated.whatsappAmount,
          whatsapp_message_count: consolidated.whatsappMessageCount,
          subtotal,
          vat: vatAmount,
          total,
          display_currency: displayCurrency,
          display_price_per_member: pricePerMemberLocal,
          display_total: displayTotal,
          fx_rate_to_zar: fxRate,
          status: 'dry-run',
        })
        seq++
        continue
      }

      // Insert invoice record — stored in ZAR (what Stitch charges), with the
      // original local-currency amounts kept for display on the invoice/email.
      const invoicePayload = {
        invoice_number: invoiceNumber,
        club_id: sub.club_id,
        subscription_id: sub.id,
        plan_id: sub.plan_id,
        plan_name: plan.name,
        billing_cycle: cycle,
        billing_month: invoiceMonth,
        invoice_kind: consolidated.kind,
        line_items: consolidated.lineItems,
        subscription_amount: consolidated.subscriptionAmount,
        whatsapp_amount: consolidated.whatsappAmount,
        whatsapp_message_count: consolidated.whatsappMessageCount,
        period_start: consolidated.subscriptionAmount > 0 ? iso(periodStart) : waRange.start,
        period_end: consolidated.subscriptionAmount > 0 ? iso(periodEnd) : waRange.end,
        member_count: billableMembers,
        price_per_member: pricePerMemberZar,
        minimum_charge: minimumChargeZar,
        subtotal,
        vat_amount: vatAmount,
        total,
        currency: billingCurrency,
        display_currency: displayCurrency,
        display_price_per_member: pricePerMemberLocal,
        display_total: displayTotal,
        fx_rate_to_zar: fxRate,
        due_date: dueDate.toISOString().slice(0, 10),
        // Dated on the renewal date even though it is emailed a few days earlier.
        issued_at: invoiceDate.toISOString(),

        snapshot: settings,
        // Snapshot of the club's billing details at issue time so past
        // invoices keep the address/VAT/PO that applied then.
        billing_details: clubBillingProfiles.get(sub.club_id) ?? null,
        status: 'issued',
      }

      let inv: any
      if (prior) {
        const { data, error } = await supabase
          .from('platform_subscription_invoices')
          .update(invoicePayload)
          .eq('id', prior.id)
          .select()
          .single()
        if (error) throw error
        inv = data
      } else {
        const { data, error } = await supabase
          .from('platform_subscription_invoices')
          .insert(invoicePayload)
          .select()
          .single()
        if (error) throw error
        inv = data
      }

      // Mark the WhatsApp usage as billed so it can never be charged twice.
      if (usage?.ids.length) {
        await supabase
          .from('whatsapp_send_log')
          .update({ platform_invoice_id: inv.id })
          .in('id', usage.ids)
      }



      // Build the club's subscription management URL (for the email fallback link
      // and Stitch redirect after payment).
      const subdomain = (club as any)?.subdomain as string | undefined
      const baseManage = subdomain
        ? `https://${subdomain}.squashhub.co.za/club-admin?tab=subscription`
        : `https://squashhub.co.za/club-admin?tab=subscription`
      const manageUrl = `${baseManage}&pay=${inv.id}`

      // Try to create a Stitch payment link so the invoice email has a "Pay" button.
      // Best-effort — if it fails (creds missing / API down), we fall back to manageUrl.
      let payLink: string | null = null
      try {
        payLink = await createStitchPayLink({
          stitchCreds,
          amountZar: total,
          currency: billingCurrency,
          invoiceNumber,
          returnUrl: manageUrl,
        })
        if (payLink) {
          await supabase
            .from('platform_subscription_invoices')
            .update({ stitch_payment_link: payLink })
            .eq('id', inv.id)
        }
      } catch (e) {
        console.warn('Stitch pay link failed for', invoiceNumber, (e as any)?.message)
      }

      // Email the invoice to the club billing address, all club admins and the
      // office bearers (chairman, secretary, club captain). One send per recipient,
      // each with its own idempotency key so retries never duplicate.
      const recipient = recipientFor(sub.club_id)
      const recipients = recipientsFor(sub.club_id)
      let emailStatus: string | null = null
      if (recipients.length) {
        const templateData = {
          clubName: club?.name,
          invoiceNumber,
          planName: plan.name,
          billingCycle: cycle,
          periodStart: inv.period_start,
          periodEnd: inv.period_end,
          memberCount: billableMembers,
          pricePerMember: pricePerMemberZar,
          minimumCharge: minimumChargeZar,
          lineItems: consolidated.lineItems,
          invoiceKind: consolidated.kind,
          subscriptionAmount: consolidated.subscriptionAmount,
          whatsappAmount: consolidated.whatsappAmount,
          whatsappMessageCount: consolidated.whatsappMessageCount,
          subtotal,
          vatAmount,
          total,
          currency: billingCurrency,
          displayCurrency,
          displayPricePerMember: pricePerMemberLocal,
          displayTotal,
          fxRateToZar: fxRate,
          dueDate: inv.due_date,
          companyName: settings.company_name,
          tradingAs: settings.trading_as,
          vatNumber: settings.vat_number,
          registrationNumber: settings.registration_number,
          billingEmail: settings.email,
          billingPhone: settings.phone,
          address: settings.address,
          bankName: settings.bank_name,
          bankAccountName: settings.bank_account_name,
          bankAccountNumber: settings.bank_account_number,
          bankBranchCode: settings.bank_branch_code,
          bankSwift: settings.bank_swift,
          logoUrl: settings.logo_url,
          invoiceFooter: settings.invoice_footer,
          payLink: payLink || undefined,
          manageUrl,
        }
        let ok = 0
        const failures: string[] = []
        for (const to of recipients) {
          const slug = to.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
          const result = await sendAppEmail({
            templateName: 'subscription-invoice',
            recipientEmail: to,
            clubId: (inv as any).club_id ?? null,
            idempotencyKey: `sub-invoice-${inv.id}-${slug}`,
            templateData,
          })
          if (!result.ok) failures.push(`${to}: ${result.error}`)
          else ok++
        }
        emailStatus = failures.length
          ? `queued ${ok}/${recipients.length}; failed: ${failures.join(' | ')}`.slice(0, 500)
          : `queued to ${ok} recipient${ok === 1 ? '' : 's'}`
      } else {
        emailStatus = 'no-recipient-email'
      }

      await supabase
        .from('platform_subscription_invoices')
        .update({ email_sent_at: recipient ? new Date().toISOString() : null, email_status: emailStatus })
        .eq('id', inv.id)


      // Advance the subscription period ONLY when the subscription was actually
      // charged. WhatsApp-only invoices must not move a 6-monthly/annual club's
      // renewal date forward.
      if (consolidated.subscriptionAmount > 0) {
        await supabase
          .from('club_subscriptions')
          .update({
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            member_count: memberCount,
            amount_due: total,
            status: sub.status === 'trial' ? 'active' : sub.status,
          })
          .eq('id', sub.id)
      } else {
        await supabase
          .from('club_subscriptions')
          .update({ member_count: memberCount })
          .eq('id', sub.id)
      }

      issued++
      if (!prior) seq++
      results.push({
        subscription_id: sub.id,
        club: club?.name,
        invoice_number: invoiceNumber,
        invoice_kind: consolidated.kind,
        subscription_amount: consolidated.subscriptionAmount,
        whatsapp_amount: consolidated.whatsappAmount,
        total,
        email_status: emailStatus,
        status: 'issued',
      })
    } catch (e: any) {
      failed++
      results.push({ subscription_id: sub.id, status: 'failed', error: e.message || String(e) })
    }
  }

  return json({
    dryRun,
    run_date: iso(runDate),
    issue_date: iso(billingDate),
    billing_month: billingMonth,
    issue_day_of_month: issueDay,
    is_issue_day: isIssueDay,
    next_issue_date: iso(nextIssueDate),
    coverage_end: iso(coverageEnd),

    vat_rate: vatRate,
    processed: (subs || []).length,
    issued,
    skipped,
    failed,
    results,
  })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

const STITCH_BASE = 'https://express.stitch.money/api/v1'

async function createStitchPayLink(opts: {
  stitchCreds: any
  amountZar: number
  currency: string
  invoiceNumber: string
  returnUrl: string
}): Promise<string | null> {
  const { stitchCreds, amountZar, currency, invoiceNumber, returnUrl } = opts
  if (!stitchCreds) return null
  const clientId = String(stitchCreds.client_id || '').trim()
  const clientSecret = String(stitchCreds.client_secret || '').trim()
  const enabled = Boolean(stitchCreds.enabled)
  if (!enabled || !clientId || !clientSecret) return null

  const amountCents = Math.round(Number(amountZar || 0) * 100)
  if (amountCents < 100) return null

  const tokenResp = await fetch(`${STITCH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret, scope: 'client_paymentrequest' }),
  })
  const tokenJson: any = await tokenResp.json().catch(() => ({}))
  if (!tokenResp.ok || !tokenJson?.data?.accessToken) return null
  const accessToken: string = tokenJson.data.accessToken

  const plResp = await fetch(`${STITCH_BASE}/payment-links`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountCents,
      payerName: 'Club Subscription',
      merchantReference: String(invoiceNumber).slice(0, 50),
      merchantRedirectUrl: returnUrl,
      redirectUrl: returnUrl,
      currency: currency || 'ZAR',
    }),
  })
  const plJson: any = await plResp.json().catch(() => ({}))
  if (!plResp.ok || !plJson?.success || !plJson?.data?.payment?.link) return null
  return plJson.data.payment.link
}
