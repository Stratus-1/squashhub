// Creates a Paynow (Zimbabwe) transaction for a member: fee payment, wallet
// top-up or tournament entry. Paynow hosts the checkout (EcoCash, OneMoney,
// InnBucks, Zimswitch, Visa/Mastercard) and redirects back to returnurl.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { paynowHash, parsePaynowMessage } from "../_shared/paynow.ts";
import { gatewayEnabled, resolveGatewayCreds } from "../_shared/gateway-creds.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYNOW_INITIATE = "https://www.paynow.co.zw/interface/initiatetransaction";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const {
      club_id,
      club_member_id,
      amount,
      purpose,
      fee_ids = [],
      champ_registration_id = null,
      description,
      return_url,
    } = body || {};

    if (!club_id || !club_member_id || !amount || !purpose || !return_url) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (!["fee", "topup", "tournament"].includes(purpose)) {
      return json({ error: "Invalid purpose" }, 400);
    }
    if (purpose === "tournament" && !champ_registration_id) {
      return json({ error: "champ_registration_id is required for tournament purpose" }, 400);
    }
    const amt = Number(amount);
    if (!(amt > 0)) return json({ error: "Invalid amount" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 403);
    }

    const { data: club } = await admin
      .from("clubs")
      .select("id, name, payment_gateway, payment_gateways, currency")
      .eq("id", club_id)
      .maybeSingle();
    if (!club || !gatewayEnabled(club, "paynow")) {
      return json({ error: "Paynow is not configured for this club" }, 400);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id)
      .maybeSingle();
    const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "paynow");
    const integrationId = (creds.integration_id || "").trim();
    const integrationKey = (creds.integration_key || "").trim();
    if (!integrationId || !integrationKey) {
      return json({
        error: "Paynow credentials not configured. Save the club's Integration ID and Integration Key in Admin → Banking.",
      }, 400);
    }

    const defaultDesc =
      purpose === "topup" ? "Wallet top-up" :
      purpose === "tournament" ? "Tournament entry fee" :
      "Fee payment";

    const { data: session, error: sessErr } = await admin
      .from("paynow_payment_sessions")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        amount: amt,
        currency: club.currency || "USD",
        purpose,
        fee_ids,
        champ_registration_id,
        description: description || defaultDesc,
        status: "created",
      })
      .select("id")
      .single();
    if (sessErr || !session) {
      return json({ error: sessErr?.message || "Could not create session" }, 500);
    }

    const safeReturnUrl = sanitizeReturnUrl(return_url);
    const returnUrl = appendParam(safeReturnUrl, "paynow_session", session.id);
    const resultUrl = `${SUPABASE_URL}/functions/v1/paynow-webhook`;

    // Field order matters for the Paynow hash.
    const fields: Array<[string, string]> = [
      ["id", integrationId],
      ["reference", session.id],
      ["amount", amt.toFixed(2)],
      ["additionalinfo", (description || defaultDesc).slice(0, 255)],
      ["returnurl", returnUrl],
      ["resulturl", resultUrl],
      ["authemail", userData.user.email || ""],
      ["status", "Message"],
    ];

    const hash = await paynowHash(fields.map(([, v]) => v), integrationKey);
    const bodyStr = fields
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&") + `&hash=${hash}`;

    const resp = await fetch(PAYNOW_INITIATE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: bodyStr,
    });
    const raw = await resp.text();
    const data = parsePaynowMessage(raw);

    if (!resp.ok || (data.status || "").toLowerCase() !== "ok") {
      console.error("Paynow initiate failed", resp.status, raw.slice(0, 500));
      await admin.from("paynow_payment_sessions").update({ status: "failed" }).eq("id", session.id);
      return json({ error: `Paynow error: ${data.error || raw.slice(0, 200) || resp.status}` }, 502);
    }

    // Validate response hash before trusting the redirect URL.
    const respHash = (data.hash || "").toUpperCase();
    const checkFields = ["status", "browserredirecturl", "pollurl", "paynowreference"]
      .filter((k) => data[k] != null)
      .map((k) => data[k]);
    const expected = await paynowHash(checkFields, integrationKey);
    if (respHash && respHash !== expected) {
      console.error("Paynow response hash mismatch", { session: session.id });
      await admin.from("paynow_payment_sessions").update({ status: "failed" }).eq("id", session.id);
      return json({ error: "Paynow response failed integrity check" }, 502);
    }

    if (!data.browserredirecturl || !data.pollurl) {
      await admin.from("paynow_payment_sessions").update({ status: "failed" }).eq("id", session.id);
      return json({ error: "Paynow did not return a redirect URL" }, 502);
    }

    await admin
      .from("paynow_payment_sessions")
      .update({
        paynow_reference: data.paynowreference || null,
        paynow_poll_url: data.pollurl,
        paynow_redirect_url: data.browserredirecturl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    return json({
      session_id: session.id,
      redirect_url: data.browserredirecturl,
      paynow_reference: data.paynowreference || null,
    });
  } catch (e: any) {
    console.error("paynow-create-checkout error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function appendParam(url: string, key: string, value: string) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function sanitizeReturnUrl(raw: string) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "gbsquash:") return raw;
    if (parsed.hostname.endsWith(".supabase.co")) {
      return `${PUBLIC_APP_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    const path = String(raw || "/my-account").startsWith("/") ? String(raw) : `/${String(raw || "my-account")}`;
    return `${PUBLIC_APP_ORIGIN}${path}`;
  }
}
