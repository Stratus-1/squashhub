// Public webhook endpoint for Stitch settlement events.
// Stitch sends events server-side as JSON with HMAC-SHA256 signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getStitchSignature,
  verifyStitchSignature,
} from "../_shared/stitch-signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-stitch-signature, stitch-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const rawBody = await req.text();
    const signature = getStitchSignature(req);
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return new Response("bad json", { status: 400 }); }

    // Stitch event shape varies; common fields: data.node.id, data.id
    const requestId: string | undefined = payload?.data?.node?.id || payload?.data?.id;
    if (!requestId) return new Response("no request id", { status: 400 });

    const { data: session } = await admin.from("stitch_payment_sessions")
      .select("*").eq("stitch_request_id", requestId).maybeSingle();
    if (!session) {
      // Not a one-off payment — could be a mandate (authorisation) or a
      // recurring collection event. Forward to the specialised handler so
      // clubs only need one webhook URL configured in Stitch.
      const isMandate = !!(await admin.from("stitch_mandates")
        .select("id").eq("stitch_mandate_id", requestId).maybeSingle()).data;
      const isCollection = !isMandate && !!(await admin.from("stitch_collections")
        .select("id").or(`stitch_collection_id.eq.${requestId},id.eq.${requestId}`).maybeSingle()).data;

      if (isMandate || isCollection) {
        const target = isMandate ? "stitch-mandate-webhook" : "stitch-collection-webhook";
        const fwd = await fetch(`${SUPABASE_URL}/functions/v1/${target}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
            "x-stitch-signature": signature,
          },
          body: rawBody,
        });
        return new Response(await fwd.text(), { status: fwd.status });
      }

      console.log("stitch-webhook: no session for", requestId);
      return new Response("ok", { status: 200 });
    }

    // Verify HMAC using the dedicated webhook signing secret, falling back to
    // the client_secret for clubs that haven't saved a webhook_secret yet.
    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", session.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const signingSecret = creds.webhook_secret || creds.client_secret || "";
    if (signingSecret && signature) {
      const valid = await verifyStitchSignature(rawBody, signature, signingSecret);
      if (!valid) {
        console.error("stitch-webhook: invalid signature for", requestId);
        return new Response("invalid signature", { status: 401 });
      }
    } else if (signature) {
      console.warn("stitch-webhook: signature present but no signing secret configured for club", session.club_id);
    }

    const eventType: string = payload?.data?.eventType || payload?.type || "";
    const isComplete = /Complete|Settled|Successful|Paid/i.test(eventType) ||
                       /Complete|Settled|Successful/i.test(payload?.data?.node?.status?.__typename || "");
    const isFailed = /Fail|Cancel|Expired|Reject/i.test(eventType);

    if (isComplete && session.status !== "completed") {
      const { data: claimed } = await admin.from("stitch_payment_sessions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", session.id).neq("status", "completed").select("id");
      if (claimed && claimed.length > 0) {
        await finalisePayment(admin, session);
      }
    } else if (isFailed && session.status !== "completed") {
      await admin.from("stitch_payment_sessions").update({ status: "failed" }).eq("id", session.id);
    }

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    console.error("stitch-webhook error:", e);
    return new Response("err", { status: 500 });
  }
});

async function finalisePayment(admin: any, session: any) {
  const amount = Number(session.amount);
  const methodLabel = session.method === "card" ? "card" : "eft";
  if (session.purpose !== "tournament") {
    const { error } = await admin.from("member_credit_transactions").insert({
      club_id: session.club_id, club_member_id: session.club_member_id,
      amount, type: "debit", method: methodLabel,
      description: `${session.description || "Payment"} [Stitch]`,
      reference: session.stitch_request_id,
      status: "confirmed", confirmed_at: new Date().toISOString(),
    });
    if (error && (error as any).code !== "23505") console.error("credit_tx:", error);
  }
  if (session.purpose === "fee" && Array.isArray(session.fee_ids) && session.fee_ids.length) {
    for (const id of session.fee_ids) {
      await admin.from("club_member_fee_payments")
        .update({ paid: true, paid_at: new Date().toISOString() }).eq("id", id);
    }
  }
  if (session.purpose === "tournament" && session.champ_registration_id) {
    await admin.from("club_champs_registrations").update({
      status: "paid", fee_paid_cents: Math.round(amount * 100),
      payment_ref: session.stitch_request_id, paid_at: new Date().toISOString(),
    }).eq("id", session.champ_registration_id);
  }
}
