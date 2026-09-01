// Paynow result URL: Paynow POSTs status updates here (url-encoded).
// Verifies the hash, then settles paid transactions idempotently.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyPaynowMessage, isPaynowPaid } from "../_shared/paynow.ts";
import { settlePaynowSession, mapStatus } from "../_shared/paynow-settlement.ts";
import { resolveGatewayCreds } from "../_shared/gateway-creds.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const raw = await req.text();
    // Parse without verifying yet — we need the reference to find the club's key.
    const pre: Record<string, string> = {};
    for (const part of raw.split("&")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      pre[part.slice(0, eq).toLowerCase()] = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " "));
    }
    const reference = pre.reference;
    if (!reference) return new Response("ok");

    const { data: session } = await admin
      .from("paynow_payment_sessions")
      .select("*")
      .eq("id", reference)
      .maybeSingle();
    if (!session) {
      console.error("paynow-webhook: unknown reference", reference);
      return new Response("ok");
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", session.club_id)
      .maybeSingle();
    const integrationKey = (resolveGatewayCreds(secrets?.payment_gateway_credentials, "paynow").integration_key || "").trim();
    if (!integrationKey) {
      console.error("paynow-webhook: no integration key for club", session.club_id);
      return new Response("ok");
    }

    const { ok, fields } = await verifyPaynowMessage(raw, integrationKey);
    if (!ok) {
      console.error("paynow-webhook: hash mismatch", { reference });
      return new Response("ok");
    }

    const paynowStatus = fields.status || "";
    console.log("paynow-webhook status", { reference, status: paynowStatus });

    if (isPaynowPaid(paynowStatus)) {
      // Atomic claim, then settle.
      const { data: claimed } = await admin
        .from("paynow_payment_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .neq("status", "completed")
        .select("id");
      if (claimed && claimed.length > 0) {
        await settlePaynowSession(admin, session);
      }
    } else {
      await admin
        .from("paynow_payment_sessions")
        .update({ status: mapStatus(paynowStatus), updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .neq("status", "completed");
    }

    return new Response("ok");
  } catch (e: any) {
    console.error("paynow-webhook error:", e);
    return new Response("ok");
  }
});
