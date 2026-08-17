// Public: checks whether a scan-to-pay bar card payment went through and
// finalises the sale record.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";
const STITCH_EXPRESS_BASE = "https://express.stitch.money/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { sale_id } = await req.json().catch(() => ({}));
    if (!sale_id) return json({ error: "Missing sale" });

    const { data: sale } = await admin
      .from("bar_visitor_sales")
      .select("id, club_id, total, payment_status, payment_reference")
      .eq("id", sale_id).maybeSingle();
    if (!sale) return json({ error: "Sale not found" });
    if (sale.payment_status === "paid") return json({ status: "paid" });
    if (!sale.payment_reference) return json({ status: sale.payment_status || "pending" });

    const { data: secrets } = await admin
      .from("club_secrets").select("payment_gateway_credentials").eq("club_id", sale.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ status: "pending" });

    const state = await lookupStatus(clientId, clientSecret, sale.payment_reference);
    const paid = ["PAID", "COMPLETE", "COMPLETED", "PAYMENTINITIATIONREQUESTCOMPLETED"].includes(state);
    const failed = ["EXPIRED", "CANCELLED", "CANCELED", "FAILED", "PAYMENTINITIATIONREQUESTCANCELLED", "PAYMENTINITIATIONREQUESTEXPIRED"].includes(state);

    const next = paid ? "paid" : failed ? "failed" : "pending";
    if (next !== sale.payment_status) {
      await admin.from("bar_visitor_sales").update({ payment_status: next }).eq("id", sale.id);
    }
    return json({ status: next, stitch_state: state, total: Number(sale.total) });
  } catch (e: any) {
    console.error("bar-card-verify error:", e);
    return json({ error: e?.message || "Unexpected error" });
  }
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function lookupStatus(clientId: string, clientSecret: string, reference: string) {
  try {
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");
    body.set("client_id", clientId);
    body.set("audience", STITCH_TOKEN_URL);
    body.set("scope", "client_paymentrequest");
    body.set("client_secret", clientSecret);
    const tokenResp = await fetch(STITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    const token = tokenJson?.access_token || tokenJson?.accessToken;
    if (token) {
      const resp = await fetch(`${STITCH_API_BASE}/payment-requests/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.status) return String(data.status).toUpperCase();
    }
  } catch (err) {
    console.warn("payment-request lookup failed", (err as Error)?.message || err);
  }

  try {
    const tokenResp = await fetch(`${STITCH_EXPRESS_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    const accessToken = tokenJson?.data?.accessToken;
    if (!accessToken) return "PENDING";
    const resp = await fetch(`${STITCH_EXPRESS_BASE}/payments/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await resp.json().catch(() => ({}));
    const status = data?.data?.payment?.status || data?.data?.status || data?.status;
    return String(status || "PENDING").toUpperCase();
  } catch {
    return "PENDING";
  }
}
