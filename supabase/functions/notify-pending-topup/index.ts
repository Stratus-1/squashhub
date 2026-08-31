// Notify finance/treasurer recipients when a member submits an EFT top-up
// that requires admin approval. Recipients are members with:
//   - club_members.role = 'admin', OR
//   - permission role marked is_full_admin, OR
//   - permission role permissions[] includes 'finance', OR
//   - club_member_permissions.custom_permissions[] includes 'finance', OR
//   - club_member_permissions.is_full_admin = true
// Emails go to each recipient's personal address (club_members.email, falling
// back to profiles.email) — never the shared club sender address.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const transactionId: string | undefined = body.transactionId || body.transaction_id
    if (!transactionId) {
      return json({ error: 'transactionId required' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // 1. Load the pending transaction
    const { data: tx, error: txErr } = await admin
      .from('member_credit_transactions')
      .select('id, club_id, club_member_id, amount, method, status, description, created_at')
      .eq('id', transactionId)
      .maybeSingle()
    if (txErr) throw txErr
    if (!tx) return json({ error: 'Transaction not found' }, 404)
    if (tx.status !== 'pending' || tx.method !== 'eft') {
      return json({ ok: true, skipped: true, reason: 'Not a pending EFT transaction' })
    }

    // 2. Club + submitting member
    const [{ data: club }, { data: submitter }] = await Promise.all([
      admin.from('clubs').select('id, name, currency_code, subdomain').eq('id', tx.club_id).maybeSingle(),
      admin.from('club_members').select('id, name, email').eq('id', tx.club_member_id).maybeSingle(),
    ])

    // 3. Find finance recipients in this club
    const { data: members, error: mErr } = await admin
      .from('club_members')
      .select('id, name, email, user_id, role, status')
      .eq('club_id', tx.club_id)
      .eq('status', 'active')
    if (mErr) throw mErr

    const { data: perms } = await admin
      .from('club_member_permissions')
      .select('club_member_id, custom_permissions, is_full_admin, club_permission_roles(permissions, is_full_admin)')

    const permByMember = new Map<string, any>()
    for (const p of perms || []) permByMember.set(p.club_member_id, p)

    const recipients = (members || []).filter((m: any) => {
      if (m.role === 'admin') return true
      const p: any = permByMember.get(m.id)
      if (!p) return false
      if (p.is_full_admin) return true
      const role = p.club_permission_roles
      if (role?.is_full_admin) return true
      if (Array.isArray(role?.permissions) && role.permissions.includes('finance')) return true
      if (Array.isArray(p.custom_permissions) && p.custom_permissions.includes('finance')) return true
      return false
    })

    // Backfill missing personal emails from profiles
    const missingUserIds = recipients.filter((r: any) => !r.email && r.user_id).map((r: any) => r.user_id)
    if (missingUserIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', missingUserIds)
      const byId = new Map((profiles || []).map((p: any) => [p.id, p.email]))
      for (const r of recipients as any[]) {
        if (!r.email && r.user_id) r.email = byId.get(r.user_id) || null
      }
    }

    // Dedupe by email
    const seen = new Set<string>()
    const toSend = recipients
      .map((r: any) => (r.email || '').trim().toLowerCase())
      .filter((e: string) => e && !seen.has(e) && (seen.add(e), true))

    if (!toSend.length) {
      return json({ ok: true, skipped: true, reason: 'No finance recipients with an email address' })
    }

    // 4. Build template data
    const clubName = (club as any)?.name || 'Your Club'
    const currency = (club as any)?.currency_code === 'USD' ? '$' : 'R'
    const amount = Number(tx.amount || 0).toFixed(2)
    const submittedAt = tx.created_at ? new Date(tx.created_at).toISOString().replace('T', ' ').slice(0, 16) : ''
    const subdomain = (club as any)?.subdomain
    const reviewUrl = subdomain
      ? `https://${subdomain}.squashhub.co.za/club-admin?tab=finance`
      : 'https://squashhub.co.za/club-admin?tab=finance'

    const templateData = {
      memberName: (submitter as any)?.name || 'A member',
      amount,
      currency,
      clubName,
      method: (tx.method || 'eft').toUpperCase(),
      description: tx.description || '',
      reviewUrl,
      submittedAt,
    }

    // 5. Send to each recipient via the transactional email pipeline
    const results = await Promise.all(
      toSend.map(async (email) => {
        try {
          const result = await sendAppEmail({
            templateName: 'pending-topup-approval',
            recipientEmail: email,
            idempotencyKey: `topup-pending-${tx.id}-${email}`,
            templateData,
          })
          return { email, ok: result.ok, error: result.ok ? undefined : result.error }
        } catch (e) {
          return { email, ok: false, error: (e as Error).message }
        }
      }),
    )

    return json({ ok: true, sent: results.filter((r) => r.ok).length, recipients: results })
  } catch (err) {
    console.error('[notify-pending-topup]', err)
    return json({ error: (err as Error).message || String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
