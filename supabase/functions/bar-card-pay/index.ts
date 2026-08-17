// Public scan-to-pay card checkout for the honesty bar.
// Creates a real Stitch card payment for a QR bar sale (visitor or member),
// records the sale as PENDING and returns the hosted checkout URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_TOKEN_URL = "https://secure.stitch.money/connect/token";
const STITCH_API_BASE = "https://api.stitch.money/v2";
const STITCH_EXPRESS_BASE = "https://express.stitch.money/api/v1";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const { code, bar_item_id, quantity = 1, buyer_name = null, return_url = null } = body || {};
    const qty = Number(quantity);
    if (!code || !bar_item_id || !(qty >= 1 && qty <= 50)) {
      return json({ error: "Missing or invalid payment details" });
    }

    const { data: qr } = await admin
      .from("qr_short_codes")
      .select("id, club_id, bar_item_id, active")
      .eq("code", code).maybeSingle();
    if (!qr || !qr.active) return json({ error: "This QR code is no longer active" });
    if (qr.bar_item_id && qr.bar_item_id !== bar_item_id) return json({ error: "Item does not match this code" });

    const { data: item } = await admin
      .from("bar_items")
      .select("id, name, price, club_id, active")
      .eq("id", bar_item_id).eq("club_id", qr.club_id).maybeSingle();
    if (!item || !item.active) return json({ error: "Item not available" });

    const amount = Number(item.price) * qty;
    if (!(amount > 0)) return json({ error: "Invalid amount" });
    if (Math.round(amount * 100) < 100) {
      return json({ error: "Card payments must be at least R1.00 — please pay cash or charge to your account." });
    }

    const { data: club } = await admin
      .from("clubs").select("id, name, subdomain, payment_gateway").eq("id", qr.club_id).maybeSingle();
    if (!club || club.payment_gateway !== "stitch") {
      return json({ error: "Card payments are not enabled for this club" });
    }

    const { data: secrets } = await admin
      .from("club_secrets").select("payment_gateway_credentials").eq("club_id", club.id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ error: "This club has not finished its card payment setup" });

    // Record the sale up-front as pending so stock/admin views stay accurate.
    const { data: sale, error: saleErr } = await admin
      .from("bar_visitor_sales")
      .insert({
        club_id: club.id,
        bar_item_id: item.id,
        quantity: qty,
        unit_price: Number(item.price),
        total: amount,
        payment_method: "card",
        visitor_name: (buyer_name || "").trim() || null,
        note: "Scan-to-pay (QR) · card checkout",
        payment_status: "pending",
      })
      .select("id").single();
    if (saleErr || !sale) return json({ error: saleErr?.message || "Could not start the sale" });

    const reference = `BAR-${String(sale.id).slice(0, 8)}`;
    const redirectUri = sanitizeReturnUrl(return_url, String(club.subdomain || ""), code);

    try {
      const request = await createPaymentRequest({
        clientId, clientSecret, amount, reference,
        payerName: (buyer_name || "Bar customer").slice(0, 40),
        payerId: String(sale.id),
        redirectUri,
      });
      await admin.from("bar_visitor_sales")
        .update({ payment_reference: request.id }).eq("id", sale.id);
      return json({ sale_id: sale.id, redirect_url: request.redirect_url });
    } catch (err) {
      console.warn("payment-request failed, trying Express link:", (err as Error)?.message || err);
    }

    // Express fallback
    const tokenResp = await fetch(`${STITCH_EXPRESS_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    const accessToken = tokenJson?.data?.accessToken;
    if (!tokenResp.ok || !accessToken) {
      await admin.from("bar_visitor_sales").update({ payment_status: "failed" }).eq("id", sale.id);
      return json({ error: "Could not reach the card payment provider" });
    }
    const plResp = await fetch(`${STITCH_EXPRESS_BASE}/payments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "ZAR",
        payerName: (buyer_name || "Bar customer").slice(0, 40),
        merchantReference: reference,
      }),
    });
    const plJson = await plResp.json().catch(() => ({}));
    const link = plJson?.data?.payment?.link;
    if (!plResp.ok || !link) {
      await admin.from("bar_visitor_sales").update({ payment_status: "failed" }).eq("id", sale.id);
      return json({ error: "Could not create the card payment" });
    }
    await admin.from("bar_visitor_sales")
      .update({ payment_reference: String(plJson.data.payment.id) }).eq("id", sale.id);
    // NOTE: express.stitch.money hosted links 404 when ANY query param is appended,
    // so the link must be handed to the payer exactly as Stitch returned it.
    return json({ sale_id: sale.id, redirect_url: String(link) });
  } catch (e: any) {
    console.error("bar-card-pay error:", e);
    return json({ error: e?.message || "Unexpected error" });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function withRedirect(link: string, returnUrl: string) {
  try {
    const url = new URL(link);
    url.searchParams.delete("redirect_uri");
    url.searchParams.set("redirect_url", returnUrl);
    return url.toString();
  } catch {
    const sep = link.includes("?") ? "&" : "?";
    return `${link}${sep}redirect_url=${encodeURIComponent(returnUrl)}`;
  }
}

function sanitizeReturnUrl(raw: string | null, clubSubdomain: string, code: string) {
  const sub = clubSubdomain.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const fallback = sub
    ? `https://${sub}.squashhub.co.za/s/${code}`
    : `${PUBLIC_APP_ORIGIN}/s/${code}`;
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const allowed =
      host === "squashhub.co.za" || host.endsWith(".squashhub.co.za") ||
      host.endsWith(".lovable.app") || host === "localhost";
    if (!allowed) return fallback;
    if (sub && (host === "squashhub.co.za" || host.endsWith(".lovable.app"))) return fallback;
    parsed.hostname = host;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fallback;
  }
}

async function getToken(clientId: string, clientSecret: string) {
  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", clientId);
  body.set("audience", STITCH_TOKEN_URL);
  body.set("scope", "client_paymentrequest");
  body.set("client_secret", clientSecret);
  const resp = await fetch(STITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  const token = data?.access_token || data?.accessToken;
  if (!resp.ok || !token) throw new Error(data?.detail || data?.error || `token HTTP ${resp.status}`);
  return String(token);
}

async function createPaymentRequest(opts: {
  clientId: string; clientSecret: string; amount: number; reference: string;
  payerName: string; payerId: string; redirectUri: string;
}) {
  const accessToken = await getToken(opts.clientId, opts.clientSecret);
  const resp = await fetch(`${STITCH_API_BASE}/payment-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "ZAR", quantity: Number(opts.amount.toFixed(2)) },
      externalReference: opts.reference,
      expireAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      payer: { identifier: opts.payerId, fullName: opts.payerName.trim().padEnd(3, " ") },
      metadata: { squashhubBarSale: opts.payerId },
      paymentMethods: {
        eft: { enabled: false },
        card: { enabled: true },
        crypto: { enabled: false },
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  const redirectBase = data?.interaction?.url;
  if (!resp.ok || !data?.id || !redirectBase) {
    throw new Error(data?.detail || data?.message || `payment request HTTP ${resp.status}`);
  }
  return { id: String(data.id), redirect_url: withRedirect(String(redirectBase), opts.redirectUri) };
}
