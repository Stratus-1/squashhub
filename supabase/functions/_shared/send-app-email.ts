import { createClient } from 'npm:@supabase/supabase-js@2'
import { EmailAPIError } from 'npm:@lovable.dev/email-js@0.1.0'
import { sendTemplateEmail } from './transactional-email-templates/send-email.ts'

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
}

export type SendAppEmailResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: 'recipient_suppressed' }
  | { ok: false; error: string }

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

export async function sendAppEmail(args: SendAppEmailArgs): Promise<SendAppEmailResult> {
  const { templateName, recipientEmail, templateData, idempotencyKey, clubId, replyTo } = args

  try {
    const result = await sendTemplateEmail(templateName, recipientEmail, {
      templateData: templateData as Record<string, any> | undefined,
      idempotencyKey,
      replyTo,
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
    const message =
      error instanceof EmailAPIError
        ? `${error.code ?? 'email_error'}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error)

    await logSend({
      club_id: clubId ?? null,
      template_name: templateName,
      recipient_email: recipientEmail,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })
    console.error('App email send failed', { templateName, message })
    return { ok: false, error: message }
  }
}
