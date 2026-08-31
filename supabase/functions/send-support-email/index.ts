import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

/**
 * Support email sender.
 *
 * Two triggers, one recipient each:
 *  - `contact`        : public website enquiry -> the support inbox
 *  - `thread_message` : a support thread message -> the other party
 *
 * Recipients are always derived server-side (fixed inbox, or the thread owner
 * looked up in the database) — the browser can never choose an address.
 */

const SUPPORT_INBOX = 'support@squashhub.co.za'
const MAX_CONTACT_PER_10_MIN = 10

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254

const str = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const kind = str(body.kind, 32)

  // ---------------------------------------------------------------- contact
  if (kind === 'contact') {
    const name = str(body.name, 120)
    const email = body.email
    const company = str(body.company, 160)
    const message = str(body.message, 5000)

    if (!isEmail(email) || !message) {
      return json({ error: 'A valid email address and a message are required' }, 400)
    }

    // Light rate limit on the shared inbox so the public form cannot be abused.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count } = await admin()
      .from('email_send_log')
      .select('id', { count: 'exact', head: true })
      .eq('template_name', 'support-new-message')
      .gte('created_at', since)
    if ((count ?? 0) >= MAX_CONTACT_PER_10_MIN) {
      return json({ error: 'Too many messages right now — please try again shortly' }, 429)
    }

    const result = await sendAppEmail({
      templateName: 'support-new-message',
      recipientEmail: SUPPORT_INBOX,
      idempotencyKey: `web-contact-${email}-${Date.now()}`,
      templateData: {
        subject: `Website enquiry${company ? ` — ${company}` : ''}`,
        message: `Club / Company: ${company || '—'}\n\n${message}`,
        fromName: name,
        fromEmail: email,
        isNewThread: true,
      },
    })

    if (!result.ok) return json({ error: 'Could not send your message' }, 502)
    return json({ success: true })
  }

  // --------------------------------------------------------- thread message
  if (kind === 'thread_message') {
    const messageId = str(body.messageId, 64)
    const origin = str(body.origin, 200) || 'https://squashhub.co.za'
    if (!messageId) return json({ error: 'messageId is required' }, 400)

    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

    const supa = admin()
    const { data: userData } = await supa.auth.getUser(authHeader.slice(7).trim())
    const user = userData?.user
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { data: msg } = await supa
      .from('support_messages')
      .select('id, thread_id, sender_id, body')
      .eq('id', messageId)
      .maybeSingle()
    if (!msg || msg.sender_id !== user.id) return json({ error: 'Not found' }, 404)

    const { data: thread } = await supa
      .from('support_threads')
      .select('id, user_id, subject')
      .eq('id', msg.thread_id)
      .maybeSingle()
    if (!thread) return json({ error: 'Not found' }, 404)

    const { data: roleRows } = await supa.from('user_roles').select('role').eq('user_id', user.id)
    const isAdminSender = (roleRows ?? []).some((r: { role: string }) =>
      ['super_admin', 'platform_admin', 'admin'].includes(String(r.role)),
    )

    if (isAdminSender && thread.user_id !== user.id) {
      const { data: owner } = await supa
        .from('profiles')
        .select('email, name')
        .eq('id', thread.user_id)
        .maybeSingle()
      if (!owner?.email) return json({ success: false, reason: 'no_recipient' })

      const result = await sendAppEmail({
        templateName: 'support-admin-reply',
        recipientEmail: owner.email,
        idempotencyKey: `support-reply-${msg.id}`,
        templateData: {
          subject: thread.subject,
          message: msg.body,
          threadUrl: `${origin}/support?threadId=${thread.id}`,
          recipientName: owner.name || '',
        },
      })
      if (!result.ok) return json({ error: 'Could not send notification' }, 502)
      return json({ success: true })
    }

    if (!isAdminSender) {
      const { data: sender } = await supa
        .from('profiles')
        .select('email, name')
        .eq('id', user.id)
        .maybeSingle()

      const result = await sendAppEmail({
        templateName: 'support-new-message',
        recipientEmail: SUPPORT_INBOX,
        idempotencyKey: `support-msg-${msg.id}`,
        templateData: {
          subject: thread.subject,
          message: msg.body,
          fromName: sender?.name || '',
          fromEmail: sender?.email || user.email || '',
          threadUrl: `${origin}/admin/support?threadId=${thread.id}`,
          isNewThread: false,
        },
      })
      if (!result.ok) return json({ error: 'Could not send notification' }, 502)
      return json({ success: true })
    }

    return json({ success: false, reason: 'no_recipient' })
  }

  return json({ error: 'Unknown request kind' }, 400)
})
