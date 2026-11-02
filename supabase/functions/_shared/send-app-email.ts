import { createClient } from 'npm:@supabase/supabase-js@2'
import { EmailAPIError } from 'npm:@lovable.dev/email-js@0.1.0'
import { sendTemplateEmail, renderTemplateEmail, injectHeader } from './transactional-email-templates/send-email.ts'

/**
 * Server-side app-email send used across this project's edge functions.
 *
 * Delivery, retries, suppression and unsubscribe handling are owned by
 * Lovable's managed email API (see ./transactional-email-templates/send-email.ts).
 * This wrapper only adds the project's own `email_send_log` bookkeeping so the
 * admin email history keeps working exactly as before.
 */
export interface SendAppEmailArgs {
  templateName: string
  recipientEmail: string
  templateData?: Record<string, unknown>
  idempotencyKey?: string
  clubId?: string | null
  replyTo?: string
  /** Only delivered when the club sends via its own SMTP. */
  attachments?: { filename: string; content: Uint8Array; contentType?: string }[]
}

export type SendAppEmailResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: 'recipient_suppressed' }
  | { ok: false; error: string; code?: string; rateLimited?: boolean; retryAfterSeconds?: number }

/** Managed email API rate limits are transient — wait and retry a couple of times. */
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_RETRY_WAIT_SECONDS = 30

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))


function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

async function logSend(row: Record<string, unknown>) {
  try {
    const { error } = await admin().from('email_send_log').insert(row)
    if (error) console.error('email_send_log insert failed', { code: error.code, message: error.message })
  } catch (e) {
    console.error('email_send_log insert threw', { message: (e as Error).message })
  }
}

// Platform-to-club emails stay on SquashHub's own sender; everything else a club
// sends to its members goes through the club's own SMTP + signature when set up.
const PLATFORM_TEMPLATES = new Set([
  'new-club-registered', 'stitch-onboarding-application', 'support-new-message', 'support-admin-reply',
  'subscription-invoice', 'subscription-invoice-reminder', 'trial-ending', 'sla-outstanding',
])
// Templates that already draw the club + SquashHub logo row themselves.
const OWN_LOGO_TEMPLATES = new Set(['club-notification', 'agm-invite-test'])
const SQUASHHUB_LOGO_URL = 'https://bzbuppwzljadulwntjys.supabase.co/storage/v1/object/public/club-logos/_platform/squashhub-logo.png'

async function logoHeader(templateName: string, clubId?: string | null): Promise<string | undefined> {
  if (!clubId || PLATFORM_TEMPLATES.has(templateName) || OWN_LOGO_TEMPLATES.has(templateName)) return undefined
  const { data: club } = await admin().from('clubs').select('name,logo_url').eq('id', clubId).maybeSingle()
  const name = escapeHtml(club?.name || 'Club')
  const left = club?.logo_url
    ? `<img src="${escapeHtml(club.logo_url)}" alt="${name}" height="40" style="display:inline-block;max-height:40px;max-width:150px;border-radius:6px">`
    : `<span style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#1E3A5F">${name}</span>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:16px auto 0"><tr>` +
    `<td align="left" valign="middle" style="padding:0 20px">${left}</td>` +
    `<td align="right" valign="middle" style="padding:0 20px"><img src="${SQUASHHUB_LOGO_URL}" alt="SquashHub" height="28" style="display:inline-block;max-height:28px;max-width:120px"></td>` +
    `</tr></table>`
}

