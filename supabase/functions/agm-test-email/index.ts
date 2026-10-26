import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';
import { EmailAPIError } from 'npm:@lovable.dev/email-js@0.1.0';
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts';
import { testRecipient } from './policy.ts';

const schema = z.object({ ballot_id: z.string().uuid(), member_id: z.string().uuid(), destination: z.enum(['self', 'member']), request_id: z.string().uuid() }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const format = (iso: string) => new Date(iso).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }) + ' (Johannesburg)';

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
    const { data: ballot, error: be } = await admin.from('agm_ballots').select('club_id,title,meeting_at,meeting_venue,meeting_details,deadline,documents').eq('id', input.ballot_id).maybeSingle();
    if (be || !ballot) return json({ error: 'Ballot not found' }, 404);
    const { data: allowed, error: pe } = await admin.rpc('is_club_admin', { _user_id: auth.user.id, _club_id: ballot.club_id });
    if (pe || !allowed) return json({ error: 'Only this club’s admins can send AGM tests' }, 403);
    const { data: member, error: me } = await admin.from('club_members').select('id,name,email').eq('club_id', ballot.club_id).eq('status', 'active').eq('id', input.member_id).maybeSingle();
    if (me || !member) return json({ error: 'Select an active member of this club' }, 400);
    const to = testRecipient(input.destination, auth.user.email, member);
    const documents: { name: string; url: string }[] = [];
    for (const doc of Array.isArray(ballot.documents) ? ballot.documents : []) {
      if (!doc || typeof doc.path !== 'string' || !doc.path.startsWith(`${ballot.club_id}/`)) continue;
      const { data, error } = await admin.storage.from('agm-documents').createSignedUrl(doc.path, 604800);
      if (error) return json({ error: 'Could not prepare a meeting document' }, 500);
      if (data?.signedUrl) documents.push({ name: String(doc.name || 'Meeting document'), url: data.signedUrl });
    }
    const result = await sendTemplateEmail('agm-invite-test', to, {
      templateData: { title: ballot.title, memberName: member.name, meeting: ballot.meeting_at ? format(ballot.meeting_at) : undefined, venue: ballot.meeting_venue, details: ballot.meeting_details, deadline: format(ballot.deadline), documents },
      idempotencyKey: `agm-test-${auth.user.id}-${input.ballot_id}-${input.request_id}`,
    });
    return json(result);
  } catch (error) {
    if (error instanceof EmailAPIError) return json({ error: error.status === 429 ? 'Email sending is busy. Please try again later.' : 'The email could not be sent. Check email delivery history.', code: error.code }, error.status === 429 ? 429 : 502);
    return json({ error: error instanceof Error ? error.message : 'Could not send test email' }, 400);
  }
});