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

    const { data: club } = await admin
      .from("clubs").select("payment_gateway").eq("id", sale.club_id).maybeSingle();
    const gateway = String(club?.payment_gateway || "stitch").toLowerCase();

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials, payment_gateway_secret_key")
      .eq("club_id", sale.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    const yocoSecretKey = String(creds.secret_key || (secrets as any)?.payment_gateway_secret_key || "").trim();

    let state = "PENDING";
    if (gateway === "yoco") {
      if (!yocoSecretKey) return json({ status: "pending" });
      state = await lookupYocoStatus(yocoSecretKey, sale.payment_reference);
    } else {
      if (!clientId || !clientSecret) return json({ status: "pending" });
      state = await lookupStatus(clientId, clientSecret, sale.payment_reference);
    }
    const paid = ["PAID", "COMPLETE", "COMPLETED", "SUCCESSFUL", "PAYMENTINITIATIONREQUESTCOMPLETED"].includes(state);

    const failed = ["EXPIRED", "CANCELLED", "CANCELED", "FAILED", "PAYMENTINITIATIONREQUESTCANCELLED", "PAYMENTINITIATIONREQUESTEXPIRED"].includes(state);

    const next = paid ? "paid" : failed ? "failed" : "pending";
    if (next !== sale.payment_status) {
      // Cart payments write one row per line sharing the same reference.
      const { data: refRows } = await admin.from("bar_visitor_sales")
        .select("id, guest_tab_id")
        .eq("club_id", sale.club_id)
        .eq("payment_reference", sale.payment_reference);
      const tabIds = [...new Set((refRows || []).map((r: any) => r.guest_tab_id).filter(Boolean))];

      if (next === "failed" && tabIds.length) {
        // A tab settlement that failed goes back onto the open tab so the
        // guest can retry or choose another way to pay.
        await admin.from("bar_visitor_sales")
          .update({ payment_method: "tab", payment_status: "on_tab", note: "Open bar tab", payment_reference: null })
          .eq("club_id", sale.club_id)
          .eq("payment_reference", sale.payment_reference);
        await admin.from("bar_guest_tabs")
          .update({ status: "open", settled_method: null })
          .in("id", tabIds);
      } else {
        await admin.from("bar_visitor_sales")
          .update({ payment_status: next })
          .eq("club_id", sale.club_id)
          .eq("payment_reference", sale.payment_reference);
        if (next === "paid" && tabIds.length) {
          await admin.from("bar_guest_tabs")
            .update({ status: "settled", closed_at: new Date().toISOString(), settled_method: "online" })
            .in("id", tabIds);
        }
      }
    }
    return json({ status: next, gateway, provider_state: state, stitch_state: state, total: Number(sale.total) });
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

async function lookupYocoStatus(secretKey: string, checkoutId: string) {
  try {
    const resp = await fetch(
      `https://payments.yoco.com/api/checkouts/${encodeURIComponent(checkoutId)}`,
      { headers: { Authorization: `Bearer ${secretKey}` } },
    );
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.warn("Yoco bar verify failed", resp.status, data);
      return "PENDING";
    }
    return String(data?.status || "PENDING").toUpperCase();
  } catch (err) {
    console.warn("Yoco bar verify error", (err as Error)?.message || err);
    return "PENDING";
  }
}