const ALLOWED_SMTP_PORTS = new Set([25, 465, 587, 2525])
function escapeHtml(s: string) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)) }
const _unusedEscape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Returns true when sent via club SMTP, false when the club has no SMTP configured. */
async function trySendViaClubSmtp(args: SendAppEmailArgs): Promise<boolean> {
  const { templateName, recipientEmail, templateData, clubId, replyTo, attachments } = args
  if (!clubId || PLATFORM_TEMPLATES.has(templateName)) return false
  const db = admin()
  const { data: secrets } = await db.from('club_secrets')
    .select('smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email').eq('club_id', clubId).maybeSingle()
  if (!secrets?.smtp_host || !secrets?.smtp_user || !secrets?.smtp_pass || !secrets?.sender_email) return false
  const port = Number(secrets.smtp_port) || 587
  if (!ALLOWED_SMTP_PORTS.has(port)) return false
  const { data: club } = await db.from('clubs').select('name,email,email_signature_html,email_disclaimer').eq('id', clubId).maybeSingle()
  const r = await renderTemplateEmail(templateName, (templateData ?? {}) as Record<string, any>)
  const sig = club?.email_signature_html
    ? `<div style="margin:24px auto 0;max-width:600px;border-top:1px solid #e2e8f0;padding-top:14px;font-family:Arial,sans-serif;font-size:13px">${club.email_signature_html}</div>` : ''
  const disc = club?.email_disclaimer
    ? `<p style="margin:14px auto 0;max-width:600px;font-size:11px;color:#94a3b8;line-height:1.4">${escapeHtml(club.email_disclaimer)}</p>` : ''
  const header = await logoHeader(templateName, clubId)
  if (header) r.html = injectHeader(r.html, header)
  const html = (sig || disc) && r.html.includes('</body>') ? r.html.replace('</body>', `${sig}${disc}</body>`) : r.html + sig + disc
  const sigText = club?.email_signature_html ? '\n\n--\n' + club.email_signature_html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : ''
  const nodemailer = await import('npm:nodemailer@6.9.14')
  const transporter = nodemailer.default.createTransport({
    host: secrets.smtp_host, port, secure: port === 465, requireTLS: port === 587,
    auth: { user: secrets.smtp_user, pass: secrets.smtp_pass },
  })
  await transporter.sendMail({
    from: `${secrets.sender_name || club?.name || 'Club'} <${secrets.sender_email}>`,
    to: r.fixedTo || recipientEmail, subject: r.subject, html, text: r.text + sigText,
    replyTo: replyTo || club?.email || undefined,
    attachments: attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType || 'application/pdf' })),
  })
  return true
}

export async function sendAppEmail(args: SendAppEmailArgs): Promise<SendAppEmailResult> {
  const { templateName, recipientEmail, templateData, idempotencyKey, clubId, replyTo } = args

  try {
    if (await trySendViaClubSmtp(args)) {
      await logSend({ club_id: clubId ?? null, template_name: templateName, recipient_email: recipientEmail, status: 'sent' })
      return { ok: true, sent: true }
    }
  } catch (e) {
    const message = (e as Error).message
    console.error('club SMTP send failed', { templateName, message })
    await logSend({ club_id: clubId ?? null, template_name: templateName, recipient_email: recipientEmail, status: 'failed', error_message: `Club SMTP: ${message}` })
    return { ok: false, error: `Club email (SMTP) failed: ${message}` }
  }

  for (let attempt = 0; ; attempt++) {
    try {
      const result = await sendTemplateEmail(templateName, recipientEmail, {
        templateData: templateData as Record<string, any> | undefined,
        idempotencyKey,
        replyTo,
        headerHtml: await logoHeader(templateName, clubId),
      })

      if (!result.sent) {
        await logSend({
          club_id: clubId ?? null,
          template_name: templateName,
          recipient_email: recipientEmail,
          status: 'suppressed',
        })
        return { ok: true, sent: false, reason: 'recipient_suppressed' }
      }

      await logSend({
        club_id: clubId ?? null,
        template_name: templateName,
        recipient_email: recipientEmail,
        status: 'sent',
      })
      return { ok: true, sent: true }
    } catch (error) {
      const apiError = error instanceof EmailAPIError ? error : null
      const rateLimited = apiError?.status === 429
      const retryAfterSeconds = Math.min(apiError?.retryAfterSeconds ?? 60, MAX_RETRY_WAIT_SECONDS)
      const message = apiError
        ? `${apiError.code ?? 'email_error'}: ${apiError.message}`
        : error instanceof Error
          ? error.message
          : String(error)

      // Transient rate limiting: wait the advised window and try again before
      // giving up, so a burst of invitations is not silently lost.
      if (rateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
        console.warn('App email rate limited, retrying', { templateName, attempt, retryAfterSeconds })
        await sleep(retryAfterSeconds * 1000)
        continue
      }

      await logSend({
        club_id: clubId ?? null,
        template_name: templateName,
        recipient_email: recipientEmail,
        status: 'failed',
        error_message: message.slice(0, 1000),
      })
      console.error('App email send failed', { templateName, message, rateLimited })
      return {
        ok: false,
        error: message,
        code: apiError?.code ?? undefined,
        rateLimited,
        retryAfterSeconds: rateLimited ? retryAfterSeconds : undefined,
      }
    }
  }
}

