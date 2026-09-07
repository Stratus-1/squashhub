// Sends a one-time bar verification code to a member's registered mobile
// number so a charge can be posted to their member account.
//
// These are SYSTEM (transactional) messages: they are always sent by WhatsApp
// or SMS, whether or not the club has switched member messaging on. The club
// messaging switch only governs optional communications — never security or
// payment codes. Usage is still logged and billed to the club.
//
// Authorisation is either:
//   • an unlocked till/counter session token, or an open guest-tab token, for
//     the same club as the member (the cashier flow), or
//   • the caller's own JWT via `get_bar_pin_status` (member or bar staff).
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
  if (digits.length < 4) return "their registered number";
  return `••• ••• ${digits.slice(-3)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    const club_member_id = body?.club_member_id as string | undefined;
    const counter_token = (body?.counter_token as string | undefined) || null;
    const tab_token = (body?.tab_token as string | undefined) || null;
    const requested = String(body?.channel || "").toLowerCase();
    // SMS is the default route: the WhatsApp authentication template is not
    // approved on the shared business number yet, so WhatsApp is a fallback.
    const channelWanted: "whatsapp" | "sms" = requested === "whatsapp" ? "whatsapp" : "sms";

    if (!club_member_id) return json({ error: "Missing member" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, name, phone, email")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member) return json({ error: "Member not found" }, 404);

    // ---- who may ask for a code for this member ----------------------------
    let allowed = false;
    if (counter_token) {
      const { data: sess } = await admin
        .from("bar_counter_sessions")
        .select("club_id, revoked_at")
        .eq("token", counter_token)
        .maybeSingle();
      allowed = !!sess && !sess.revoked_at && sess.club_id === member.club_id;
    }
    if (!allowed && tab_token) {
      const { data: tab } = await admin
        .from("bar_guest_tabs")
        .select("club_id, status")
        .eq("token", tab_token)
        .maybeSingle();
      allowed = !!tab && tab.status === "open" && tab.club_id === member.club_id;
    }
    if (!allowed) {
      if (!authHeader) return json({ error: "Please sign in" }, 401);
      const caller = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: status, error: statusErr } = await caller.rpc("get_bar_pin_status", {
        _club_member_id: club_member_id,
      });
      if (statusErr) return json({ error: statusErr.message }, 403);
      allowed = !!status;
    }
    if (!allowed) return json({ error: "Not allowed" }, 403);

    if (!member.phone && !member.email) {
      return json({ error: "No mobile number is on file for this member — please ask the club to add one." }, 400);
    }

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, logo_url")
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

    const sendWhatsApp = async () => {
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
          template_key: "otp_code",
          template_variables: { code, minutes: "10" },
          kind: "bar_otp",
          category: "utility",
          system: true,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && (out?.sent ?? 0) >= 1) return true;
      console.warn("bar-otp whatsapp send failed", out?.error);
      return false;
    };

    const sendSms = async () => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
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
          critical: true,
          system: true,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && (out?.sent ?? 0) >= 1) return true;
      console.warn("bar-otp sms send failed", out?.error);
      return false;
    };

    let channel: "whatsapp" | "sms" | "email" | null = null;
    if (member.phone) {
      const primary = channelWanted === "sms" ? sendSms : sendWhatsApp;
      const secondary = channelWanted === "sms" ? sendWhatsApp : sendSms;
      if (await primary()) channel = channelWanted;
      else if (await secondary()) channel = channelWanted === "sms" ? "whatsapp" : "sms";
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
      return json({ error: "We could not send a verification code right now — please try the other channel." }, 502);
    }

    return json({
      ok: true,
      channel,
      sent_to: channel === "email" ? "their email" : maskPhone(member.phone || ""),
    });
  } catch (e) {
    console.error("bar-otp error", e);
    return json({ error: (e as Error)?.message || "Unexpected error" }, 500);
  }
});
