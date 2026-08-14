import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface RequestBody {
  dryRun?: boolean
  subscriptionIds?: string[]
  billingDate?: string // ISO date; defaults to today
  vatRate?: number // 0..1 override; falls back to settings/0
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
  const billingDate = body.billingDate ? new Date(body.billingDate) : new Date()

  // 1) Load platform invoice settings + per-currency SaaS rates. Base is ZAR;
  //    USD/EUR clubs are billed at their configured rate.
  const { data: allSettings, error: settingErr } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'platform_invoice_settings',
      'platform_stitch_private_settings',
      'saas_rate_zar_monthly', 'saas_rate_zar_annual',
      'saas_rate_usd_monthly', 'saas_rate_usd_annual',
      'saas_rate_eur_monthly', 'saas_rate_eur_annual',
      'saas_min_charge_monthly', 'saas_min_charge_annual',
      'fx_usd_to_zar', 'fx_eur_to_zar',
      // Graduated ("sliding scale") pricing — when enabled these override the flat rates.
      'saas_tiers_enabled',
      'saas_tiers_zar_monthly', 'saas_tiers_zar_annual',
      'saas_tiers_usd_monthly', 'saas_tiers_usd_annual',
      'saas_tiers_eur_monthly', 'saas_tiers_eur_annual',
      'saas_tier_min_zar_monthly', 'saas_tier_min_zar_annual',
      'saas_tier_min_usd_monthly', 'saas_tier_min_usd_annual',
      'saas_tier_min_eur_monthly', 'saas_tier_min_eur_annual',
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

  // Per-currency rate resolver. Falls back to plan.price_per_member (ZAR base) if unset.
  const num = (k: string, d: number) => {
    const v = settingsMap.get(k)
    const n = v == null ? NaN : Number(v)
    return isFinite(n) && n > 0 ? n : d
  }
  const rateFor = (ccy: string, cycle: 'monthly' | 'annual', fallback: number): number => {
    const c = (ccy || 'ZAR').toUpperCase()
    if (c === 'USD') return num(`saas_rate_usd_${cycle}`, cycle === 'monthly' ? 0.35 : 0.30)
    if (c === 'EUR') return num(`saas_rate_eur_${cycle}`, cycle === 'monthly' ? 0.32 : 0.27)
    return num(`saas_rate_zar_${cycle}`, fallback)
  }
  const minChargeFor = (cycle: 'monthly' | 'annual', fallback: number): number =>
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
  const tiersFor = (ccy: string, cycle: 'monthly' | 'annual'): Array<{ upTo: number | null; rate: number }> | null => {
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
  const tierMinFor = (ccy: string, cycle: 'monthly' | 'annual'): number | null => {
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
  const clubCycles = new Map<string, 'monthly' | 'annual'>()
  const officerMemberIds: string[] = []
  const clubOfficerIds = new Map<string, string[]>()
  if (clubIds.length) {
    const { data: clubRows } = await supabase
      .from('clubs')
      .select('id, email, currency_code, sla_billing_option, allow_annual_billing, chairman_member_id, secretary_member_id, club_captain_member_id')
      .in('id', clubIds)
    for (const c of clubRows || []) {
      if (c.email && String(c.email).trim()) clubEmails.set(c.id, String(c.email).trim())
      clubCurrencies.set(c.id, String((c as any).currency_code || 'ZAR').toUpperCase())
      // The club's chosen billing frequency wins over the plan default, but annual
      // upfront only applies when the platform has enabled it for that club.
      if ((c as any).sla_billing_option) {
        const wantsAnnual = (c as any).sla_billing_option === 'annual_upfront'
        const annualAllowed = (c as any).allow_annual_billing === true
        clubCycles.set(c.id, wantsAnnual && annualAllowed ? 'annual' : 'monthly')
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
  /** Everyone who should receive a copy of this club's invoice. */
  const recipientsFor = (clubId: string) => Array.from(clubRecipients.get(clubId) || [])


  const results: any[] = []
  let issued = 0
  let skipped = 0
  let failed = 0

  const yearStr = billingDate.getFullYear().toString()

  // Billing starts the DAY AFTER each club's trial ends.
  // e.g. trial ends 11 Aug 2026 → first invoice issued 12 Aug 2026 covering 12 Aug – 11 Sep.
  const dayAfter = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const billingDay = iso(billingDate)



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
      const cycle = (clubCycles.get(sub.club_id) ?? (plan.billing_cycle === 'annual' ? 'annual' : 'monthly')) as 'monthly' | 'annual'
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

      // Tier/flat rates are quoted per member per MONTH. An annual-upfront
      // invoice covers 12 months, so multiply the monthly-equivalent by 12.
      const months = cycle === 'annual' ? 12 : 1
      const grossLocal = tiers
        ? graduatedTotal(billableMembers, tiers)
        : billableMembers * flatRateLocal
      const monthlyEquivalent = +Math.max(grossLocal, minimumChargeLocal).toFixed(2)
      const subtotalLocal = +(monthlyEquivalent * months).toFixed(2)
      // Effective (blended) per-member rate — what appears on the invoice line.
      const pricePerMemberLocal = billableMembers > 0
        ? +(subtotalLocal / billableMembers).toFixed(2)
        : +(flatRateLocal * months).toFixed(2)

      const vatLocal = +(subtotalLocal * vatRate).toFixed(2)
      const displayTotal = +(subtotalLocal + vatLocal).toFixed(2)

      // Convert to ZAR (actual charge currency).
      const fxRate = fxToZar(displayCurrency)
      const billingCurrency = 'ZAR'
      const pricePerMemberZar = +(pricePerMemberLocal * fxRate).toFixed(2)
      const minimumChargeZar = +(minimumChargeLocal * fxRate).toFixed(2)
      const subtotal = +(subtotalLocal * fxRate).toFixed(2)
      const vatAmount = +(vatLocal * fxRate).toFixed(2)
      const total = +(displayTotal * fxRate).toFixed(2)

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


      // Nothing to bill until the period has actually started (invoiced in advance
      // ON the 1st, never before).
      if (!dryRun && billingDay < iso(periodStart)) {
        skipped++
        results.push({
          subscription_id: sub.id,
          club: club?.name,
          status: 'skipped',
          reason: `Billing starts ${iso(periodStart)}`,
        })
        continue
      }

      const periodEnd = cycle === 'annual'
        ? new Date(Date.UTC(periodStart.getUTCFullYear() + 1, periodStart.getUTCMonth(), periodStart.getUTCDate()))
        : new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, periodStart.getUTCDate()))

      const dueDate = new Date(billingDate)
      dueDate.setDate(dueDate.getDate() + 14)

      const invoiceNumber = `${invoicePrefix}${yearStr}-${String(seq).padStart(5, '0')}`

      if (dryRun) {
        results.push({
          subscription_id: sub.id,
          club: club?.name,
          invoice_number: invoiceNumber,
          member_count: memberCount,
          currency: billingCurrency,
          price_per_member: pricePerMemberZar,
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
      const { data: inv, error: invErr } = await supabase
        .from('platform_subscription_invoices')
        .insert({
          invoice_number: invoiceNumber,
          club_id: sub.club_id,
          subscription_id: sub.id,
          plan_id: sub.plan_id,
          plan_name: plan.name,
          billing_cycle: cycle,
          period_start: periodStart.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
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
          snapshot: settings,
          // Snapshot of the club's billing details at issue time so past
          // invoices keep the address/VAT/PO that applied then.
          billing_details: clubBillingProfiles.get(sub.club_id) ?? null,
          status: 'issued',
        })
        .select()
        .single()

      if (invErr) throw invErr


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
          const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
            body: {
              templateName: 'subscription-invoice',
              recipientEmail: to,
              idempotencyKey: `sub-invoice-${inv.id}-${slug}`,
              templateData,
            },
          })
          if (sendErr) failures.push(`${to}: ${sendErr.message}`)
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


      // Advance the subscription period
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

      issued++
      seq++
      results.push({
        subscription_id: sub.id,
        club: club?.name,
        invoice_number: invoiceNumber,
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
