// Club admin suspends / resigns / reinstates a member. The DB RPC does the
// authorisation + state change + audit log; on suspension we email the member
// a formal notice citing the club rule and reason.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { z } from 'npm:zod@3.23.8'
import { sendAppEmail } from '../_shared/send-app-email.ts'

const Body = z.object({
  member_id: z.string().uuid(),
  status: z.enum(['active', 'suspended', 'resigned']),
  rule: z.string().max(200).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
  send_email: z.boolean().optional().default(true),
})

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') || ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'Not authenticated' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    })
    const { data: u } = await userClient.auth.getUser()
    if (!u?.user) return json({ error: 'Not authenticated' }, 401)

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400)
    const { member_id, status, rule, reason, send_email } = parsed.data

    const { error: rpcErr } = await userClient.rpc('admin_set_member_standing', {
      _member_id: member_id, _status: status, _rule: rule ?? null, _reason: reason ?? null,
    })
    if (rpcErr) return json({ error: rpcErr.message }, 403)

    let email: string = 'skipped'
    if (status === 'suspended' && send_email) {
      const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const { data: m } = await admin.from('club_members')
        .select('id, name, email, club_id, suspended_at').eq('id', member_id).maybeSingle()
      const { data: club } = m ? await admin.from('clubs').select('name, email').eq('id', m.club_id).maybeSingle() : { data: null }
      if (!m?.email) {
        email = 'no_email'
      } else {
        const res = await sendAppEmail({
          templateName: 'member-suspension',
          recipientEmail: m.email,
          clubId: m.club_id,
          idempotencyKey: `member-suspension-${member_id}-${m.suspended_at ?? Date.now()}`,
          templateData: {
            memberName: m.name || 'Member',
            clubName: (club as any)?.name || 'Your club',
            rule: rule || undefined,
            reason: reason || undefined,
            effectiveDate: new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }),
            contactEmail: (club as any)?.email || undefined,
          },
        })
        email = res.ok ? (res.sent ? 'sent' : 'suppressed') : 'failed'
      }
    }
    return json({ ok: true, email })
  } catch (e) {
    console.error('set-member-standing failed', (e as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
})
