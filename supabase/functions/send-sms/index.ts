// Platform-wide SMS sender.
//
// One gateway for the whole platform, configured under Super Admin → Settings
// → SMS gateway (app_settings keys `sms_*`; credentials live in the
// `sms_private_*` keys which only platform admins can read).
//
// Providers are handled by small adapters so the portal can be swapped without
// touching any feature code.
//
// Clubs must opt in (clubs.sms_enabled) before club messages are sent.
// Platform notices (invoices, trials) pass `platform: true` and are always
// allowed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Recipient = {
  member_id?: string | null;
  phone?: string | null;
  /** Optional per-recipient overrides of the shared body. */
  body?: string | null;
};

type Payload = {
  club_id?: string | null;
  /** Platform-level notice (subscription invoice etc.) — no club opt-in check. */
  platform?: boolean;
  recipients: Recipient[];
  body?: string;
  kind?: string;
  /**
   * Critical messages (payments, security, account) ignore the member's
   * marketing opt-out. Everything else honours it.
   */
  critical?: boolean;
};

const GSM7 =
  /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** SMS segment count — 160/153 for GSM-7, 70/67 for unicode. */
export function segmentsFor(text: string): number {
  const len = [...text].length;
  if (len === 0) return 1;
  const gsm = GSM7.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return len <= single ? 1 : Math.ceil(len / multi);
}

