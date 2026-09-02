import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendAppEmail } from '../_shared/send-app-email.ts'

/**
 * Tournament invitation email — one invited player per call.
 *
 * Called by the database routine that walks a tournament's invited players
 * (public.send_tournament_invites_via_platform) with the service role key.
 * The template is fixed; only the invitation's own wording is supplied.
 */

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const p = parts[1].replaceAll('-', '+').replaceAll('_', '/')
    return JSON.parse(atob(p.padEnd(Math.ceil(p.length / 4) * 4, '='))) as Record<string, unknown>
  } catch {
    return null
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Authorised callers: a service-role JWT, or the shared internal secret used
  // by the database routine / cron jobs (which only have the anon key to hand).
  const auth = req.headers.get('Authorization') ?? ''
  const claims = auth.startsWith('Bearer ') ? parseJwtClaims(auth.slice(7).trim()) : null
  let authorised = claims?.role === 'service_role'
  const internalHeader = req.headers.get('x-internal-secret') ?? ''
  if (!authorised && internalHeader) {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', 'email_private_internal_secret')
      .maybeSingle()
    authorised = !!data?.value && data.value === internalHeader
  }
  if (!authorised) return json({ error: 'Forbidden' }, 403)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const recipientEmail = str(body.recipientEmail, 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return json({ error: 'A valid recipientEmail is required' }, 400)
  }

  const data = (body.templateData ?? {}) as Record<string, unknown>
  const result = await sendAppEmail({
    templateName: 'club-notification',
    recipientEmail,
    clubId: str(body.clubId, 64) || null,
    idempotencyKey: str(body.idempotencyKey, 128) || undefined,
    templateData: {
      clubName: str(data.clubName, 160),
      clubLogoUrl: str(data.clubLogoUrl, 500),
      title: str(data.title, 200),
      recipientName: str(data.recipientName, 160),
      messageBody: str(data.messageBody, 5000),
      url: str(data.url, 500),
      ctaLabel: str(data.ctaLabel, 80) || 'Open in SquashHub',
    },
  })

  if (!result.ok) return json({ error: 'Failed to send invitation email' }, 502)
  return json({ success: true, sent: result.sent })
})
