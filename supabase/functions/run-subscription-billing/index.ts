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
      `id, club_id, plan_id, status, current_period_start, current_period_end, member_count,
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
    const { data: members } = await supabase
      .from('club_members')
      .select('club_id, email, role')
      .in('club_id', clubIds)
      .range(0, 99999)
    for (const m of members || []) {
      memberCounts.set(m.club_id, (memberCounts.get(m.club_id) || 0) + 1)
    }
  }

  // 4) Determine invoice recipient + billing currency per club: prefer clubs.email
  //    (tenant billing email), fall back to the first admin's email. Currency comes
  //    from clubs.currency_code (default ZAR).
  const clubEmails = new Map<string, string>()
  const clubCurrencies = new Map<string, string>()
  if (clubIds.length) {
    const { data: clubRows } = await supabase
      .from('clubs')
      .select('id, email, currency_code')
      .in('id', clubIds)
    for (const c of clubRows || []) {
      if (c.email && String(c.email).trim()) clubEmails.set(c.id, String(c.email).trim())
      clubCurrencies.set(c.id, String((c as any).currency_code || 'ZAR').toUpperCase())
    }
  }
  const adminEmails = new Map<string, string>()
  if (clubIds.length) {
    const { data: admins } = await supabase
      .from('club_members')
      .select('club_id, email')
      .in('club_id', clubIds)
      .eq('role', 'admin')
      .not('email', 'is', null)
    for (const a of admins || []) {
      if (!adminEmails.has(a.club_id)) adminEmails.set(a.club_id, a.email)
    }
  }
  const recipientFor = (clubId: string) => clubEmails.get(clubId) || adminEmails.get(clubId) || null

  const results: any[] = []
  let issued = 0
  let skipped = 0
  let failed = 0

  const yearStr = billingDate.getFullYear().toString()

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

      // Per-club billing currency + rate
      const billingCurrency = clubCurrencies.get(sub.club_id) || 'ZAR'
      const cycle = (plan.billing_cycle === 'annual' ? 'annual' : 'monthly') as 'monthly' | 'annual'
      const planPriceZar = +Number(plan.price_per_member).toFixed(2)
      const planMinZar = +Number(plan.minimum_charge || 0).toFixed(2)
      const pricePerMemberLocal = +rateFor(billingCurrency, cycle, planPriceZar).toFixed(2)
      const minimumChargeLocal = +minChargeFor(cycle, planMinZar).toFixed(2)

      const gross = billableMembers * pricePerMemberLocal
      const subtotal = +Math.max(gross, minimumChargeLocal).toFixed(2)
      const vatAmount = +(subtotal * vatRate).toFixed(2)
      const total = +(subtotal + vatAmount).toFixed(2)

      // Determine billing period (next cycle after last period_end, or from billingDate)
      const periodStart = new Date(sub.current_period_end || billingDate)
      const periodEnd = new Date(periodStart)
      if (plan.billing_cycle === 'annual') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1)
      }
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
          price_per_member: pricePerMemberLocal,
          subtotal,
          vat: vatAmount,
          total,
          status: 'dry-run',
        })
        seq++
        continue
      }

      // Insert invoice record
      const { data: inv, error: invErr } = await supabase
        .from('platform_subscription_invoices')
        .insert({
          invoice_number: invoiceNumber,
          club_id: sub.club_id,
          subscription_id: sub.id,
          plan_id: sub.plan_id,
          plan_name: plan.name,
          billing_cycle: plan.billing_cycle,
          period_start: periodStart.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
          member_count: billableMembers,
          price_per_member: pricePerMemberLocal,
          minimum_charge: minimumChargeLocal,
          subtotal,
          vat_amount: vatAmount,
          total,
          currency: billingCurrency,
          due_date: dueDate.toISOString().slice(0, 10),
          snapshot: settings,
          status: 'issued',
        })
        .select()
        .single()

      if (invErr) throw invErr

      // Build the club's subscription management URL (for the email fallback link
      // and Stitch redirect after payment).
      const subdomain = (club as any)?.subdomain as string | undefined
      const manageUrl = subdomain
        ? `https://${subdomain}.squashhub.co.za/club-admin?tab=subscription`
        : `https://squashhub.co.za/club-admin?tab=subscription`

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

      // Email admin
      const recipient = recipientFor(sub.club_id)
      let emailStatus: string | null = null
      if (recipient) {
        const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'subscription-invoice',
            recipientEmail: recipient,
            idempotencyKey: `sub-invoice-${inv.id}`,
            templateData: {
              clubName: club?.name,
              invoiceNumber,
              planName: plan.name,
              billingCycle: plan.billing_cycle,
              periodStart: inv.period_start,
              periodEnd: inv.period_end,
              memberCount: billableMembers,
              pricePerMember: pricePerMemberLocal,
              minimumCharge: minimumChargeLocal,
              subtotal,
              vatAmount,
              total,
              currency: billingCurrency,
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
            },
          },
        })
        emailStatus = sendErr ? `failed: ${sendErr.message}` : 'queued'
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
