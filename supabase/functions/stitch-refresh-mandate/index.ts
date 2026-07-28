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

    const { mandate_id, action } = await req.json().catch(() => ({}));
    if (!mandate_id) return json({ error: "mandate_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, status, club_id, user_id, club_member_id, stitch_mandate_id, mandate_type")
      .eq("id", mandate_id)
      .maybeSingle();
    if (!mandate) return json({ error: "Mandate not found" }, 404);

    // Allowed: the mandate owner, any member profile linked to the same login
    // (shared family accounts), or a club admin of that club.
    let allowed = mandate.user_id === userId;
    if (!allowed && mandate.club_member_id) {
      const { data: linked } = await admin
        .from("club_members")
        .select("id")
        .eq("id", mandate.club_member_id)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = !!linked;
    }
    let isAdminUser = false;
    {
      const { data: isAdmin } = await admin.rpc("is_club_admin", {
        _user_id: userId,
        _club_id: mandate.club_id,
      });
      isAdminUser = isAdmin === true;
      if (!isAdminUser) {
        const { data: isPlatform } = await admin.rpc("is_platform_admin", { _user_id: userId });
        isAdminUser = isPlatform === true;
      }
    }
    allowed = allowed || isAdminUser;
    if (!allowed) return json({ error: "Not allowed to view this mandate" }, 403);

    // Manual override: Stitch Express has no read endpoint for Express-created
    // recurring authorisations, so when the payer confirms they completed the
    // flow an admin can settle the row by hand.
    if (action === "confirm" || action === "reject") {
      if (!isAdminUser) return json({ error: "Only club admins can set this manually" }, 403);
      const patch: Record<string, unknown> = action === "confirm"
        ? { status: "active", authorised_at: new Date().toISOString() }
        : { status: "cancelled", cancelled_at: new Date().toISOString() };
      await admin.from("stitch_mandates").update(patch).eq("id", mandate.id);
      let recorded: unknown = null;
      if (action === "confirm") {
        const { data: rec, error: recErr } = await admin.rpc(
          "record_mandate_initial_payment",
          { _mandate_id: mandate.id },
        );
        if (recErr) console.error("initial payment record failed", mandate.id, recErr.message);
        recorded = rec ?? null;
      }
      return json({ ok: true, status: patch.status, manual: true, initial_payment: recorded });
    }

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

    // Stitch Express exposes several read paths depending on how the
    // authorisation was created (and some legacy rows have mandate_type
    // mis-recorded). Probe them in order and use the first that answers 200.
    const primaryPath = mandate.mandate_type === "subscription" ? "subscriptions" : "card-consents";
    const altPath = primaryPath === "subscriptions" ? "card-consents" : "subscriptions";
    const candidates = [primaryPath, altPath, "payments"];

    let resp: Response | null = null;
    let j: any = {};
    let usedPath = primaryPath;
    const probe: Record<string, number> = {};

    for (const path of candidates) {
      const r = await fetch(`${STITCH_BASE}/${path}/${mandate.stitch_mandate_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      probe[path] = r.status;
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        resp = r;
        j = body;
        usedPath = path;
        break;
      }
      if (r.status !== 404) {
        // Real error (401/403/5xx) — stop probing and surface it.
        resp = r;
        j = body;
        usedPath = path;
        break;
      }
    }

    if (resp?.ok && usedPath !== primaryPath && usedPath !== "payments") {
      const correctedType = usedPath === "subscriptions" ? "subscription" : "card_consent";
      await admin.from("stitch_mandates").update({ mandate_type: correctedType }).eq("id", mandate.id);
    }

    if (!resp || !resp.ok) {
      console.error("stitch get failed", JSON.stringify(probe), usedPath, JSON.stringify(j));
      if (!resp || resp.status === 404) {
        // Every read path 404s. Stitch Express does not expose a lookup for
        // Express-created recurring authorisations, so this tells us nothing
        // about whether the payer completed the flow. Leave the row pending
        // and let the webhook (or an admin override) settle it.
        return json({
          ok: false,
          error: "MANDATE_NOT_FOUND",
          status: mandate.status,
          fallback: true,
          probe,
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
