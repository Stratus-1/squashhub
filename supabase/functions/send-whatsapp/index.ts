// Platform-wide WhatsApp sender.
//
// Two sender modes per club (clubs.whatsapp_sender_mode):
//   'platform' — the shared SquashHub sender number via the Twilio connector
//                gateway. Messages are metered and billed to the club.
//   'own'      — the club's own WhatsApp Business (Twilio) account, with
//                credentials in club_secrets. Nothing is billed by SquashHub;
//                the club is invoiced directly by their provider.
//
// Clubs must opt in (clubs.whatsapp_enabled) before anything is sent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { clubHasCapability } from "../_shared/capabilities.ts";

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
  /**
   * Registry key from public.whatsapp_templates (e.g. 'club_notice',
   * 'tournament_invite'). Resolved to the approved Content SID; named
   * variables are mapped onto the template's numbered placeholders.
   */
  template_key?: string;
  template_variables?: Record<string, string>;
  kind?: string;
  /** Message category — drives the per-message rate charged to the club. */
  category?: "utility" | "service" | "marketing";
  /**
   * Ask a question whose reply (Yes/No button or text) should be written back
   * into the app. e.g. { kind: 'event_rsvp', target_id: '<event id>' }
   */
  interaction?: {
    kind: "event_rsvp" | "champ_entry" | "generic";
    target_id?: string | null;
    prompt?: string | null;
  };
};

