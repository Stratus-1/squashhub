// Receives Stitch webhook events for mandate (authorization) status changes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getStitchSignature,
  verifyStitchSignature,
} from "../_shared/stitch-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-stitch-signature, stitch-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rawBody = await req.text();
    const signature = getStitchSignature(req);
    let body: any;
    try { body = JSON.parse(rawBody); } catch { return json({ error: "bad json" }, 400); }

    // Stitch sends event envelopes with `data.node` for the resource
    const node = body?.data?.node || body?.node || body;
    const stitchId: string | undefined = node?.id;
    const eventType: string = body?.type || node?.__typename || "";
    const stateType: string = node?.state?.__typename || node?.status || "";

    if (!stitchId) {
      console.warn("webhook: no stitch id in payload", JSON.stringify(body).slice(0, 500));
      return json({ ok: true, ignored: true });
    }

    // Find mandate by stitch_mandate_id and the owning club so we can verify
    // the signature against that club's stored signing secret.
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id, status, club_id")
      .eq("stitch_mandate_id", stitchId)
      .maybeSingle();
    if (!mandate) return json({ ok: true, unmatched: true });

    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", mandate.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const signingSecret = creds.webhook_secret || creds.client_secret || "";
    if (signingSecret && signature) {
      const valid = await verifyStitchSignature(rawBody, signature, signingSecret);
      if (!valid) {
        console.error("stitch-mandate-webhook: invalid signature for mandate", stitchId);
        return json({ error: "invalid signature" }, 401);
      }
    } else if (signature) {
      console.warn("stitch-mandate-webhook: signature present but no signing secret for club", mandate.club_id);
    }

    let newStatus: string | null = null;
    const t = (stateType + " " + eventType).toLowerCase();
    if (t.includes("complete") || t.includes("authorized") || t.includes("authorised") || t.includes("active") || t.includes("success")) {
      newStatus = "active";
    } else if (t.includes("declined") || t.includes("failed") || t.includes("rejected") || t.includes("expired")) {
      newStatus = "failed";
    } else if (t.includes("cancel")) {
      newStatus = "cancelled";
    }

    if (newStatus && newStatus !== mandate.status) {
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "active") patch.authorised_at = new Date().toISOString();
      if (newStatus === "cancelled") patch.cancelled_at = new Date().toISOString();
      await admin.from("stitch_mandates").update(patch).eq("id", mandate.id);
    }

    return json({ ok: true, mandate_id: mandate.id, status: newStatus || mandate.status });
  } catch (e) {
    console.error("stitch-mandate-webhook fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
