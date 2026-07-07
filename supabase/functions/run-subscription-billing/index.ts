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

  // 1) Load platform invoice settings
  const { data: settingRow, error: settingErr } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'platform_invoice_settings')
    .maybeSingle()
  if (settingErr && settingErr.code !== 'PGRST116') {
    return json({ error: `Failed to load invoice settings: ${settingErr.message}` }, 500)
  }
  const settings = settingRow?.value ? JSON.parse(settingRow.value) : {}
  const invoicePrefix: string = settings.invoice_prefix || 'INV-'
  const vatRate: number =
    typeof body.vatRate === 'number' ? body.vatRate : settings.vat_number ? 0.15 : 0

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

  // 4) Determine invoice recipient per club: prefer clubs.email (tenant billing email),
  //    fall back to the first admin's email on club_members.
  const clubEmails = new Map<string, string>()
  if (clubIds.length) {
    const { data: clubRows } = await supabase
      .from('clubs')
      .select('id, email')
      .in('id', clubIds)
    for (const c of clubRows || []) {
      if (c.email && String(c.email).trim()) clubEmails.set(c.id, String(c.email).trim())
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
      const gross = billableMembers * Number(plan.price_per_member)
      const subtotal = Math.max(gross, Number(plan.minimum_charge || 0))
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
          price_per_member: plan.price_per_member,
          minimum_charge: plan.minimum_charge,
          subtotal,
          vat_amount: vatAmount,
          total,
          due_date: dueDate.toISOString().slice(0, 10),
          snapshot: settings,
          status: 'issued',
        })
        .select()
        .single()

      if (invErr) throw invErr

      // Email admin
      const recipient = adminEmails.get(sub.club_id)
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
              pricePerMember: plan.price_per_member,
              minimumCharge: plan.minimum_charge,
              subtotal,
              vatAmount,
              total,
              currency: 'ZAR',
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
            },
          },
        })
        emailStatus = sendErr ? `failed: ${sendErr.message}` : 'queued'
      } else {
        emailStatus = 'no-admin-email'
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
