// Sends the "your trial is ending / subscription starting" email to a club's
// billing officers (billing profile emails + chairman / secretary / finance
// admins), with SquashHub super admins copied.
//
// Runs daily via pg_cron. Bounded batch, idempotent per club + trial date, so
// re-runs never send twice.
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
    const resendTag: string = body.resendTag ? `-${String(body.resendTag).slice(0, 40)}` : ''

    // Lead time (days before trial end) — configurable in platform settings.
    const { data: setting } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'trial_end_reminder_days')
      .maybeSingle()
    const leadDays = Math.max(1, Number(setting?.value ?? 10) || 10)

    const target = new Date()
    target.setDate(target.getDate() + leadDays)
    const targetDay = target.toISOString().slice(0, 10)

    // Subscriptions whose trial ends exactly `leadDays` from today.
    let q = admin
      .from('club_subscriptions')
      .select('id, club_id, trial_ends_at, status')
      .not('trial_ends_at', 'is', null)
      .limit(MAX_CLUBS_PER_RUN)
    if (onlyClubId) q = q.eq('club_id', onlyClubId)
    const { data: subs, error: subErr } = await q
    if (subErr) throw subErr

    const due = (subs || []).filter((s: any) => {
      if (!s.trial_ends_at) return false
      if (onlyClubId && force) return true
      return String(s.trial_ends_at).slice(0, 10) === targetDay
    })

    if (!due.length) return json({ ok: true, sent: 0, checked: (subs || []).length, targetDay })

    // SquashHub super admins get copied on every notice.
    const { data: supers } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
    const superIds = (supers || []).map((r: any) => r.user_id)
    const { data: superProfiles } = superIds.length
      ? await admin.from('profiles').select('id, email').in('id', superIds)
      : { data: [] as any[] }
    const ccEmails = (superProfiles || []).map((p: any) => p.email).filter(Boolean)

    let sent = 0
    const results: any[] = []

    for (const sub of due) {
      const trialEnd = new Date(sub.trial_ends_at)
      const billingStart = new Date(trialEnd)
      billingStart.setDate(billingStart.getDate() + 1)
      const trialKey = String(sub.trial_ends_at).slice(0, 10)

      const { data: club } = await admin
        .from('clubs')
        .select('id, name, subdomain, logo_url')
        .eq('id', sub.club_id)
        .maybeSingle()
      if (!club) continue

      // Recipients: billing profile emails first.
      const { data: profile } = await admin
        .from('club_billing_profiles')
        .select('emails, contact_name')
        .eq('club_id', club.id)
        .maybeSingle()

      const isSendable = (e?: string | null) =>
        !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !/\.local$/i.test(e)

      const recipients = new Map<string, string>() // email -> name
      for (const e of (profile?.emails as string[] | null) || []) {
        if (isSendable(e)) recipients.set(e.toLowerCase(), profile?.contact_name || 'there')
      }

      // Only fall back to club officers / finance admins when the club has NOT
      // set billing contacts on the billing information page.
      if (recipients.size === 0) {
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
          if (!isSendable(m.email)) continue
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
      }

      for (const e of ccEmails) {
        if (isSendable(e)) recipients.set(String(e).toLowerCase(), 'SquashHub team')
      }


      // Billable member count for the estimate line.
      const { count: memberCount } = await admin
        .from('club_members')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', club.id)
        .eq('status', 'active')
        .neq('role', 'visitor')
        .eq('billing_exempt', false)

      const base = club.subdomain
        ? `https://${club.subdomain}.squashhub.co.za`
        : 'https://squashhub.co.za'
      const subscriptionUrl = `${base}/club-admin?tab=subscription`

      for (const [email, name] of recipients) {
        const result = await sendAppEmail({
          templateName: 'trial-ending',
          recipientEmail: email,
          clubId: club.id,
          idempotencyKey: `trial-ending-${club.id}-${trialKey}-${email}${resendTag}`,
          templateData: {
              clubName: club.name,
              recipientName: name,
              trialEndDate: fmtDate(trialEnd),
              billingStartDate: fmtDate(billingStart),
              daysRemaining: leadDays,
              memberCount: memberCount ?? undefined,
            subscriptionUrl,
            clubLogoUrl: (club as any).logo_url || undefined,
          },
        })
        if (!result.ok) {
          console.error('trial-ending send failed', club.id, result.error)
        } else {
          sent++
        }
      }

      results.push({ club: club.name, recipients: recipients.size })
    }

    return json({ ok: true, sent, clubs: results, targetDay })
  } catch (e) {
    console.error('notify-trial-ending failed:', e)
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
