// Sends the membership-approved confirmation email to a member (and a copy to
// the club's own email address). Callable by a club admin of the member's club
// or by a platform super admin.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const body = await req.json().catch(() => ({}))
    const memberId = typeof body.member_id === 'string' ? body.member_id : null
    if (!memberId) {
      return new Response(JSON.stringify({ error: 'member_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: u } = await userClient.auth.getUser()
    if (!u?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: m } = await admin.from('club_members')
      .select('id, club_id, name, email, is_pending_approval')
      .eq('id', memberId).maybeSingle()
    if (!m) {
      return new Response(JSON.stringify({ error: 'Member not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Caller must be an admin of the member's club, or a platform super admin.
    const { data: caller } = await admin.from('club_members')
      .select('id').eq('user_id', u.user.id).eq('club_id', m.club_id).eq('role', 'admin').maybeSingle()
    const { data: superAdmin } = await admin.from('user_roles')
      .select('id').eq('user_id', u.user.id).eq('role', 'admin').maybeSingle()
    if (!caller && !superAdmin) {
      return new Response(JSON.stringify({ error: 'Not allowed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: club } = await admin.from('clubs').select('name, email').eq('id', m.club_id).maybeSingle()
    const clubName = club?.name ?? 'Your club'
    const templateData = { memberName: m.name ?? 'Member', clubName, contactEmail: club?.email ?? undefined }

    const result = await sendTemplateEmail('member-approved', m.email, {
      templateData,
      idempotencyKey: `member-approved-${m.id}`,
    })

    // Copy to the club's own email address (no CC support; separate send).
    if (club?.email && club.email.toLowerCase() !== String(m.email).toLowerCase()) {
      await sendTemplateEmail('member-approved', club.email, {
        templateData,
        idempotencyKey: `member-approved-club-copy-${m.id}`,
      }).catch(() => null)
    }

    return new Response(JSON.stringify({ ok: true, sent: result.sent ?? true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
