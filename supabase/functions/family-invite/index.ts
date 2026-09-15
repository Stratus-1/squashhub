// family-invite
// Emails a newly added family member a personal sign-in link.
//
// Authorisation: the caller must either be the family group's PRIMARY member
// (the person who added them) or an admin of that club. Membership, logins and
// payment responsibility stay separate concepts — this only sends an invite and
// never changes fees, categories or family rows.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorised' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userRes } = await userClient.auth.getUser()
    const caller = userRes?.user
    if (!caller) return json({ error: 'unauthorised' }, 401)

    const body = await req.json().catch(() => ({}))
    const familyMemberRowId = body.family_member_id ? String(body.family_member_id) : null
    const clubMemberId = body.club_member_id ? String(body.club_member_id) : null
    if (!familyMemberRowId && !clubMemberId) {
      return json({ error: 'family_member_id or club_member_id required' }, 400)
    }

    // Resolve the family row (and therefore the group) for the invited person.
    let famQ = admin
      .from('club_family_members')
      .select('id, family_group_id, club_member_id, relationship, status')
      .neq('status', 'removed')
      .limit(1)
    famQ = familyMemberRowId ? famQ.eq('id', familyMemberRowId) : famQ.eq('club_member_id', clubMemberId!)
    const { data: famRows, error: famErr } = await famQ
    if (famErr) throw famErr
    const fam = famRows?.[0]
    if (!fam) return json({ error: 'family member not found' }, 404)

    const { data: group } = await admin
      .from('club_family_groups')
      .select('id, club_id, primary_member_id')
      .eq('id', fam.family_group_id)
      .maybeSingle()
    if (!group) return json({ error: 'family group not found' }, 404)

    const [{ data: primary }, { data: invited }, { data: club }] = await Promise.all([
      admin.from('club_members').select('id, name, user_id').eq('id', group.primary_member_id).maybeSingle(),
      admin.from('club_members').select('id, name, email, user_id, club_id').eq('id', fam.club_member_id).maybeSingle(),
      admin.from('clubs').select('id, name, subdomain').eq('id', group.club_id).maybeSingle(),
    ])
    if (!invited) return json({ error: 'member not found' }, 404)

    // Caller must be the primary member or a club admin.
    const isPrimary = !!primary?.user_id && primary.user_id === caller.id
    let allowed = isPrimary
    if (!allowed) {
      const { data: isAdmin } = await admin.rpc('is_club_admin', {
        _user_id: caller.id,
        _club_id: group.club_id,
      })
      allowed = isAdmin === true
    }
    if (!allowed) return json({ error: 'forbidden' }, 403)

    const email = (invited.email || '').trim()
    if (!email) return json({ ok: true, sent: false, reason: 'no_email_on_file' })

    // Make sure they have a login to claim, then mint a one-tap link.
    const subdomain = (club as any)?.subdomain || null
    const redirectTo = subdomain
      ? `https://www.squashhub.co.za/auth/callback?tenant=${encodeURIComponent(subdomain)}`
      : 'https://www.squashhub.co.za/auth/callback'

    let userId = invited.user_id as string | null
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      })
      if (createErr && !/already registered/i.test(createErr.message)) {
        console.error('[family-invite] createUser', createErr.message)
      }
      userId = created?.user?.id || null
      if (userId) await admin.from('club_members').update({ user_id: userId }).eq('id', invited.id)
    }

    let inviteUrl: string | null = null
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (linkErr) console.error('[family-invite] generateLink', linkErr.message)
    inviteUrl = (linkData as any)?.properties?.action_link || null

    const result = await sendAppEmail({
      templateName: 'family-member-invite',
      recipientEmail: email,
      clubId: group.club_id,
      idempotencyKey: `family-invite-${fam.id}`,
      templateData: {
        memberName: invited.name || '',
        primaryName: (primary as any)?.name || '',
        clubName: (club as any)?.name || '',
        relationship: fam.relationship || '',
        inviteUrl,
        loginEmail: email,
      },
    })

    if (!result.ok) return json({ ok: false, error: result.error }, 502)
    return json({ ok: true, sent: result.sent, reason: result.sent ? undefined : result.reason })
  } catch (e) {
    console.error('[family-invite]', e)
    return json({ error: (e as Error).message || String(e) }, 500)
  }
})
