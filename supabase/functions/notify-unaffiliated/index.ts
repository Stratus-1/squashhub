// Emails people who created a SquashHub login but were never linked to a club,
// asking them to choose their club.
//
// Platform-admin only. Idempotent per user per day; skips anyone already emailed
// with this template in the last 30 days unless { force: true } is passed.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const TEMPLATE = 'choose-your-club'
const SITE = 'https://squashhub.co.za'
const MAX_PER_RUN = 100

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader) return json({ error: 'Not authenticated' }, 401)

    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await asUser.auth.getUser()
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', uid)
    const isPlatformAdmin = (roles || []).some(
      (r: { role: string }) => r.role === 'admin' || r.role === 'moderator',
    )
    if (!isPlatformAdmin) return json({ error: 'Not authorised' }, 403)

    const body = await req.json().catch(() => ({}))
    const force = !!body.force
    const onlyUserIds: string[] | undefined = Array.isArray(body.userIds) ? body.userIds : undefined

    const { data: unaffiliated, error } = await admin.rpc('platform_unaffiliated_users')
    if (error) throw error

    let targets = (unaffiliated || []).filter(
      (u: { email: string | null }) => !!u.email && u.email.includes('@'),
    )
    if (onlyUserIds) targets = targets.filter((u: { user_id: string }) => onlyUserIds.includes(u.user_id))
    targets = targets.slice(0, MAX_PER_RUN)

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    let sent = 0
    let skipped = 0
    const failures: string[] = []

    for (const u of targets) {
      if (!force) {
        const { data: prior } = await admin
          .from('email_send_log')
          .select('id')
          .eq('template_name', TEMPLATE)
          .eq('recipient_email', u.email)
          .gte('created_at', cutoff)
          .limit(1)
        if (prior && prior.length > 0) {
          skipped++
          continue
        }
      }

      const firstName = String(u.name || '').trim().split(/\s+/)[0] || 'there'
      const result = await sendAppEmail({
        templateName: TEMPLATE,
        recipientEmail: u.email,
        templateData: { recipientName: firstName, findClubUrl: `${SITE}/find-club` },
        idempotencyKey: `choose-club-${u.user_id}-${new Date().toISOString().slice(0, 10)}`,
        replyTo: 'support@squashhub.co.za',
      })

      if (result.ok && result.sent) sent++
      else if (result.ok) skipped++
      else failures.push(`${u.email}: ${result.error}`)
    }

    return json({ ok: true, candidates: targets.length, sent, skipped, failures })
  } catch (e) {
    console.error('notify-unaffiliated failed', e)
    return json({ error: (e as Error).message }, 500)
  }
})
