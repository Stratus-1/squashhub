// Creates a Stitch Express recurring authorisation for a member. Two flavours:
//
//   • mandate_type = "card_consent"  → POST /card-consents
//       Member authorises their card once; the club charges any amount
//       (up to max_amount) whenever needed via /card-consents/{id}/initiate-payment.
//       Use for VARIABLE monthly amounts (e.g. category dues + NSA levy + SSA).
//
//   • mandate_type = "subscription"  → POST /subscriptions
//       Stitch charges the same fixed amount on the chosen day every month.
//       Use for FIXED monthly amounts.
//
// Both endpoints require the `client_recurringpaymentconsentrequest` scope on the
// club's Stitch Express client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STITCH_BASE = "https://express.stitch.money/api/v1";
const PUBLIC_APP_ORIGIN = "https://squashhub.co.za";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
      fee_category_id = null,
      mandate_type = "card_consent",
      max_amount,
      debit_day = 1,
      return_url,
    } = body || {};

    if (!club_id || !club_member_id || !max_amount || !return_url) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (mandate_type !== "card_consent" && mandate_type !== "subscription") {
      return json({ error: "Invalid mandate_type" }, 400);
    }
    const amt = Number(max_amount);
    if (!(amt > 0)) return json({ error: "Invalid amount" }, 400);
    const amountCents = Math.round(amt * 100);
    if (amountCents < 100) return json({ error: "Minimum recurring amount is R1.00" }, 400);
    const day = Math.min(31, Math.max(1, Number(debit_day) || 1));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: member } = await admin
      .from("club_members")
      .select("id, club_id, user_id, name, club_member_number, phone, email")
      .eq("id", club_member_id)
      .maybeSingle();
    if (!member || member.club_id !== club_id || member.user_id !== userId) {
      return json({ error: "Member not found or not yours" }, 403);
    }

    const { data: club } = await admin
      .from("clubs").select("id, name, payment_gateway")
      .eq("id", club_id).maybeSingle();
    if (!club || club.payment_gateway !== "stitch") {
      return json({ error: "Stitch is not configured for this club" }, 400);
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    const testMode = String(creds.test_mode || "") === "true";
    const looksLikeTest = /^test[-_]/i.test(clientId);
    if (!clientId || !clientSecret) {
      return json({ error: "Stitch Express credentials incomplete. Required: Client ID and Client Secret." }, 400);
    }
    if (testMode && !looksLikeTest) {
      return json({ error: "Test mode is ON but the Client ID is not a Stitch test credential." }, 400);
    }
    if (!testMode && looksLikeTest) {
      return json({ error: "Test mode is OFF but the Client ID looks like a test credential." }, 400);
    }
    console.log(`[stitch-create-mandate] type=${mandate_type} mode=${testMode ? "TEST" : "LIVE"} club=${club.id}`);

    // 1. Token — same scope for both endpoints.
    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_recurringpaymentconsentrequest" }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson?.data?.accessToken) {
      console.error("Stitch Express token error", tokenResp.status, tokenJson);
      const msg = tokenJson?.error?.message || tokenJson?.message || tokenJson?.error || "unknown";
      return json({
        error: `Stitch Express auth failed [${tokenResp.status}]: ${msg}. Recurring payments require the 'client_recurringpaymentconsentrequest' scope — email express-support@stitch.money to enable it on your client.`,
      }, 502);
    }
    const accessToken: string = tokenJson.data.accessToken;

    // 2. Insert pending mandate.
    const { data: mandate, error: mErr } = await admin
      .from("stitch_mandates")
      .insert({
        club_id,
        club_member_id,
        user_id: userId,
        rail: "debicheck",
        mandate_type,
        max_amount_cents: amountCents,
        frequency: "monthly",
        debit_day: day,
        status: "pending",
        fee_category_id,
      })
      .select()
      .single();
    if (mErr || !mandate) {
      console.error("mandate insert error", mErr);
      return json({ error: "Failed to create mandate record" }, 500);
    }

    // 3. Build merchant reference + call the right Stitch endpoint.
    const refPrefix = (creds.merchant_payer_reference || (club.name || "Club"))
      .slice(0, 12).replace(/[^A-Za-z0-9 ]/g, "");
    const merchantReference = `${refPrefix}-${mandate.id.slice(0, 8)}`
      .replace(/[^a-zA-Z0-9\s\-)]/g, "").slice(0, 50);
    const payerFullName = (member.name || "Member").slice(0, 20);
    const payerEmail = member.email || `${member.id}@noemail.local`;

    const safeReturn = sanitizeReturnUrl(return_url);
    let stitchId: string | null = null;
    let stitchUrl: string | null = null;

    if (mandate_type === "card_consent") {
      // POST /card-consents — payer authorises a card that we can later charge
      // any amount up to `amount` via /card-consents/{id}/initiate-payment.
      const consentBody = {
        amount: amountCents, // cap
        merchantReference,
        payerFullName,
        email: payerEmail,
        payerId: member.id,
        merchantRedirectUrl: safeReturn,
      };
      const resp = await fetch(`${STITCH_BASE}/card-consents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(consentBody),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j?.success || !j?.data) {
        console.error("Stitch Express card-consent error", resp.status, JSON.stringify(j));
        await admin.from("stitch_mandates").update({ status: "failed" }).eq("id", mandate.id);
        const msg = j?.error?.message || j?.message || (j?.errors && JSON.stringify(j.errors)) || `HTTP ${resp.status}`;
        return json({ error: `Stitch Express card consent failed: ${msg}` }, 502);
      }
      stitchId = j.data.id || j.data.consentRequestId || null;
      stitchUrl = j.data.url || j.data.link || null;
    } else {
      // POST /subscriptions — fixed monthly amount, Stitch auto-charges.
      // Initial charge is a small R20 verification; recurring monthly amount
      // begins on the selected byMonthDay.
      const subBody = {
        amount: amountCents,
        initialAmount: 2000, // R20.00 verification charge
        merchantReference,
        startDate: new Date().toISOString(),
        payerFullName,
        email: payerEmail,
        payerId: member.id,
        merchantRedirectUrl: safeReturn,
        recurrence: { frequency: "MONTHLY", interval: 1, byMonthDay: day },
      };
      const resp = await fetch(`${STITCH_BASE}/subscriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(subBody),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || !j?.success || !j?.data?.url) {
        console.error("Stitch Express subscription error", resp.status, JSON.stringify(j));
        await admin.from("stitch_mandates").update({ status: "failed" }).eq("id", mandate.id);
        const msg = j?.error?.message || j?.message || (j?.errors && JSON.stringify(j.errors)) || `HTTP ${resp.status}`;
        return json({ error: `Stitch Express subscription failed: ${msg}` }, 502);
      }
      stitchId = j.data.id;
      stitchUrl = j.data.url;
    }

    if (!stitchUrl) {
      await admin.from("stitch_mandates").update({ status: "failed" }).eq("id", mandate.id);
      return json({ error: "Stitch did not return an authorisation URL" }, 502);
    }

    // The return URL is already supplied in the create body. Appending it to
    // Stitch's hosted URL can make the final authorisation fail after the R20
    // verification charge.
    const authUrl = stitchUrl;

    await admin
      .from("stitch_mandates")
      .update({ stitch_mandate_id: stitchId, auth_url: authUrl })
      .eq("id", mandate.id);

    return json({ mandate_id: mandate.id, auth_url: authUrl, stitch_id: stitchId, mandate_type });
  } catch (e) {
    console.error("stitch-create-mandate fatal", e);
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});

function sanitizeReturnUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.origin === PUBLIC_APP_ORIGIN || u.hostname.endsWith("squashhub.co.za") || u.hostname.endsWith("lovable.app") || u.hostname === "localhost") {
      return u.toString();
    }
    return `${PUBLIC_APP_ORIGIN}/my-account`;
  } catch {
    return `${PUBLIC_APP_ORIGIN}/my-account`;
  }
}
