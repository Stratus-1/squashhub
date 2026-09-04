// Generates (or refreshes) the affiliation invoice a club owes its association
// for a season, and emails it to the club's finance contacts.
//
// Called right after a club submits its teams + players to the association.
// POST { clubId, seasonYear?, email?: boolean }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  try {
    const body = await req.json().catch(() => ({}))
    const clubId: string | undefined = body.clubId
    const shouldEmail: boolean = body.email !== false
    if (!clubId) return json({ error: 'clubId is required' }, 400)

    const { data: userData } = await asUser.auth.getUser()
    if (!userData?.user) return json({ error: 'Not authenticated' }, 401)

    // Resolve the season: the newest submitted league season for this club.
    let seasonYear: number | null = Number.isFinite(Number(body.seasonYear))
      ? Number(body.seasonYear)
      : null
    if (!seasonYear) {
      const { data: leagues } = await admin
        .from('leagues')
        .select('season_year')
        .eq('club_id', clubId)
        .is('archived_at', null)
        .not('submitted_to_association_at', 'is', null)
        .order('season_year', { ascending: false })
        .limit(1)
      seasonYear = leagues?.[0]?.season_year ?? new Date().getFullYear()
    }

    const { data: gen, error: genErr } = await asUser.rpc('generate_club_association_invoice', {
      _club_id: clubId,
      _season_year: seasonYear,
    })
    if (genErr) return json({ error: genErr.message }, 400)

    const row = Array.isArray(gen) ? gen[0] : gen
    if (!row?.invoice_id) return json({ ok: true, invoice: null, reason: 'no_affiliation' })

    const { data: invoice } = await admin
      .from('club_association_invoices')
      .select('*')
      .eq('id', row.invoice_id)
      .maybeSingle()

    const { data: lines } = await admin
      .from('club_association_invoice_lines')
      .select('label, basis, units, unit_amount, amount')
      .eq('invoice_id', row.invoice_id)
      .order('basis')

    if (!shouldEmail || !invoice || Number(invoice.total_amount) <= 0) {
      return json({ ok: true, invoice, lines: lines ?? [], emailed: [] })
    }

    // Finance recipients: club email, treasurer, and club admins.
    const { data: club } = await admin
      .from('clubs')
      .select('name, email, treasurer_member_id, currency')
      .eq('id', clubId)
      .maybeSingle()

    const { data: association } = await admin
      .from('clubs')
      .select('name')
      .eq('id', invoice.association_tenant_id)
      .maybeSingle()

    const recipients = new Set<string>()
    if (club?.email) recipients.add(String(club.email).trim().toLowerCase())

    if (club?.treasurer_member_id) {
      const { data: treasurer } = await admin
        .from('club_members')
        .select('email')
        .eq('id', club.treasurer_member_id)
        .maybeSingle()
      if (treasurer?.email) recipients.add(String(treasurer.email).trim().toLowerCase())
    }

    const { data: admins } = await admin
      .from('club_members')
      .select('email')
      .eq('club_id', clubId)
      .eq('role', 'admin')
      .not('email', 'is', null)
      .limit(10)
    for (const a of admins ?? []) {
      if (a.email) recipients.add(String(a.email).trim().toLowerCase())
    }

    const currency = club?.currency === 'USD' ? '$' : 'R'
    const issuedAt = invoice.issued_at
      ? new Date(invoice.issued_at).toLocaleDateString('en-ZA', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : ''

    const emailed: string[] = []
    for (const to of recipients) {
      const result = await sendAppEmail({
        templateName: 'association-invoice',
        recipientEmail: to,
        clubId,
        templateData: {
          clubName: club?.name ?? 'Your club',
          associationName: association?.name ?? 'Your association',
          invoiceNumber: invoice.invoice_number,
          seasonYear: invoice.season_year,
          issuedAt,
          currency,
          total: Number(invoice.total_amount),
          lines: lines ?? [],
        },
        idempotencyKey: `assoc-invoice-${invoice.id}-${invoice.total_amount}-${to}`,
      })
      if (result.ok && result.sent) emailed.push(to)
      else if (!result.ok) console.error('invoice email failed', { to, error: result.error })
    }

    if (emailed.length) {
      const { error: upErr } = await admin
        .from('club_association_invoices')
        .update({ emailed_at: new Date().toISOString(), emailed_to: emailed.join(', ') })
        .eq('id', invoice.id)
      if (upErr) console.error('invoice email stamp failed', upErr.message)
    }

    return json({ ok: true, invoice, lines: lines ?? [], emailed })
  } catch (e) {
    console.error('issue-association-invoice failed', (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }
})
