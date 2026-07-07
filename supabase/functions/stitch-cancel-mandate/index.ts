// Cancels a Stitch mandate (card consent or subscription).
// For subscriptions we also call Stitch's /subscriptions/{id}/cancel endpoint
// so no further scheduled charges are attempted.
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

    const { mandate_id } = await req.json();
    if (!mandate_id) return json({ error: "Missing mandate_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, user_id, club_id, status, mandate_type, stitch_mandate_id")
      .eq("id", mandate_id)
      .maybeSingle();
    if (!mandate) return json({ error: "Mandate not found" }, 404);

    // Allow owner or club admin
    let allowed = mandate.user_id === userId;
    if (!allowed) {
      const { data: cm } = await admin
        .from("club_members")
        .select("role")
        .eq("club_id", mandate.club_id)
        .eq("user_id", userId)
        .maybeSingle();
      allowed = cm?.role === "admin";
    }
    if (!allowed) return json({ error: "Not allowed" }, 403);

    // For subscriptions, call Stitch to cancel remotely so no further
    // charges are attempted. Card consents don't require a remote cancel
    // (we simply stop initiating payments against them).
    let remoteCancelled = false;
    let remoteError: string | null = null;
    if (mandate.mandate_type === "subscription" && mandate.stitch_mandate_id) {
      try {
        const { data: secrets } = await admin
          .from("club_secrets")
          .select("payment_gateway_credentials")
          .eq("club_id", mandate.club_id)
          .maybeSingle();
        const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
        const clientId = (creds.client_id || "").trim();
        const clientSecret = (creds.client_secret || "").trim();
        if (!clientId || !clientSecret) throw new Error("Stitch credentials missing");

        const tokenResp = await fetch(`${STITCH_BASE}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, clientSecret, scope: "client_recurringpaymentconsentrequest" }),
        });
        const tokenJson = await tokenResp.json().catch(() => ({}));
        const accessToken = tokenJson?.data?.accessToken;
        if (!tokenResp.ok || !accessToken) {
          throw new Error(`token ${tokenResp.status}: ${tokenJson?.error?.message || "auth failed"}`);
        }

        const cancelResp = await fetch(
          `${STITCH_BASE}/subscriptions/${encodeURIComponent(mandate.stitch_mandate_id)}/cancel`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          },
        );
        const cancelJson = await cancelResp.json().catch(() => ({}));
        // 404 = already gone at Stitch, treat as success for idempotency.
        if (cancelResp.ok || cancelResp.status === 404) {
          remoteCancelled = true;
        } else {
          throw new Error(
            `Stitch ${cancelResp.status}: ${cancelJson?.generalErrors?.join("; ") || cancelJson?.error?.message || "cancel failed"}`,
          );
        }
      } catch (e) {
        remoteError = (e as Error).message;
        console.error("stitch-cancel-mandate remote cancel error", remoteError);
        // Do not update local status if remote cancel failed — surface the error.
        return json({ error: `Could not cancel at Stitch: ${remoteError}` }, 502);
      }
    }

    await admin
      .from("stitch_mandates")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", mandate_id);

    return json({ ok: true, remote_cancelled: remoteCancelled });
  } catch (e) {
    console.error("stitch-cancel-mandate fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
