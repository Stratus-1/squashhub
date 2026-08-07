// Platform-wide WhatsApp sender.
//
// One shared SquashHub WhatsApp sender number is used for every club; the club
// name is carried in the message itself (and in the template variables), so no
// club needs its own verified number.
//
// Sending goes through the Twilio connector gateway. Callers must be a club
// admin of the club they are sending for (or a platform admin).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

type Recipient = {
  member_id?: string | null;
  phone?: string | null;
  /** Optional per-recipient template variables, merged over the shared ones. */
  variables?: Record<string, string>;
};

type Payload = {
  club_id: string;
  recipients: Recipient[];
  /** Free-form text. Only delivered inside a 24h customer-service window. */
  body?: string;
  /** Approved Twilio Content template SID (HX...). Required outside the 24h window. */
  content_sid?: string;
  content_variables?: Record<string, string>;
  kind?: string;
};

/** Normalise to E.164 digits (no +). Defaults to South Africa. */
function normalisePhone(raw?: string | null, defaultCc = "27"): string | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) s = defaultCc + s.slice(1);
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const twilioKey = Deno.env.get("TWILIO_API_KEY");
    const from = normalisePhone(Deno.env.get("WHATSAPP_FROM"));

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const payload = (await req.json()) as Payload;
    const clubId = payload?.club_id;
    const recipients = Array.isArray(payload?.recipients) ? payload.recipients : [];
    if (!clubId) return json({ error: "club_id is required" }, 400);
    if (recipients.length === 0) return json({ error: "recipients is required" }, 400);
    if (recipients.length > 200) return json({ error: "Maximum 200 recipients per call" }, 400);
    if (!payload.body && !payload.content_sid) {
      return json({ error: "Either body or content_sid is required" }, 400);
    }

    // Authorisation: club admin of this club, or platform admin.
    const [{ data: isClubAdmin }, { data: isPlatformAdmin }] = await Promise.all([
      admin.rpc("is_club_admin", { _user_id: userId, _club_id: clubId }),
      admin.rpc("is_platform_admin", { _user_id: userId }),
    ]);
    if (!isClubAdmin && !isPlatformAdmin) {
      return json({ error: "You need club admin rights to send WhatsApp messages" }, 403);
    }

    if (!lovableKey || !twilioKey) {
      return json(
        {
          error:
            "WhatsApp sending is not connected yet. Ask the platform administrator to link the Twilio connector.",
        },
        503,
      );
    }
    if (!from) {
      return json(
        { error: "No WhatsApp sender number configured (WHATSAPP_FROM)." },
        503,
      );
    }

    const { data: club } = await admin
      .from("clubs")
      .select("name")
      .eq("id", clubId)
      .maybeSingle();
    const clubName = club?.name ?? "SquashHub";

    // Resolve phones + honour opt-outs.
    const memberIds = recipients.map((r) => r.member_id).filter(Boolean) as string[];
    const members = memberIds.length
      ? (
          await admin
            .from("club_members")
            .select("id, phone, whatsapp_opt_out")
            .eq("club_id", clubId)
            .in("id", memberIds)
        ).data ?? []
      : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const results: Array<Record<string, unknown>> = [];

    for (const r of recipients) {
      const member = r.member_id ? memberMap.get(r.member_id) : undefined;
      if (member?.whatsapp_opt_out) {
        results.push({ member_id: r.member_id, status: "skipped", error: "opted out" });
        continue;
      }
      const to = normalisePhone(r.phone ?? member?.phone ?? null);
      if (!to) {
        results.push({ member_id: r.member_id, status: "skipped", error: "no valid phone" });
        continue;
      }

      const form = new URLSearchParams({
        To: `whatsapp:+${to}`,
        From: `whatsapp:+${from}`,
      });
      let logBody = payload.body ?? null;
      if (payload.content_sid) {
        form.set("ContentSid", payload.content_sid);
        const vars = { club: clubName, ...(payload.content_variables ?? {}), ...(r.variables ?? {}) };
        form.set("ContentVariables", JSON.stringify(vars));
        logBody = JSON.stringify(vars);
      } else {
        const text = `*${clubName}*\n${payload.body}`;
        form.set("Body", text);
        logBody = text;
      }

      let status = "sent";
      let sid: string | null = null;
      let error: string | null = null;

      try {
        const resp = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": twilioKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
        });
        const text = await resp.text();
        if (!resp.ok) {
          status = "failed";
          error = `[${resp.status}] ${text}`;
          console.error(`WhatsApp send failed for ${to}: ${error}`);
        } else {
          try {
            sid = (JSON.parse(text) as { sid?: string }).sid ?? null;
          } catch {
            sid = null;
          }
        }
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
      }

      await admin.from("whatsapp_send_log").insert({
        club_id: clubId,
        member_id: r.member_id ?? null,
        to_phone: to,
        kind: payload.kind ?? (payload.content_sid ? "template" : "freeform"),
        body: logBody,
        provider_sid: sid,
        status,
        error,
        sent_by: userId,
      });

      results.push({ member_id: r.member_id, to, status, sid, error });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    return json({ sent, total: results.length, results });
  } catch (e) {
    console.error("send-whatsapp error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
