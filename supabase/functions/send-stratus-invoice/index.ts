// send-stratus-invoice
// Super Admin only. Emails a fixed Stratus invoice to a club's office bearers
// with a 60-day signed download link (the managed email API has no attachments).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendAppEmail } from '../_shared/send-app-email.ts';
import { platformSignature, STRATUS_LOGO_URL } from '../_shared/platform-signature.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const INVOICES: Record<string, { path: string; filename: string; title: string; recipients: { first: string; email: string }[]; body: string }> = {
  'nsc-10059': {
    path: 'nsc/Stratus_Invoice_10059_Nelspruit_Squash_Club.pdf',
    filename: 'Stratus_Invoice_10059_Nelspruit_Squash_Club.pdf',
    title: 'Invoice 10059 – SquashHub training (Nelspruit Squash Club)',
    recipients: [
      { first: 'Susan', email: 'sue.crafford@gmail.com' },
      { first: 'Rachel', email: 'ubuntu.poolcovers@yahoo.com' },
    ],
    body: [
      `Please find invoice 10059 from Stratus Software Solutions (Pty) Ltd for SquashHub training for Nelspruit Squash Club on Monday, 30 November 2026.`,
      `Amount due: R2,500.00 (no VAT)`,
      `PAYMENT DETAILS\nCapitec Business – Stratus Software Solutions (Pty) Ltd\nAccount no: 1055429557 (Current)\nBranch code: 450105\nReference: 10059 – Nelspruit Squash Club\nPlease email proof of payment to admin@stratsol.co.za.`,
      `Use the button below to download the invoice as a PDF. The link works for 60 days.`,
      `QUESTIONS?\nThis email comes from a no-reply address, so please don't reply here.\n• Email support@squashhub.co.za\n• WhatsApp us on 083 375 9003`,
    ].join('\n\n'),
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: auth } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''));
  if (!auth?.user) return json({ error: 'Please sign in' }, 401);
  const { data: ok } = await admin.rpc('is_platform_admin', { _user_id: auth.user.id });
  if (!ok) return json({ error: 'Super Admin only' }, 403);
  const body = await req.json().catch(() => ({}));
  const inv = INVOICES[String(body?.invoice ?? '')];
  if (!inv) return json({ error: 'Unknown invoice' }, 400);
  const { data: signed, error } = await admin.storage.from('platform-invoices')
    .createSignedUrl(inv.path, 60 * 24 * 3600, { download: inv.filename });
  if (error || !signed) return json({ error: error?.message || 'no link' }, 500);
  const results = [];
  for (const r of inv.recipients) {
    const res = await sendAppEmail({
      templateName: 'club-notification', recipientEmail: r.email,
      idempotencyKey: `stratus-invoice-${body.invoice}-${r.email}`,
      templateData: { clubName: 'SquashHub', title: inv.title, messageBody: `Hi ${r.first},\n\n${inv.body}`,
        url: signed.signedUrl, ctaLabel: 'Download invoice (PDF)', clubLogoUrl: STRATUS_LOGO_URL,
        signatureHtml: platformSignature('Kind regards,') },
    });
    results.push({ email: r.email, ...res });
  }
  return json({ results });
});