/** Normalise to E.164 digits (no +). Defaults to South Africa. */
export function normalisePhone(raw?: string | null, defaultCc = "27"): string | null {
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

type GatewayConfig = {
  provider: string;
  apiBase: string;
  sender: string;
  key: string;
  secret: string;
  countryCode: string;
  unitCost: number;
  enabled: boolean;
};

type SendOutcome = { ok: boolean; ref?: string | null; error?: string };

/**
 * Provider adapters. Each returns the provider's status + body verbatim on
 * failure so the real reason surfaces in the log and the UI.
 */
async function sendViaProvider(
  cfg: GatewayConfig,
  to: string,
  text: string,
  sender: string,
): Promise<SendOutcome> {
  try {
    switch (cfg.provider) {
      case "smsportal": {
        // https://docs.smsportal.com — REST v1, Basic auth (client id/secret).
        const base = cfg.apiBase || "https://rest.smsportal.com/v1";
        const resp = await fetch(`${base}/bulkmessages`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${cfg.key}:${cfg.secret}`),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ content: text, destination: to }],
            sendOptions: sender ? { senderId: sender } : undefined,
          }),
        });
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        let ref: string | null = null;
        try {
          const parsed = JSON.parse(body);
          ref = parsed?.messages?.[0]?.apiMessageId ?? parsed?.eventId ?? null;
        } catch { /* provider returned non-JSON */ }
        return { ok: true, ref };
      }

      case "clickatell": {
        const base = cfg.apiBase || "https://platform.clickatell.com";
        const resp = await fetch(`${base}/v1/message`, {
          method: "POST",
          headers: { Authorization: cfg.key, "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ channel: "sms", to, content: text, from: sender || undefined }] }),
        });
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        let ref: string | null = null;
        try { ref = JSON.parse(body)?.messages?.[0]?.apiMessageId ?? null; } catch { /* ignore */ }
        return { ok: true, ref };
      }

      case "bulksms": {
        const base = cfg.apiBase || "https://api.bulksms.com/v1";
        const resp = await fetch(`${base}/messages`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${cfg.key}:${cfg.secret}`),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to, body: text, from: sender || undefined }),
        });
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        let ref: string | null = null;
        try { const p = JSON.parse(body); ref = Array.isArray(p) ? p[0]?.id ?? null : p?.id ?? null; } catch { /* ignore */ }
        return { ok: true, ref };
      }

      case "winsms": {
        const base = cfg.apiBase || "https://www.winsms.co.za/api/rest/v1";
        const resp = await fetch(`${base}/sms/outgoing/send`, {
          method: "POST",
          headers: { AUTHORIZATION: cfg.key, "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, recipients: [{ mobileNumber: to }] }),
        });
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        return { ok: true, ref: null };
      }

      case "twilio": {
        // key = Account SID, secret = Auth token.
        const form = new URLSearchParams({ To: `+${to}`, Body: text, From: sender });
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${cfg.key}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: "Basic " + btoa(`${cfg.key}:${cfg.secret}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form,
          },
        );
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        let ref: string | null = null;
        try { ref = JSON.parse(body)?.sid ?? null; } catch { /* ignore */ }
        return { ok: true, ref };
      }

      case "gatewayapi": {
        const base = cfg.apiBase || "https://gatewayapi.com/rest";
        const resp = await fetch(`${base}/mtsms`, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${cfg.key}:`),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sender: sender || "SquashHub", message: text, recipients: [{ msisdn: Number(to) }] }),
        });
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        return { ok: true, ref: null };
      }

      case "generic": {
        // Any portal that accepts a simple JSON POST. The API base is the full
        // endpoint; the key is sent as a bearer token when present.
        if (!cfg.apiBase) return { ok: false, error: "No API endpoint configured for the generic provider." };
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
        const resp = await fetch(cfg.apiBase, {
          method: "POST",
          headers,
          body: JSON.stringify({ to, message: text, from: sender || undefined }),
        });
        const body = await resp.text();
        if (!resp.ok) return { ok: false, error: `[${resp.status}] ${body}` };
        return { ok: true, ref: null };
      }

      default:
        return { ok: false, error: `Unknown SMS provider "${cfg.provider}".` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bearer = authHeader.replace("Bearer ", "").trim();
    const isInternal = !!serviceKey && bearer === serviceKey;

    let userId = "";
    if (!isInternal) {
      const { data: userData, error: userErr } = await admin.auth.getUser(bearer);
      if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 401);
      userId = userData.user.id;
    }

    const payload = (await req.json()) as Payload;
    const recipients = Array.isArray(payload?.recipients) ? payload.recipients : [];
    if (recipients.length === 0) return json({ error: "recipients is required" }, 400);
    if (recipients.length > 500) return json({ error: "Maximum 500 recipients per call" }, 400);
    if (!payload.body && !recipients.some((r) => r.body)) {
      return json({ error: "body is required" }, 400);
    }

    const clubId = payload.club_id ?? null;
    const isPlatformNotice = !!payload.platform || !clubId;

    // ---- Authorisation ------------------------------------------------------
    if (!isInternal) {
      const { data: isPlatformAdmin } = await admin.rpc("is_platform_admin", { _user_id: userId });
      if (isPlatformNotice) {
        if (!isPlatformAdmin) return json({ error: "Platform admin rights required" }, 403);
      } else {
        const { data: isClubAdmin } = await admin.rpc("is_club_admin", {
          _user_id: userId,
          _club_id: clubId,
        });
        if (!isClubAdmin && !isPlatformAdmin) {
          return json({ error: "You need club admin rights to send SMS messages" }, 403);
        }
      }
    }

    // ---- Gateway configuration ---------------------------------------------
    const { data: settingRows } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "sms_enabled",
        "sms_provider",
        "sms_sender_id",
        "sms_default_country_code",
        "sms_api_base",
        "sms_unit_cost",
        "sms_private_api_key",
        "sms_private_api_secret",
      ]);
    const s: Record<string, string> = {};
    for (const row of settingRows ?? []) s[row.key] = String(row.value ?? "").replace(/^"|"$/g, "");

    const cfg: GatewayConfig = {
      provider: (s.sms_provider || "smsportal").toLowerCase(),
      apiBase: s.sms_api_base || "",
      sender: s.sms_sender_id || "SquashHub",
      key: s.sms_private_api_key || "",
      secret: s.sms_private_api_secret || "",
      countryCode: (s.sms_default_country_code || "27").replace(/\D/g, "") || "27",
      unitCost: Number(s.sms_unit_cost || 0) || 0,
      enabled: s.sms_enabled === "true",
    };

    if (!cfg.enabled) {
      return json(
        { error: "SMS sending is switched off. Turn it on under Super Admin → Settings → SMS gateway." },
        503,
      );
    }
    if (!cfg.key && cfg.provider !== "generic") {
      return json(
        { error: "The SMS gateway credentials are not saved yet (Super Admin → Settings → SMS gateway)." },
        503,
      );
    }

    // ---- Club opt-in + sender ----------------------------------------------
    let sender = cfg.sender;
    if (!isPlatformNotice) {
      const { data: club } = await admin
        .from("clubs")
        .select("name, sms_enabled, sms_sender_id")
        .eq("id", clubId)
        .maybeSingle();
      if (!club?.sms_enabled) {
        return json(
          { error: "SMS messaging is switched off for this club. Enable it under Club Admin → Subscription → SMS messaging." },
          403,
        );
      }
      sender = club.sms_sender_id || cfg.sender;
    }

    // ---- Resolve phones + honour opt-outs -----------------------------------
    const memberIds = recipients.map((r) => r.member_id).filter(Boolean) as string[];
    const memberMap = new Map<string, { phone: string | null; sms_opt_out: boolean }>();
    if (memberIds.length) {
      const { data: members } = await admin
        .from("club_members")
        .select("id, phone, sms_opt_out")
        .in("id", memberIds);
      for (const m of members ?? []) {
        memberMap.set(m.id, { phone: m.phone, sms_opt_out: !!m.sms_opt_out });
      }
    }

    const results: Array<Record<string, unknown>> = [];

    for (const r of recipients) {
      const member = r.member_id ? memberMap.get(r.member_id) : undefined;
      const to = normalisePhone(r.phone ?? member?.phone ?? null, cfg.countryCode);
      const text = String(r.body ?? payload.body ?? "").trim();

      if (!to) {
        results.push({ member_id: r.member_id, status: "skipped", error: "No usable mobile number" });
        continue;
      }
      if (member?.sms_opt_out && !payload.critical) {
        results.push({ member_id: r.member_id, to, status: "skipped", error: "Member opted out of SMS" });
        continue;
      }
      if (!text) {
        results.push({ member_id: r.member_id, to, status: "skipped", error: "Empty message" });
        continue;
      }

      const segments = segmentsFor(text);
      const outcome = await sendViaProvider(cfg, to, text, sender);
      const status = outcome.ok ? "sent" : "failed";
      if (!outcome.ok) console.error(`SMS send failed for ${to}: ${outcome.error}`);

      await admin.from("sms_send_log").insert({
        club_id: clubId,
        member_id: r.member_id ?? null,
        to_phone: to,
        from_sender: sender,
        kind: payload.kind ?? "notice",
        body: text,
        segments,
        unit_cost: outcome.ok ? cfg.unitCost * segments : 0,
        billable: outcome.ok && !isPlatformNotice,
        status,
        error: outcome.error ?? null,
        provider: cfg.provider,
        provider_ref: outcome.ref ?? null,
        sent_by: userId || null,
      });

      results.push({ member_id: r.member_id, to, status, segments, error: outcome.error ?? null });
    }

    const sent = results.filter((r) => r.status === "sent").length;
    return json({ sent, total: results.length, results, provider: cfg.provider, unit_cost: cfg.unitCost });
  } catch (e) {
    console.error("send-sms error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
