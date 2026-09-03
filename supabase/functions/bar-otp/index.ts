// Sends a one-time bar verification code to a member's registered mobile
// number. Used only as the recovery route when a member has no Bar PIN, has
// forgotten it, or the PIN has been temporarily locked after failed attempts.
//
// Authorisation is delegated to the database: the caller's own JWT is used to
// call `get_bar_pin_status`, which allows the member themselves or club staff
// with the Bar permission for that same club — nobody else.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendAppEmail } from "../_shared/send-app-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function maskPhone(raw: string) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 4) return "your registered number";
  return `••• ••• ${digits.slice(-3)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Please sign in" }, 401);

    const { club_member_id } = await req.json().catch(() => ({}));
    if (!club_member_id) return json({ error: "Missing member" }, 400);

    // Caller-scoped client — the RPC enforces who may ask for this member.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: status, error: statusErr } = await caller.rpc("get_bar_pin_status", {
      _club_member_id: club_member_id,
    });
    if (statusErr) return json({ error: statusErr.message }, 403);
    if (!(status as any)?.has_phone) {
      return json({ error: "No mobile number is on file for this member — please ask the club to add one." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, name, phone, email")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member) return json({ error: "Member not found" }, 404);

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, logo_url, whatsapp_enabled")
      .eq("id", member.club_id)
      .maybeSingle();

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error: storeErr } = await admin.rpc("store_bar_otp", {
      _club_member_id: club_member_id,
      _code: code,
    });
    if (storeErr) return json({ error: storeErr.message }, 429);

    const message =
      `${code} is your ${club?.name || "club"} bar verification code. ` +
      `It expires in 10 minutes. Never share it with anyone, including bar staff.`;

    let channel: "whatsapp" | "email" | null = null;
    if (club?.whatsapp_enabled) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({
          club_id: member.club_id,
          recipients: [{ member_id: member.id, phone: member.phone }],
          body: message,
          kind: "bar_otp",
          category: "utility",
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && (out?.sent ?? 0) >= 1) channel = "whatsapp";
      else console.warn("bar-otp whatsapp send failed", out?.error);
    }

    if (!channel && member.email) {
      const sent = await sendAppEmail({
        templateName: "club-notification",
        recipientEmail: member.email,
        clubId: member.club_id,
        templateData: {
          clubName: club?.name,
          clubLogoUrl: club?.logo_url,
          recipientName: member.name,
          title: "Your bar verification code",
          messageBody: message,
        },
      });
      if ((sent as any)?.ok) channel = "email";
    }

    if (!channel) {
      return json({ error: "We could not send a verification code right now — please use your Bar PIN." }, 502);
    }

    return json({ ok: true, channel, sent_to: channel === "whatsapp" ? maskPhone(member.phone || "") : "your email" });
  } catch (e) {
    console.error("bar-otp error", e);
    return json({ error: (e as Error)?.message || "Unexpected error" }, 500);
  }
});
