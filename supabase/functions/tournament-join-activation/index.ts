// tournament-join-activation
// Public (no login): a listed club member found on an open tournament join
// link asks for their personal activation email. The link goes ONLY to the
// email the club holds; the browser never sees the address or the token.
// All eligibility + rate limits live in DB tournament_join_issue_activation.
//
// When the club has no email for the member, the player supplies one (body.email);
// the DB saves it on the membership with an audit row, then the link goes there.
//
// Body: { champ_id: uuid, member_id: uuid, email?: string }
// Returns: { status: "sent" | "too_soon" | "has_login" | "not_available" | "not_open" |
//            "email_required" | "email_has_login" | "email_in_use" | "error", email_hint? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendAppEmail } from "../_shared/send-app-email.ts";
import { clubWebBase } from "../_shared/comms-render.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ status: "error" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ status: "error" }, 400); }
  const champId = String(body?.champ_id || "");
  const memberId = String(body?.member_id || "");
  const email = String(body?.email || "").trim().toLowerCase().slice(0, 254);
  if (!UUID.test(champId) || !UUID.test(memberId)) return json({ status: "error" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("tournament_join_issue_activation", {
    p_champ_id: champId, p_member_id: memberId, p_email: email || null,
  });
  if (error) { console.error("issue activation failed", error.message); return json({ status: "error" }); }
  const r = data as any;
  if (r?.status !== "issued") return json({ status: r?.status || "error", email_hint: r?.email_hint ?? null });

  const base = clubWebBase(r.club_subdomain);
  const next = `/t/${champId}/join`;
  const url = `${base}/activate?t=${encodeURIComponent(r.token)}&next=${encodeURIComponent(next)}`;
  const first = String(r.name || "").trim().split(/\s+/)[0] || "there";
  const sent = await sendAppEmail({
    templateName: "club-notification",
    recipientEmail: r.email,
    clubId: r.club_id,
    idempotencyKey: `tjoin-act-${memberId}-${Date.now()}`,
    templateData: {
      clubName: r.club_name || "",
      title: "Activate your SquashHub account",
      recipientName: first,
      messageBody:
        `You asked to enter ${r.tournament_name || "a tournament"} as a member of ${r.club_name}. ` +
        `Your membership is already on SquashHub — tap the button to choose a password. ` +
        `You'll then go straight to your tournament entry.\n\n` +
        `This link is personal to you, works once and expires in 14 days. If you didn't ask for it, you can ignore this email.`,
      url,
      ctaLabel: "Activate and enter",
    },
  });
  if (!sent.ok) { console.error("activation email failed", (sent as any).error); return json({ status: "error" }); }
  return json({ status: "sent", email_hint: r.email_hint });
});
