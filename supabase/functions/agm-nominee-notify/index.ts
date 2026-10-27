// Tells a member they were nominated (email + in-app notice) with a fresh personal
// link to accept or decline. Called by the nominator's page right after nominating.
// Authorised by the nominator's own token: only the person who made the nomination
// can trigger the notice, and only while it is pending.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import * as React from 'npm:react@18.3.1';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts';
import { template as clubTemplate } from '../_shared/transactional-email-templates/club-notification.tsx';

const schema = z.object({ token: z.string().regex(/^[0-9a-f]{48}$/), position_id: z.string().uuid(), nominee_id: z.string().uuid() }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (s: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
const fmt = (iso: string) => new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Invalid request' }, 400);
    const { token, position_id, nominee_id } = parsed.data;
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: nominator } = await admin.from('agm_nominators').select('ballot_id,club_member_id').eq('token_hash', '\\x' + await sha(token)).maybeSingle();
    if (!nominator) return json({ error: 'Link not valid' }, 403);
    const { data: nom } = await admin.from('agm_nominations').select('id,status').eq('ballot_id', nominator.ballot_id)
      .eq('position_id', position_id).eq('nominee_member_id', nominee_id).eq('nominated_by', nominator.club_member_id).maybeSingle();
    if (!nom || nom.status !== 'pending') return json({ skipped: 'not pending' });

    const [{ data: ballot }, { data: pos }, { data: nominee }, { data: by }] = await Promise.all([
      admin.from('agm_ballots').select('club_id,title,nominations_close_at').eq('id', nominator.ballot_id).single(),
      admin.from('agm_ballot_positions').select('title').eq('id', position_id).single(),
      admin.from('club_members').select('id,name,email,user_id').eq('id', nominee_id).single(),
      admin.from('club_members').select('name').eq('id', nominator.club_member_id).single(),
    ]);
    const { data: club } = await admin.from('clubs').select('name,logo_url').eq('id', ballot!.club_id).single();

    // Fresh personal link for the nominee (replaces any earlier nomination link).
    const raw = hex(crypto.getRandomValues(new Uint8Array(24)));
    const { error: te } = await admin.from('agm_nominators').update({ token_hash: '\\x' + await sha(raw) }).eq('ballot_id', nominator.ballot_id).eq('club_member_id', nominee_id);
    if (te) throw te;
    const origin = /^https:\/\/[a-z0-9.-]+$/i.test(req.headers.get('Origin') ?? '') ? req.headers.get('Origin') : 'https://squashhub.co.za';
    const path = `/nominate/${raw}`;
    const url = `${origin}${path}`;
    const posTitle = pos?.title ?? 'a committee position';
    const closes = ballot?.nominations_close_at ? fmt(ballot.nominations_close_at) : '';

    // In-app notice
    await admin.from('notifications').insert({
      user_id: nominee?.user_id ?? null, club_member_id: nominee_id, type: 'agm_nomination',
      title: `You've been nominated for ${posTitle}`,
      message: `${by?.name ?? 'A member'} nominated you for ${posTitle}. Please accept or decline${closes ? ` before ${closes}` : ''}.`,
      url: path, data: { ballot_id: nominator.ballot_id, nomination_id: nom.id },
    });

    // Email
    let email = 'no-email';
    if (nominee?.email) {
      const data = {
        clubName: club?.name, clubLogoUrl: club?.logo_url ?? undefined, recipientName: nominee.name,
        title: `${ballot?.title}: you've been nominated`,
        messageBody: `${by?.name ?? 'A member'} has nominated you for ${posTitle}. Please accept or decline${closes ? ` before ${closes}` : ''}. Only accepted nominations go onto the ballot. This link replaces any earlier nomination link.`,
        url, ctaLabel: 'Accept or decline',
      };
      const subject = `${ballot?.title}: you've been nominated for ${posTitle}`;
      const { data: smtp } = await admin.from('club_secrets').select('smtp_host,smtp_port,smtp_user,smtp_pass,sender_name,sender_email').eq('club_id', ballot!.club_id).maybeSingle();
      const port = Number(smtp?.smtp_port) || 587;
      if (smtp?.smtp_host && smtp?.smtp_user && smtp?.smtp_pass && smtp?.sender_email && [25, 465, 587, 2525].includes(port)) {
        const el = React.createElement(clubTemplate.component, data);
        const nodemailer = await import('npm:nodemailer@6.9.16');
        const tx = nodemailer.default.createTransport({ host: String(smtp.smtp_host).trim(), port, secure: port === 465, requireTLS: port === 587, auth: { user: String(smtp.smtp_user).trim(), pass: String(smtp.smtp_pass) } });
        await tx.sendMail({ from: `${String(smtp.sender_name || club?.name || 'Club').trim()} <${String(smtp.sender_email).trim()}>`, to: nominee.email, subject, html: await renderAsync(el), text: await renderAsync(el, { plainText: true }) });
        email = 'club';
      } else {
        const r = await sendTemplateEmail('club-notification', nominee.email, { templateData: data, idempotencyKey: `agm-nominated-${nom.id}` });
        email = r.sent ? 'platform' : 'suppressed';
      }
    }
    return json({ notified: true, email });
  } catch (e) {
    console.error('agm-nominee-notify', e);
    return json({ error: 'Could not notify nominee' }, 500);
  }
});
