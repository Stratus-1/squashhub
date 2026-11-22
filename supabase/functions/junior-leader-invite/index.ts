// junior-leader-invite
// A junior association leader adds another leader to their own junior body or
// one below it. Authority lives in DB junior_leader_add (called with the
// caller's own login). For someone without a SquashHub login yet, this sends a
// personal activation email from the SquashHub main address.
//
// Body: { org_id: uuid, email: string, name?: string, phone?: string, home_club_id?: uuid }
// Returns: { status: "added" | "already", email_sent: boolean, name, org_name, home_club } or { error }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { sendAppEmail } from "../_shared/send-app-email.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  org_id: z.string().uuid(),
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  home_club_id: z.string().uuid().optional().nullable(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Please log in again." }, 401);

  let parsed;
  try { parsed = Body.safeParse(await req.json()); } catch { return json({ error: "Invalid request" }, 400); }
  if (!parsed.success) return json({ error: "Please check the name and email address." });
  const b = parsed.data;

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: u, error: uErr } = await asUser.auth.getUser();
  if (uErr || !u?.user) return json({ error: "Please log in again." }, 401);

  const { data, error } = await asUser.rpc("junior_leader_add", {
    p_org: b.org_id, p_email: b.email.toLowerCase(), p_name: b.name || null, p_phone: b.phone || null,
    p_home_club_id: b.home_club_id || null,
  });
  if (error) return json({ error: error.message });
  const r = data as { status: string; member_id: string; needs_activation: boolean; org_name: string; home_club: string | null; name: string };

  let emailSent = false;
  if (r.needs_activation) {
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { count } = await admin.from("member_activation_invites").select("id", { count: "exact", head: true })
      .eq("club_member_id", r.member_id).gt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
    if (!count) {
      const { data: token, error: tErr } = await admin.rpc("issue_member_activation_token", {
        _club_member_id: r.member_id, _campaign_id: null, _issued_by: u.user.id, _days: 14,
      });
      if (tErr || !token) {
        console.error("issue activation failed", tErr?.message);
      } else {
        const link = `https://squashhub.co.za/activate?t=${encodeURIComponent(String(token))}&next=${encodeURIComponent("/")}`;
        const first = String(r.name || "").trim().split(/\s+/)[0] || "there";
        const sent = await sendAppEmail({
          templateName: "club-notification",
          recipientEmail: b.email.toLowerCase(),
          clubId: null,
          idempotencyKey: `junior-leader-${r.member_id}-${Date.now()}`,
          templateData: {
            clubName: "SquashHub",
            title: `You're a leader of ${r.org_name}`,
            recipientName: first,
            messageBody:
              `You have been added as a leader of ${r.org_name} on SquashHub. ` +
              `Tap the button to choose a password and open the ${r.org_name} workspace, where you can manage clubs and junior registrations.` +
              (r.home_club ? `\n\nYou were also listed as a member of ${r.home_club}; the club will confirm this.` : "") +
              `\n\nThis link is personal to you, works once and expires in 14 days.`,
            url: link,
            ctaLabel: "Activate my login",
          },
        });
        emailSent = !!sent.ok;
        if (!sent.ok) console.error("activation email failed", (sent as any).error);
      }
    }
  }
  return json({ status: r.status, email_sent: emailSent, needs_activation: r.needs_activation, name: r.name, org_name: r.org_name, home_club: r.home_club });
});