/** Normalise to E.164 digits (no +). Defaults to South Africa. */
function normalisePhone(raw?: string | null, defaultCc = "27"): string | null {
  if (!raw) return null;
  let s = String(raw).replace(/^whatsapp:/i, "").trim().replace(/[^\d+]/g, "");
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


/**
 * Ask whatsapp-templates-sync to create/submit templates on Twilio + Meta.
 * Fire-and-forget: a send must never fail because registration is lagging.
 */
async function requestTemplateSync(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  keys: string[],
) {
  try {
    const { data: secretRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_templates_internal_secret")
      .maybeSingle();
    const secret = (secretRow as { value?: string } | null)?.value;
    if (!secret) return;
    await fetch(`${supabaseUrl}/functions/v1/whatsapp-templates-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ keys }),
    });
  } catch (e) {
    console.error("template auto-sync failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const twilioKey = Deno.env.get("TWILIO_API_KEY");
    const platformFrom = normalisePhone(Deno.env.get("WHATSAPP_FROM"));

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Trusted internal caller (e.g. the scheduled comms dispatcher) presents
    // the service-role key instead of a user JWT.
    const bearer = authHeader.replace("Bearer ", "").trim();
    const isInternal = !!serviceKey && bearer === serviceKey;

    let userId = "";
    if (!isInternal) {
      const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
      if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
      userId = userData.user.id;
    }

    const payload = (await req.json()) as Payload;
    const clubId = payload?.club_id;
    const recipients = Array.isArray(payload?.recipients) ? payload.recipients : [];
    if (!clubId) return json({ error: "club_id is required" }, 400);
    if (recipients.length === 0) return json({ error: "recipients is required" }, 400);
    if (recipients.length > 200) return json({ error: "Maximum 200 recipients per call" }, 400);
    if (!payload.body && !payload.content_sid && !payload.template_key) {
      return json({ error: "Either body, content_sid or template_key is required" }, 400);
    }

    // ---- Resolve a registry template key to an approved Content SID --------
    let contentSid = payload.content_sid ?? null;
    let contentVariables: Record<string, string> | null = payload.content_variables ?? null;
    let templateOrder: string[] | null = null;
    if (!contentSid && payload.template_key) {
      const { data: tpl } = await admin
        .from("whatsapp_templates")
        .select("content_sid, approval_status, variables")
        .eq("key", payload.template_key)
        .maybeSingle();
      if (tpl?.content_sid && tpl.approval_status === "approved") {
        contentSid = tpl.content_sid;
        templateOrder = Array.isArray(tpl.variables) ? (tpl.variables as string[]) : [];
      }

      // Self-healing: a template that is missing or not approved yet is pushed
      // to Twilio/Meta straight away (fire-and-forget) so it is registered
      // before the next send, and this send falls back to the generic
      // 'club_notice' template — which every dynamic message fits inside.
      if (!contentSid) {
        if (tpl) void requestTemplateSync(admin, supabaseUrl, [payload.template_key]);
        const { data: generic } = await admin
          .from("whatsapp_templates")
          .select("content_sid, approval_status, variables")
          .eq("key", "club_notice")
          .maybeSingle();
        if (generic?.content_sid && generic.approval_status === "approved" && payload.body) {
          contentSid = generic.content_sid;
          templateOrder = Array.isArray(generic.variables) ? (generic.variables as string[]) : [];
        }
      }
      // Not approved yet: fall back to free-form text, which Twilio only
      // delivers inside the 24h customer-service window.
      if (!contentSid && !payload.body) {
        return json(
          {
            error:
              `The WhatsApp template "${payload.template_key}" is not approved yet, and no fallback text was supplied.`,
          },
          503,
        );
      }
    }
    const category = payload.category ?? (contentSid ? "utility" : "service");

    // Authorisation: club admin of this club, or platform admin.
    if (!isInternal) {
      const [{ data: isClubAdmin }, { data: isPlatformAdmin }] = await Promise.all([
        admin.rpc("is_club_admin", { _user_id: userId, _club_id: clubId }),
        admin.rpc("is_platform_admin", { _user_id: userId }),
      ]);
      if (!isClubAdmin && !isPlatformAdmin) {
        return json({ error: "You need club admin rights to send WhatsApp messages" }, 403);
      }
    }

    const { data: club } = await admin
      .from("clubs")
      .select("name, whatsapp_enabled, whatsapp_sender_mode")
      .eq("id", clubId)
      .maybeSingle();
    const clubName = club?.name ?? "SquashHub";

    // Map named template variables onto the template's numbered placeholders.
    // WhatsApp rejects blank variables, so unfilled slots fall back sensibly.
    if (templateOrder) {
      const named: Record<string, string> = {
        club: clubName,
        message: payload.body ?? "",
        ...(payload.template_variables ?? {}),
      };
      const numbered: Record<string, string> = {};
      templateOrder.forEach((name, i) => {
        const v = (named[name] ?? "").toString().trim();
        numbered[String(i + 1)] = v || "-";
      });
      contentVariables = numbered;
    }

    if (!(await clubHasCapability(admin, clubId, "whatsapp"))) {
      return json(
        {
          error:
            "WhatsApp messaging is switched off for this club. Turn it on under Club Admin → Manage Features.",
        },
        403,
      );
    }

    if (!club?.whatsapp_enabled) {
      return json(
        {
          error:
            "WhatsApp messaging is switched off for this club. Enable it under Club Admin → Subscription → WhatsApp messaging.",
        },
        403,
      );
    }

    // ---- Resolve the sender -------------------------------------------------
    const ownMode = club.whatsapp_sender_mode === "own";
    let from = platformFrom;
    let ownAuth: string | null = null;
    let ownAccountSid: string | null = null;

    if (ownMode) {
      const { data: secrets } = await admin
        .from("club_secrets")
        .select("whatsapp_account_sid, whatsapp_auth_token, whatsapp_from")
        .eq("club_id", clubId)
        .maybeSingle();
      from = normalisePhone(secrets?.whatsapp_from);
      ownAccountSid = secrets?.whatsapp_account_sid ?? null;
      if (!from || !ownAccountSid || !secrets?.whatsapp_auth_token) {
        return json(
          {
            error:
              "This club is set to use its own WhatsApp Business account, but the account SID, auth token or sender number is missing.",
          },
          503,
        );
      }
      ownAuth = "Basic " + btoa(`${ownAccountSid}:${secrets.whatsapp_auth_token}`);
    } else {
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
        return json({ error: "No WhatsApp sender number configured (WHATSAPP_FROM)." }, 503);
      }
    }

    // Clubs on their own account are never billed by SquashHub.
    let unitCost = 0;
    if (!ownMode) {
      const { data: rate } = await admin.rpc("whatsapp_rate", {
        _club_id: clubId,
        _category: category,
      });
      unitCost = Number(rate ?? 0);
    }

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
      if (contentSid) {
        form.set("ContentSid", contentSid);
        let vars: Record<string, string> = { ...(contentVariables ?? { club: clubName }) };
        if (r.variables) {
          if (templateOrder) {
            templateOrder.forEach((name, i) => {
              const v = (r.variables?.[name] ?? "").toString().trim();
              if (v) vars[String(i + 1)] = v;
            });
          } else {
            vars = { ...vars, ...r.variables };
          }
        }
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
        const url = ownMode
          ? `https://api.twilio.com/2010-04-01/Accounts/${ownAccountSid}/Messages.json`
          : `${GATEWAY_URL}/Messages.json`;
        const headers: Record<string, string> = ownMode
          ? { Authorization: ownAuth!, "Content-Type": "application/x-www-form-urlencoded" }
          : {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": twilioKey!,
              "Content-Type": "application/x-www-form-urlencoded",
            };

        const resp = await fetch(url, { method: "POST", headers, body: form });
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
        from_phone: from,
        direction: "out",
        kind: payload.kind ?? (contentSid ? "template" : "freeform"),
        category,
        unit_cost: status === "sent" ? unitCost : 0,
        billable: status === "sent" && !ownMode,
        body: logBody,
        provider_sid: sid,
        status,
        error,
        sent_by: userId || null,
        payload: payload.interaction ? { interaction: payload.interaction } : null,
      });

      // Register the pending question so the member's Yes/No reply can be
      // routed back into the app by the whatsapp-inbound webhook.
      if (status === "sent" && payload.interaction) {
        await admin.from("whatsapp_interactions").insert({
          club_id: clubId,
          member_id: r.member_id ?? null,
          phone: to,
          kind: payload.interaction.kind,
          target_id: payload.interaction.target_id ?? null,
          prompt: payload.interaction.prompt ?? payload.body ?? null,
        });
      }

      results.push({ member_id: r.member_id, to, status, sid, error });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    return json({ sent, total: results.length, results, unit_cost: unitCost, billed: !ownMode });
  } catch (e) {
    console.error("send-whatsapp error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
