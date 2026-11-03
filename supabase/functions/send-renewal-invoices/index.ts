import { createClient } from 'npm:@supabase/supabase-js@2'
import { invoicePayUrl } from '../_shared/invoice-pay-token.ts'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { buildInvoicePdf } from './invoice-pdf.ts'
import { sendAppEmail } from '../_shared/send-app-email.ts'
import { financialCaller, assertFinanceAdministrator } from '../_shared/chairman-finance.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let onlyIds: string[] | null = null
  let testEmail: string | null = null
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (Array.isArray(body?.ids)) onlyIds = body.ids
      if (typeof body?.test_email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.test_email.trim())) testEmail = body.test_email.trim().toLowerCase()
    }
  } catch (_) {}

  const today = new Date().toISOString().slice(0, 10)
  let query = supabase
    .from('club_member_fee_payments')
    .select(`
      id, fee_label, amount, invoice_number, invoice_due_date, invoice_issued_at, club_member_id,
      club_members:club_member_id ( id, name, email, club_id, user_id,
        clubs:club_id ( name, payment_gateway, subdomain, email, phone, logo_url )
      )
    `)
    .eq('paid', false)
    .limit(500)
  // A copy to another address (test/forward) may also be made of an already-sent, unpaid invoice.
  if (!testEmail) query = query.eq('invoice_email_status', 'pending')

  if (onlyIds && onlyIds.length) {
    query = query.in('id', onlyIds)
  } else {
    query = query.lte('invoice_send_date', today)
  }

  const { data: rows, error } = await query

  if (error) {
    console.error('fetch failed', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }

  try {
    const userId = await financialCaller(req, supabase as any)
    if (testEmail && (!userId || onlyIds?.length !== 1)) throw new Error('Test send needs a signed-in finance administrator and one invoice')
    if (userId) {
      if (!onlyIds?.length) throw new Error('Choose invoices for financial administration')
      const clubs = new Set<string>((rows ?? []).map((r: any) => r.club_members?.club_id).filter(Boolean))
      for (const clubId of clubs) await assertFinanceAdministrator(supabase as any, userId, clubId)
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Financial permission required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  const clubSecretsCache = new Map<string, any>()

  for (const r of rows ?? []) {
    const cm: any = r.club_members
    const club: any = cm?.clubs
    if ((!cm?.email && !testEmail) || !club) {
      skipped++
      continue
    }

    let secrets = clubSecretsCache.get(cm.club_id)
    if (!secrets) {
      const { data: s } = await supabase
        .from('club_secrets')
        .select('bank_name, bank_account_name, bank_account_number, bank_branch_code, bank_reference')
        .eq('club_id', cm.club_id)
        .maybeSingle()
      secrets = s || {}
      clubSecretsCache.set(cm.club_id, secrets)
    }

    try {
      const payNowUrl = club.payment_gateway ? await invoicePayUrl(r.id, club.subdomain) : undefined
      let attachments: { filename: string; content: Uint8Array }[] | undefined
      try {
        const pdfBytes = await buildInvoicePdf({
          clubName: club.name, clubEmail: club.email, clubPhone: club.phone, logoUrl: club.logo_url,
          memberName: cm.name, invoiceNumber: r.invoice_number, issueDate: today, dueDate: r.invoice_due_date,
          description: r.fee_label, amount: Number(r.amount), bankName: secrets.bank_name,
          bankAccountName: secrets.bank_account_name, bankAccountNumber: secrets.bank_account_number,
          bankBranchCode: secrets.bank_branch_code, reference: r.invoice_number || secrets.bank_reference, payNowUrl,
        })
        attachments = [{ filename: `Invoice-${r.invoice_number || r.id}.pdf`, content: pdfBytes }]
      } catch (e) { console.error('invoice pdf failed', r.id, (e as Error).message) }
      const sendResult = await sendAppEmail({
        attachments,
        templateName: 'membership-renewal-invoice',
        recipientEmail: testEmail || cm.email,
        clubId: cm.club_id,
        idempotencyKey: testEmail ? `renewal-invoice-test-${r.id}-${Date.now()}` : `renewal-invoice-${r.id}`,
        templateData: {
            memberName: cm.name,
            clubName: club.name,
            invoiceNumber: r.invoice_number,
            feeLabel: r.fee_label,
            amount: r.amount,
            dueDate: r.invoice_due_date,
            bankName: secrets.bank_name,
            bankAccountName: secrets.bank_account_name,
            bankAccountNumber: secrets.bank_account_number,
            bankBranchCode: secrets.bank_branch_code,
          bankReference: r.invoice_number || secrets.bank_reference,
          payNowUrl,
          paymentUrl: club.subdomain ? `https://${club.subdomain}.squashhub.co.za/my-account` : 'https://squashhub.co.za/my-account',
        },
      })
      if (!sendResult.ok) throw new Error(sendResult.error)
      if (testEmail) { sent++; continue }

      // Atomic: posts member sub-ledger debit AND triggers GL (Dr Debtors / Cr Income)
      const { error: issueErr } = await supabase.rpc('issue_member_invoice', {
        _fee_payment_id: r.id,
      })
      if (issueErr) throw issueErr

      await supabase
        .from('club_member_fee_payments')
        .update({
          invoice_email_status: 'sent',
          invoice_email_sent_at: new Date().toISOString(),
        })
        .eq('id', r.id)

      sent++
    } catch (e) {
      console.error('send failed for', r.id, e)
      if (testEmail) { failed++; continue }
      await supabase
        .from('club_member_fee_payments')
        .update({ invoice_email_status: 'failed' })
        .eq('id', r.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ checked: rows?.length ?? 0, sent, failed, skipped }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
