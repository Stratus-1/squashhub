// Private email link for committee approval requests.
// Each approver gets a 48-hex secret in their email; only its SHA-256 is stored.
// The link lets that one approver read the request, open its files, and approve
// (with a signature) or decline without logging in. All status changes go
// through the same database writers the app uses.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.25.76';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const token = z.string().regex(/^[0-9a-f]{48}$/);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('view'), token }),
  z.object({
    action: z.literal('sign'), token,
    signature: z.string().max(3_000_000).optional(), // data:image/png;base64,...
    use_saved: z.boolean().optional(),
  }),
  z.object({ action: z.literal('decline'), token, reason: z.string().trim().min(1).max(2000) }),
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request' }, 400);
  const body = parsed.data;
  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const { data: view, error: viewErr } = await admin.rpc('approval_token_view', { p_token: body.token });
  if (viewErr) return json({ error: 'Could not open this request' }, 500);
  if (!view) return json({ error: 'This link is not valid' }, 404);
  const v = view as any;

  if (body.action === 'view') {
    const sign = async (path?: string | null) => {
      if (!path) return null;
      const { data } = await admin.storage.from('club-approvals').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    };
    const attachments = await Promise.all((v.attachments || []).map(async (f: any) => ({ file_name: f.file_name, mime_type: f.mime_type, url: await sign(f.path) })));
    const approvers = await Promise.all((v.approvers || []).map(async (a: any) => ({
      name: a.name, status: a.status, signed_at: a.signed_at, decline_reason: a.decline_reason, signature_url: await sign(a.signature_path),
    })));
    return json({
      club_name: v.club_name, topic: v.topic, description: v.description, amount: v.amount, status: v.status,
      created_at: v.created_at, decided_at: v.decided_at, requester_name: v.requester_name,
      requester_signature_url: await sign(v.requester_signature_path),
      me: { name: v.me?.name, status: v.me?.status },
      has_saved_signature: !!v.saved_signature_path,
      saved_signature_url: await sign(v.saved_signature_path),
      approvers, attachments,
    });
  }

  if (body.action === 'decline') {
    const { error } = await admin.rpc('approval_token_decline', { p_token: body.token, p_reason: body.reason });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  // sign
  const dest = `${v.club_id}/${v.request_id}/sig-${v.me.member_id}-${Date.now()}.png`;
  let bytes: Uint8Array | null = null;
  if (body.use_saved) {
    if (!v.saved_signature_path) return json({ error: 'No saved signature' }, 400);
    const { data, error } = await admin.storage.from('club-approvals').download(v.saved_signature_path);
    if (error || !data) return json({ error: 'Could not read saved signature' }, 500);
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(body.signature || '');
    if (!m) return json({ error: 'Please sign first' }, 400);
    bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bytes.length < 200) return json({ error: 'Please sign first' }, 400);
  }
  const { error: upErr } = await admin.storage.from('club-approvals').upload(dest, bytes, { contentType: 'image/png', upsert: false });
  if (upErr) return json({ error: 'Could not save signature' }, 500);
  const { error } = await admin.rpc('approval_token_sign', { p_token: body.token, p_signature_path: dest });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
});
