// Polls Stitch Express for the current status of a mandate (card-consent or
// subscription) and syncs the local `stitch_mandates` row. Used when the
// webhook is missed / delayed and a mandate stays "pending" in the app even
// though Stitch has already authorised it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const STITCH_BASE = "https://express.stitch.money/api/v1";

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

    const { mandate_id } = await req.json().catch(() => ({}));
    if (!mandate_id) return json({ error: "mandate_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, status, club_id, user_id, stitch_mandate_id, mandate_type")
      .eq("id", mandate_id)
      .maybeSingle();
    if (!mandate) return json({ error: "Mandate not found" }, 404);
    if (mandate.user_id !== userId) return json({ error: "Not yours" }, 403);
    if (!mandate.stitch_mandate_id) return json({ ok: true, status: mandate.status });

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", mandate.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const clientId = (creds.client_id || "").trim();
    const clientSecret = (creds.client_secret || "").trim();
    if (!clientId || !clientSecret) return json({ error: "Stitch credentials missing" }, 400);

    const tokenResp = await fetch(`${STITCH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, scope: "client_recurringpaymentconsentrequest" }),
    });
    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenJson?.data?.accessToken) {
      return json({ error: `Stitch auth failed [${tokenResp.status}]` }, 502);
    }
    const accessToken = tokenJson.data.accessToken;

    // Some legacy rows have mandate_type mis-recorded (e.g. a card-consent
    // saved as "subscription"). If the primary path 404s, transparently retry
    // the alternate endpoint before failing — Stitch returns 404 with an empty
    // body when the id is not found at that path.
    const primaryPath = mandate.mandate_type === "subscription" ? "subscriptions" : "card-consents";
    const altPath = primaryPath === "subscriptions" ? "card-consents" : "subscriptions";

    let resp = await fetch(`${STITCH_BASE}/${primaryPath}/${mandate.stitch_mandate_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    let j = await resp.json().catch(() => ({}));
    let usedPath = primaryPath;

    if (resp.status === 404) {
      const altResp = await fetch(`${STITCH_BASE}/${altPath}/${mandate.stitch_mandate_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const altJson = await altResp.json().catch(() => ({}));
      if (altResp.ok) {
        // Type was wrong locally — correct it going forward.
        resp = altResp;
        j = altJson;
        usedPath = altPath;
        const correctedType = altPath === "subscriptions" ? "subscription" : "card_consent";
        await admin
          .from("stitch_mandates")
          .update({ mandate_type: correctedType })
          .eq("id", mandate.id);
      }
    }

    if (!resp.ok) {
      console.error("stitch get failed", resp.status, usedPath, JSON.stringify(j));
      if (resp.status === 404) {
        // Stitch Express doesn't reliably expose GET on subscriptions/consents
        // even when the authorisation IS active on their side (the R20
        // verification charge succeeded). Do NOT auto-mark as failed on 404;
        // leave the row as pending and let the webhook or a manual admin
        // action reconcile it. Marking it failed here breaks legitimate
        // recurring mandates that the payer completed successfully.
        return json({
          ok: false,
          error: "MANDATE_NOT_FOUND",
          status: mandate.status,
          fallback: true,
        });
      }
      return json({ error: `Stitch lookup failed [${resp.status}]` }, 502);
    }



    const node = j?.data || j;
    const rawStatus = String(
      node?.status || node?.state?.__typename || node?.state || ""
    ).toLowerCase();

    let newStatus: string | null = null;
    if (/complete|authori[sz]ed|active|success|enabled/.test(rawStatus)) newStatus = "active";
    else if (/declin|fail|reject|expired/.test(rawStatus)) newStatus = "failed";
    else if (/cancel/.test(rawStatus)) newStatus = "cancelled";

    if (newStatus && newStatus !== mandate.status) {
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "active") patch.authorised_at = new Date().toISOString();
      if (newStatus === "cancelled") patch.cancelled_at = new Date().toISOString();
      await admin.from("stitch_mandates").update(patch).eq("id", mandate.id);
    }

    return json({ ok: true, status: newStatus || mandate.status, raw: rawStatus });
  } catch (e) {
    console.error("stitch-refresh-mandate fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
