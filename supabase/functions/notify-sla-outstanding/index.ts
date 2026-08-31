// Reminds clubs whose trial has ended but who have not yet accepted the SLA.
// Repeats every N days (app_settings.trial_end_reminder_days, default 10) until
// the agreement is signed. Idempotent per club + reminder bucket.
//
// Manual/test use:  POST { clubId: "<uuid>", force: true }

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAX_CLUBS_PER_RUN = 50

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const body = await req.json().catch(() => ({}))
    const onlyClubId: string | undefined = body.clubId
    const force: boolean = !!body.force

    const { data: setting } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'trial_end_reminder_days')
      .maybeSingle()
    const intervalDays = Math.max(1, Number(setting?.value ?? 10) || 10)

    let q = admin
      .from('club_subscriptions')
      .select('id, club_id, trial_ends_at, status')
      .not('trial_ends_at', 'is', null)
      .limit(MAX_CLUBS_PER_RUN)
    if (onlyClubId) q = q.eq('club_id', onlyClubId)
    const { data: subs, error: subErr } = await q
    if (subErr) throw subErr

    const now = Date.now()
    const candidates = (subs || []).filter((s: any) => {
      const end = new Date(s.trial_ends_at).getTime()
      if (Number.isNaN(end)) return false
      if (onlyClubId && force) return true
      const daysSince = Math.floor((now - end) / 86_400_000)
      // Fire on the reminder interval only (10, 20, 30 ... days after trial end).
      return daysSince > 0 && daysSince % intervalDays === 0
    })

    if (!candidates.length) return json({ ok: true, sent: 0, checked: (subs || []).length })

    const { data: supers } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
    const superIds = (supers || []).map((r: any) => r.user_id)
    const { data: superProfiles } = superIds.length
      ? await admin.from('profiles').select('id, email').in('id', superIds)
      : { data: [] as any[] }
    const ccEmails = (superProfiles || []).map((p: any) => p.email).filter(Boolean)

    let sent = 0
    const results: any[] = []

    for (const sub of candidates) {
      const { data: club } = await admin
        .from('clubs')
        .select('id, name, subdomain, sla_accepted_at')
        .eq('id', sub.club_id)
        .maybeSingle()
      if (!club) continue
      if (club.sla_accepted_at) continue // already signed — nothing to chase

      const trialEnd = new Date(sub.trial_ends_at)
      const daysSince = Math.max(1, Math.floor((now - trialEnd.getTime()) / 86_400_000))

      // Invoice payment state (informational line in the email).
      const { data: invoices } = await admin
        .from('platform_subscription_invoices')
        .select('status')
        .eq('club_id', club.id)
      const unpaid = (invoices || []).filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled')
      const invoicesPaid = (invoices || []).length > 0 && unpaid.length === 0

      // Recipients: billing profile emails + club officers / finance admins.
      const { data: profile } = await admin
        .from('club_billing_profiles')
        .select('emails, contact_name')
        .eq('club_id', club.id)
        .maybeSingle()

      const recipients = new Map<string, string>()
      for (const e of (profile?.emails as string[] | null) || []) {
        if (e) recipients.set(String(e).toLowerCase(), profile?.contact_name || 'there')
      }

      const { data: members } = await admin
        .from('club_members')
        .select('id, name, email, role, status')
        .eq('club_id', club.id)
        .eq('status', 'active')

      const { data: perms } = await admin
        .from('club_member_permissions')
        .select('club_member_id, custom_permissions, is_full_admin, club_permission_roles(permissions, is_full_admin)')

      const permByMember = new Map<string, any>()
      for (const p of perms || []) permByMember.set(p.club_member_id, p)

      for (const m of members || []) {
        if (!m.email) continue
        const p: any = permByMember.get(m.id)
        const rolePerms: string[] = p?.club_permission_roles?.permissions || []
        const custom: string[] = p?.custom_permissions || []
        const isOfficer =
          m.role === 'admin' ||
          p?.is_full_admin ||
          p?.club_permission_roles?.is_full_admin ||
          rolePerms.includes('finance') ||
          custom.includes('finance')
        if (isOfficer) recipients.set(String(m.email).toLowerCase(), m.name || 'there')
      }

      for (const e of ccEmails) recipients.set(String(e).toLowerCase(), 'SquashHub team')

      const base = club.subdomain
        ? `https://${club.subdomain}.squashhub.co.za`
        : 'https://squashhub.co.za'
      const subscriptionUrl = `${base}/club-admin?tab=subscription`
      const bucket = Math.floor(daysSince / intervalDays)

      for (const [email, name] of recipients) {
        const result = await sendAppEmail({
          templateName: 'sla-outstanding',
          recipientEmail: email,
          clubId: club.id,
          idempotencyKey: `sla-outstanding-${club.id}-${bucket}-${email}`,
          templateData: {
              clubName: club.name,
              recipientName: name,
              trialEndDate: fmtDate(trialEnd),
              daysSinceTrialEnd: daysSince,
            invoicesPaid,
            subscriptionUrl,
          },
        })
        if (!result.ok) console.error('sla-outstanding send failed', club.id, result.error)
        else sent++
      }

      results.push({ club: club.name, recipients: recipients.size, daysSince })
    }

    return json({ ok: true, sent, clubs: results })
  } catch (e) {
    console.error('notify-sla-outstanding failed:', e)
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
