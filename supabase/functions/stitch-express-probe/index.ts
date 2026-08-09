import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { club_id, return_url } = await req.json().catch(() => ({}));
    if (!club_id) {
      return new Response(JSON.stringify({ error: "club_id required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id)
      .maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    const ret = String(return_url || "https://squashhub.co.za/pay/return");

    const out: Record<string, unknown> = { clientIdPrefix: clientId.slice(0, 5) };

    // A) Express token
    const tr = await fetch("https://api.stitch.money/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const tj = await tr.json().catch(() => ({}));
    const token = tj?.data?.accessToken;
    out.expressToken = { status: tr.status, ok: !!token };
    if (!token) {
      out.expressTokenError = tj;
    } else {
      const body = {
        amount: 1000,
        currency: "ZAR",
        payerName: "Probe Payer",
        merchantReference: `PROBE-${Date.now()}`,
        merchantRedirectUrl: ret,
        redirectUrl: ret,
      };
      const pr = await fetch("https://api.stitch.money/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      out.expressPayment = { status: pr.status, body: await pr.json().catch(() => ({})) };
    }

    // B) Payment Request v2 token (client_credentials)
    const form = new URLSearchParams();
    form.set("grant_type", "client_credentials");
    form.set("client_id", clientId);
    form.set("audience", "https://secure.stitch.money/connect/token");
    form.set("scope", "client_paymentrequest");
    form.set("client_secret", clientSecret);
    const v2 = await fetch("https://secure.stitch.money/connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    out.paymentRequestToken = { status: v2.status, body: await v2.json().catch(() => ({})) };

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
