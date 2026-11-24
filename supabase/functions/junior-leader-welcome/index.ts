// junior-leader-welcome
// Super Admin only. Sends the Potchefstroom / North West junior leader welcome
// letter from the SquashHub main address. mode "test" sends one sample copy to
// the signed-in Super Admin (sample button, no real activation link).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendAppEmail } from '../_shared/send-app-email.ts';
import { platformSignature, STRATUS_LOGO_URL } from '../_shared/platform-signature.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export function letter(first: string, role: string, email: string) {
  return [
    `Hi ${first},`,
    `Following our discussions with Vian Crafford about running junior squash on SquashHub, we've set up the following for you.`,
    `You've been added to Potchefstroom Squash Club on SquashHub. You're also an administrator of:\n• North West Junior Squash (the provincial junior association)\n• Northern Country Districts Juniors (the junior zone)`,
    `YOUR TEMPORARY CLUB ROLE\nPotchefstroom isn't fully activated on SquashHub yet. Until it is, we've made you ${role} of the club. This gives you admin rights in the Potchefstroom club app, so you can run the junior squad and manage the club. We'll review these roles once the club is fully activated.`,
    `STEP 1 – ACTIVATE YOUR ACCOUNT\nClick the button at the bottom of this email and choose your password.\nUse this email address (${email}) to sign in.\nThe link is for you only, so please don't forward it.`,
    `STEP 2 – SWITCH BETWEEN YOUR WORKSPACES\nAfter you sign in, you'll land on Potchefstroom Squash Club. To move between your workspaces:\n1. Tap the club name / logo at the top to open Switch workspace.\n2. Choose North West Junior Squash or Northern Country Districts Juniors.\n3. Use the same menu to switch back to Potchefstroom at any time.\nYou log in everywhere with the same email address and password — one login for all your workspaces.`,
    `STEP 3 – GET YOUR JUNIOR PLAYERS ON BOARD\nJunior players are added through North West Junior Squash:\n1. Switch to North West Junior Squash.\n2. Check and confirm the list of clubs.\n3. Create a registration link and share it with your juniors and their parents.\nPlayers under 18 need a parent's name, cell number and consent. Junior bodies have no fees or subscriptions.`,
    `WHERE TO SEE YOUR JUNIOR SQUAD\nIn Potchefstroom, open Leagues on the dashboard, or go to Club Admin → Leagues. That's where you'll see the club's junior squash players.`,
    `As administrators you can also set up tournaments and leagues and edit their results. We'll refine your access rights over the next while, so some screens may change slightly.`,
    `ALREADY HAVE A LIST OF JUNIOR PLAYERS?\nIf you already have a list of junior players in your province or district, send it to us and we'll import it for you — quicker than setting up each player by hand:\n• Email it to support@squashhub.co.za\n• Or WhatsApp it to 083 375 9003`,
    `NEED HELP?\nThis email comes from a no-reply address, so please don't reply here.\n• Email support@squashhub.co.za\n• WhatsApp us on 083 375 9003\n• Or open Support in the app.`,
  ].join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: auth } = await admin.auth.getUser((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''));
  if (!auth?.user) return json({ error: 'Please sign in' }, 401);
  const { data: ok } = await admin.rpc('is_platform_admin', { _user_id: auth.user.id });
  if (!ok) return json({ error: 'Super Admin only' }, 403);
  const body = await req.json().catch(() => ({}));

  if (body?.mode === 'live') {
    // One-time send: real activation links for the three Potchefstroom junior
    // leaders, with an information copy to Vian Crafford (the managed email API
    // has no CC field, so the copy is a separate send).
    const RECIPIENTS = [
      { memberId: '3aa14e12-56bc-4c27-8387-ef45e64fa891', name: 'Charlie Fourie', role: 'Chairman', email: 'bakkiesfourie@yahoo.com' },
      { memberId: '99ea9827-fa6d-46b4-8451-52a70cc33ca8', name: 'Alwyn Venter', role: 'Vice-Chairman', email: 'avtraining13@gmail.com' },
      { memberId: 'fc7f6eb1-eb77-4e3e-af50-4401c7e1f00f', name: 'Cara Fourie', role: 'Secretary', email: 'carawilloughby@yahoo.com' },
    ];
    const VIAN = 'craffordv@gmail.com';
    const results: Record<string, unknown>[] = [];
    for (const r of RECIPIENTS) {
      const { count } = await admin.from('member_activation_invites').select('id', { count: 'exact', head: true })
        .eq('club_member_id', r.memberId).gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (count) { results.push({ name: r.name, skipped: 'activation already sent in the last 24h' }); continue; }
      const { data: token, error: tErr } = await admin.rpc('issue_member_activation_token', {
        _club_member_id: r.memberId, _campaign_id: null, _issued_by: auth.user.id, _days: 14,
      });
      if (tErr || !token) { results.push({ name: r.name, error: tErr?.message || 'no token' }); continue; }
      const link = `https://squashhub.co.za/activate?t=${encodeURIComponent(String(token))}&next=${encodeURIComponent('/')}`;
      const first = r.name.split(' ')[0];
      const base = {
        clubName: 'SquashHub',
        url: link,
        ctaLabel: 'Activate my account',
        clubLogoUrl: STRATUS_LOGO_URL,
        signatureHtml: platformSignature('Kind regards,'),
      };
      const sent = await sendAppEmail({
        templateName: 'club-notification',
        recipientEmail: r.email,
        idempotencyKey: `junior-leader-welcome-${r.memberId}`,
        templateData: {
          ...base,
          title: 'Welcome to SquashHub – activate your Potchefstroom account',
          messageBody: letter(first, r.role, r.email),
        },
      });
      const copy = await sendAppEmail({
        templateName: 'club-notification',
        recipientEmail: VIAN,
        idempotencyKey: `junior-leader-welcome-cc-${r.memberId}`,
        templateData: {
          ...base,
          title: `Copy: Welcome to SquashHub – ${r.name}`,
          messageBody: `Copy for your information — this activation email was sent to ${r.name} (${r.email}).\n\n` + letter(first, r.role, r.email),
        },
      });
      results.push({ name: r.name, sent: sent.ok, cc: copy.ok });
    }
    return json({ results });
  }

  if (body?.mode !== 'test') return json({ error: 'Unknown mode' }, 400);
  const to = auth.user.email!;
  const r = await sendAppEmail({
    templateName: 'club-notification',
    recipientEmail: to,
    idempotencyKey: `junior-leader-welcome-test-${crypto.randomUUID()}`,
    templateData: {
      clubName: 'SquashHub',
      title: '[TEST] Welcome to SquashHub – activate your Potchefstroom account',
      messageBody: letter('Charlie', 'Chairman', 'charlie@example.com'),
      url: 'https://squashhub.co.za/auth',
      ctaLabel: 'Activate my account',
      clubLogoUrl: STRATUS_LOGO_URL,
      signatureHtml: platformSignature('Kind regards,'),
    },
  });
  return json({ to, result: r });
});
