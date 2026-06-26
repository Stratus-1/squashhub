import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let onlyIds: string[] | null = null
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (Array.isArray(body?.ids)) onlyIds = body.ids
    }
  } catch (_) {}

  const today = new Date().toISOString().slice(0, 10)
  let query = supabase
    .from('club_member_fee_payments')
    .select(`
      id, fee_label, amount, invoice_number, invoice_due_date, club_member_id,
      club_members:club_member_id ( id, name, email, club_id,
        clubs:club_id ( name, payment_gateway, subdomain )
      )
    `)
    .eq('paid', false)
    .eq('invoice_email_status', 'pending')
    .limit(500)

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

  let sent = 0
  let failed = 0
  let skipped = 0
  const clubSecretsCache = new Map<string, any>()

  for (const r of rows ?? []) {
    const cm: any = r.club_members
    const club: any = cm?.clubs
    if (!cm?.email || !club) {
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
      const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'membership-renewal-invoice',
          recipientEmail: cm.email,
          idempotencyKey: `renewal-invoice-${r.id}`,
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
            bankReference: secrets.bank_reference || r.invoice_number,
          },
        },
      })
      if (sendErr) throw sendErr

      // Charge member account ledger (debit) — idempotent via reference = invoice number
      const ref = r.invoice_number
      const { data: existingCharge } = await supabase
        .from('member_credit_transactions')
        .select('id')
        .eq('club_id', cm.club_id)
        .eq('reference', ref)
        .eq('type', 'debit')
        .maybeSingle()

      if (!existingCharge) {
        await supabase.from('member_credit_transactions').insert({
          club_id: cm.club_id,
          club_member_id: cm.id,
          user_id: cm.user_id ?? null,
          type: 'debit',
          method: 'invoice',
          amount: r.amount,
          description: `${r.fee_label} — invoice ${ref}`,
          reference: ref,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
      }

      await supabase
        .from('club_member_fee_payments')
        .update({ invoice_email_status: 'sent', invoice_email_sent_at: new Date().toISOString() })
        .eq('id', r.id)
      sent++
    } catch (e) {
      console.error('send failed for', r.id, e)
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
