import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import { EmailAPIError } from 'npm:@lovable.dev/email-js@0.1.0';
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts';
import { testRecipient } from './policy.ts';
import * as React from 'npm:react@18.3.1';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { template as agmTemplate } from '../_shared/transactional-email-templates/agm-invite-test.tsx';

const schema = z.object({ ballot_id: z.string().uuid(), member_id: z.string().uuid(), destination: z.enum(['self', 'member']), request_id: z.string().uuid(), kind: z.enum(['invite', 'nominations']).optional() }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const format = (iso: string) => new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: auth, error: ae } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''));
    if (ae || !auth.user) return json({ error: 'Please sign in' }, 401);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Choose a ballot, member and test destination' }, 400);
    const input = parsed.data;
    const { data: ballot, error: be } = await admin.from('agm_ballots').select('club_id,title,meeting_at,meeting_venue,meeting_details,deadline,documents,nomination_message,nominations_close_at').eq('id', input.ballot_id).maybeSingle();
    if (be || !ballot) return json({ error: 'Ballot not found' }, 404);
    const { data: allowed, error: pe } = await admin.rpc('is_club_admin', { _user_id: auth.user.id, _club_id: ballot.club_id });
    if (pe || !allowed) return json({ error: 'Only this club’s admins can send AGM tests' }, 403);
    const { data: member, error: me } = await admin.from('club_members').select('id,name,email').eq('club_id', ballot.club_id).eq('status', 'active').eq('id', input.member_id).maybeSingle();
    if (me || !member) return json({ error: 'Select an active member of this club' }, 400);
    const to = testRecipient(input.destination, auth.user.email, member);
    if (input.kind === 'nominations') {
      const full = (iso: string) => new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'full', timeStyle: 'short' });
      const meeting = ballot.meeting_at ? `${full(ballot.meeting_at)}${ballot.meeting_venue ? ` at ${ballot.meeting_venue}` : ''}` : 'the date to be confirmed';
      const closes = ballot.nominations_close_at ? format(ballot.nominations_close_at) : 'the closing date';
      const msg = String(ballot.nomination_message ?? '').trim();
      if (!msg) return json({ error: 'Save the call for nominations message first' }, 400);
      const filled = msg.replace(/\{\s*member[ _]name\s*\}/gi, member.name).replace(/\{\s*meeting[ _]date\s*\}/gi, meeting).replace(/\{\s*nominations[ _]close\s*\}/gi, closes);
      const { data: c } = await admin.from('clubs').select('name,logo_url,email_signature_html,email_disclaimer').eq('id', ballot.club_id).maybeSingle();
      const origin = /^https:\/\/[a-z0-9.-]+$/i.test(req.headers.get('Origin') ?? '') ? req.headers.get('Origin') : 'https://squashhub.co.za';
      const result = await sendTemplateEmail('club-notification', to, {
        templateData: { clubName: c?.name ?? undefined, clubLogoUrl: c?.logo_url ?? undefined, title: `[TEST] ${ballot.title} — nominations for the committee`, messageBody: filled, url: origin, ctaLabel: 'Make your nominations (test link)', signatureHtml: c?.email_signature_html ?? undefined, disclaimer: c?.email_disclaimer ?? undefined },
        idempotencyKey: `agm-nom-test-${auth.user.id}-${input.ballot_id}-${input.request_id}`,
      });
      return json(result);
    }
    const documents: { name: string; url: string }[] = [];
    for (const doc of Array.isArray(ballot.documents) ? ballot.documents : []) {
      if (!doc || typeof doc.path !== 'string' || !doc.path.startsWith(`${ballot.club_id}/`)) continue;
      const { data, error } = await admin.storage.from('agm-documents').createSignedUrl(doc.path, 604800);
      if (error) return json({ error: 'Could not prepare a meeting document' }, 500);
      if (data?.signedUrl) documents.push({ name: String(doc.name || 'Meeting document'), url: data.signedUrl });
    }
    const { data: club } = await admin.from('clubs').select('name,email_signature_html,email_disclaimer').eq('id', ballot.club_id).maybeSingle();
    const clubName = String(club?.name ?? '');
    const sigHtml = String(club?.email_signature_html ?? '');
    const logo = sigHtml.match(/<img[^>]+src="(https:[^"]+)"/i)?.[1];
    const lines = [...sigHtml.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const rawToken = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken)));
    const { error: te } = await admin.from('agm_preview_tokens').insert({ token_hash: '\\x' + Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join(''), ballot_id: input.ballot_id, club_member_id: member.id });
    if (te) return json({ error: 'Could not create preview links' }, 500);
    const origin = /^https:\/\/[a-z0-9.-]+$/i.test(req.headers.get('Origin') ?? '') ? req.headers.get('Origin') : 'https://squashhub.co.za';
    const templateData = { title: ballot.title, memberName: member.name, meeting: ballot.meeting_at ? format(ballot.meeting_at) : undefined, venue: ballot.meeting_venue, details: ballot.meeting_details, deadline: format(ballot.deadline), documents, inviteUrl: `${origin}/agm/${rawToken}`, voteUrl: `${origin}/vote/${rawToken}`, signature: { logo, lines }, disclaimer: club?.email_disclaimer ?? undefined };
    // Send from the club's own mailbox (same settings as live club emails) when configured.
    const { data: smtp } = await admin.from('club_secrets').select('smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email').eq('club_id', ballot.club_id).maybeSingle();
    if (smtp?.smtp_host && smtp?.smtp_user && smtp?.smtp_pass && smtp?.sender_email) {
      const port = Number(smtp.smtp_port) || 587;
      if (![25, 465, 587, 2525].includes(port)) return json({ error: `Club mail port ${port} not allowed` }, 400);
      const tpl = agmTemplate;
      const element = React.createElement(tpl.component, templateData);
      const html = await renderAsync(element);
      const text = await renderAsync(element, { plainText: true });
      const subject = typeof tpl.subject === 'function' ? tpl.subject(templateData) : tpl.subject;
      const nodemailer = await import('npm:nodemailer@6.9.16');
      const transporter = nodemailer.default.createTransport({ host: String(smtp.smtp_host).trim(), port, secure: port === 465, requireTLS: port === 587, auth: { user: String(smtp.smtp_user).trim(), pass: String(smtp.smtp_pass) } });
      const senderName = String(smtp.sender_name || clubName || 'Club').trim();
      const info: any = await transporter.sendMail({ from: `${senderName} <${String(smtp.sender_email).trim()}>`, to, subject, html, text });
      if (Array.isArray(info?.rejected) && info.rejected.length) return json({ error: `Club mail server rejected ${to}` }, 502);
      return json({ sent: true, via: 'club' });
    }
    const result = await sendTemplateEmail('agm-invite-test', to, {
      templateData,
      idempotencyKey: `agm-test-${auth.user.id}-${input.ballot_id}-${input.request_id}`,
    });
    return json(result);
  } catch (error) {
    if (error instanceof EmailAPIError) return json({ error: error.status === 429 ? 'Email sending is busy. Please try again later.' : 'The email could not be sent. Check email delivery history.', code: error.code }, error.status === 429 ? 429 : 502);
    return json({ error: error instanceof Error ? error.message : 'Could not send test email' }, 400);
  }
});