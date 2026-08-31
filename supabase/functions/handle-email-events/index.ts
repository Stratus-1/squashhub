import { createClient } from 'npm:@supabase/supabase-js@2'
import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'

/**
 * Terminal email outcomes (bounce, complaint, unsubscribe).
 *
 * These rows are the club-facing record only — Lovable enforces suppression
 * server-side at send time, so nothing here decides whether a send happens.
 */

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const REASON_MESSAGE: Record<string, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

const REASON_STATUS: Record<string, string> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

async function record(
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  recipient: string,
  eventId: string,
) {
  const email = String(recipient || '').toLowerCase()
  if (!email) return

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('suppressed_emails upsert failed', {
      event_id: eventId,
      code: suppressError.code,
      message: suppressError.message,
    })
    throw new Error('Failed to write suppression')
  }

  const { error: logError } = await supabase.from('email_send_log').insert({
    template_name: 'system',
    recipient_email: email,
    status: REASON_STATUS[reason],
    error_message: REASON_MESSAGE[reason],
    metadata: null,
  })
  if (logError) {
    console.error('email_send_log insert failed', {
      event_id: eventId,
      code: logError.code,
      message: logError.message,
    })
    throw new Error('Failed to write email log')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record('bounce', event.data.recipient, event.event_id)
    },
    'email.complaint': async (event) => {
      await record('complaint', event.data.recipient, event.event_id)
    },
    'email.unsubscribed': async (event) => {
      await record('unsubscribe', event.data.recipient, event.event_id)
    },
  },
})

Deno.serve((req) => handler(req))
