// Resend an existing subscription invoice email (super-admin only).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Auth check — must be platform admin
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'unauthorized' }, 401)
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle()
    if (!roleData) return json({ error: 'forbidden' }, 403)

    const { invoice_id, override_email } = await req.json()
    if (!invoice_id) return json({ error: 'invoice_id required' }, 400)

    // Load invoice
    const { data: inv, error: iErr } = await supabase
      .from('platform_subscription_invoices')
      .select('*, clubs:club_id(name, subdomain, email)')
      .eq('id', invoice_id)
      .maybeSingle()
    if (iErr || !inv) return json({ error: iErr?.message || 'invoice not found' }, 404)

    // Load platform invoice settings
    const { data: settingsRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'platform_invoice_settings')
      .maybeSingle()
    const settings = settingsRow?.value ? (typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value) : {}

    // Resolve recipient
    const club = inv.clubs as any
    const recipient = (override_email && String(override_email).trim()) || club?.billing_email || club?.email
    if (!recipient) return json({ error: 'No recipient email on file for this club' }, 400)

    const subdomain = club?.subdomain
    const baseManage = subdomain
      ? `https://${subdomain}.squashhub.co.za/club-admin?tab=subscription`
      : `https://squashhub.co.za/club-admin?tab=subscription`
    const manageUrl = `${baseManage}&pay=${inv.id}`

    const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'subscription-invoice',
        recipientEmail: recipient,
        idempotencyKey: `sub-invoice-${inv.id}-resend-${Date.now()}`,
        templateData: {
          clubName: club?.name,
          invoiceNumber: inv.invoice_number,
          planName: inv.plan_name,
          billingCycle: inv.billing_cycle,
          periodStart: inv.period_start,
          periodEnd: inv.period_end,
          memberCount: inv.member_count,
          pricePerMember: Number(inv.price_per_member),
          minimumCharge: Number(inv.minimum_charge),
          subtotal: Number(inv.subtotal),
          vatAmount: Number(inv.vat_amount),
          total: Number(inv.total),
          currency: inv.currency,
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
          payLink: inv.stitch_payment_link || undefined,
          manageUrl,
        },
      },
    })

    const emailStatus = sendErr ? `failed: ${sendErr.message}` : 'resent'
    await supabase
      .from('platform_subscription_invoices')
      .update({ email_sent_at: sendErr ? inv.email_sent_at : new Date().toISOString(), email_status: emailStatus })
      .eq('id', inv.id)

    if (sendErr) return json({ error: sendErr.message }, 500)
    return json({ ok: true, recipient })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
