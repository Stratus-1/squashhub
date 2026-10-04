import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Proof-of-payment upload for a tournament invitation (EFT payers).
 *
 * Invitees are often not signed in, so the storage bucket's member-only
 * policy would reject a direct upload. This function validates the invite
 * token (plus the verification code, or a signed-in session for the same
 * member) with the service role, then stores the file under the same
 * clubId/memberId layout the in-app EFT panel uses and records it on the
 * registration. The trg_champ_proof_uploaded trigger notifies club admins.
 */

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected a file upload' }, 400)
  }
  const token = String(form.get('token') || '').trim()
  const verify = String(form.get('verify') || '').trim()
  const file = form.get('file')
  if (!token) return json({ error: 'This invitation is no longer valid' }, 400)
  if (!(file instanceof File)) return json({ error: 'Choose a photo or PDF of your payment confirmation' }, 400)
  if (file.size > MAX_BYTES) return json({ error: 'That file is larger than 10MB — please upload a smaller photo or PDF.' }, 400)
  const ext = ALLOWED[file.type]
  if (!ext) return json({ error: 'Only a photo (PNG/JPG/WebP) or PDF is accepted' }, 400)

  // Resolve the registration behind the invite token.
  const { data: regId, error: regErr } = await admin.rpc('_invite_reg_id', { p_token: token })
  if (regErr || !regId) return json({ error: 'This invitation is no longer valid' }, 400)
  const { data: reg } = await admin
    .from('club_champs_registrations')
    .select('id, champ_id, club_member_id, status, paid_at')
    .eq('id', regId)
    .single()
  if (!reg) return json({ error: 'This invitation is no longer valid' }, 400)
  if (reg.paid_at) return json({ error: 'This entry is already marked paid' }, 400)

  // Verify the caller: signed-in member/delegate, or the invite verification code.
  let authedUserId: string | null = null
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const { data: userData } = await admin.auth.getUser(authHeader.slice(7).trim())
    authedUserId = userData?.user?.id ?? null
  }
  let verified = false
  if (authedUserId) {
    const { data: member } = await admin
      .from('club_members')
      .select('user_id')
      .eq('id', reg.club_member_id)
      .single()
    if (member?.user_id === authedUserId) verified = true
    if (!verified) {
      const { data: isDelegate } = await admin.rpc('member_is_delegate_of', {
        p_grantor: reg.club_member_id,
        p_user: authedUserId,
      })
      verified = !!isDelegate
    }
  }
  if (!verified && verify) {
    const { data: ok } = await admin.rpc('invite_verification_ok', {
      p_member_id: reg.club_member_id,
      p_code: verify,
    })
    verified = !!ok
  }
  if (!verified) return json({ error: 'Please verify this invitation first' }, 403)

  const { data: champ } = await admin
    .from('club_champs')
    .select('club_id')
    .eq('id', reg.champ_id)
    .single()
  if (!champ) return json({ error: 'Tournament not found' }, 400)

  const path = `${champ.club_id}/${reg.club_member_id}/${Date.now()}.${ext}`
  const { error: upErr } = await admin.storage
    .from('payment-proofs')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
  if (upErr) return json({ error: 'Could not upload the proof of payment' }, 500)

  const { error: updErr } = await admin
    .from('club_champs_registrations')
    .update({
      status: 'pending_eft',
      proof_url: path,
      proof_uploaded_at: new Date().toISOString(),
      proof_uploaded_by: authedUserId,
    })
    .eq('id', reg.id)
    .is('paid_at', null)
  if (updErr) return json({ error: 'Could not record the proof of payment' }, 500)

  return json({ ok: true, path })
})
