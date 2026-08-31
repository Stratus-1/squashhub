// Public webhook endpoint for Stitch Express payment events.
// Docs: events are delivered via Svix with headers svix-id / svix-timestamp / svix-signature.
// Payload is flat: { id, amount, status, type: "LINK"|"CONSENT"|"SUBSCRIPTION", linkId, consentId, subscriptionId, terminalSessionId }
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Webhook } from "npm:svix@1.42.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const rawBody = await req.text();
    const svixId = req.headers.get("svix-id") || "";
    const svixTs = req.headers.get("svix-timestamp") || "";
    const svixSig = req.headers.get("svix-signature") || "";

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return new Response("bad json", { status: 400 }); }

    // Match our stored stitch_request_id (payment id from create response) against
    // either the flat `id` or `linkId` on the webhook payload.
    const paymentId: string | undefined = payload?.id;
    const linkId: string | undefined = payload?.linkId;
    const type: string = String(payload?.type || "").toUpperCase();
    const status: string = String(payload?.status || "").toUpperCase();

    // Forward CONSENT/SUBSCRIPTION events (recurring card) to the mandate handler.
    if (type === "CONSENT" || type === "SUBSCRIPTION") {
      const hdrs = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        "svix-id": svixId, "svix-timestamp": svixTs, "svix-signature": svixSig,
      };

      // A recurring arrangement emits two kinds of events: authorisation status
      // changes (handled by the mandate handler) and actual debits, which carry
      // an amount. Debits must reach the collection handler so the money lands
      // on the member's statement.
      const amount = Number(payload?.amount || 0);
      const isDebitEvent = amount > 0 &&
        /PAID|COMPLETE|COMPLETED|SETTLED|SUCCESS|FAILED|DECLINED|REJECTED/.test(status);

      if (isDebitEvent) {
        const fwdCol = await fetch(`${SUPABASE_URL}/functions/v1/stitch-collection-webhook`, {
          method: "POST", headers: hdrs, body: rawBody,
        });
        const colText = await fwdCol.text();
        console.log("stitch-webhook: debit event routed to collection handler ->", colText.slice(0, 300));
        return new Response(colText, { status: fwdCol.status });
      }

      const fwd = await fetch(`${SUPABASE_URL}/functions/v1/stitch-mandate-webhook`, {
        method: "POST", headers: hdrs, body: rawBody,
      });
      return new Response(await fwd.text(), { status: fwd.status });
    }


    const candidates = [paymentId, linkId].filter(Boolean) as string[];
    if (candidates.length === 0) return new Response("no ids", { status: 400 });

    const { data: session } = await admin.from("stitch_payment_sessions")
      .select("*").in("stitch_request_id", candidates).maybeSingle();
    if (!session) {
      console.log("stitch-webhook: no session for", candidates.join(","));
      return new Response("ok", { status: 200 });
    }

    // Verify Svix signature using the webhook signing secret saved on the club.
    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", session.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    const signingSecret = (creds.webhook_secret || "").trim();

    if (signingSecret && svixId && svixTs && svixSig) {
      try {
        const wh = new Webhook(signingSecret);
        wh.verify(rawBody, { "svix-id": svixId, "svix-timestamp": svixTs, "svix-signature": svixSig });
      } catch (err) {
        console.error("stitch-webhook: Svix verify failed", (err as Error).message);
        return new Response("invalid signature", { status: 401 });
      }
    } else if (svixSig) {
      console.warn("stitch-webhook: signature present but no webhook_secret configured for club", session.club_id);
    }

    const isComplete = status === "PAID" || status === "COMPLETED" || status === "COMPLETE";
    const isFailed = status === "FAILED" || status === "EXPIRED" || status === "CANCELLED" || status === "CANCELED";

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

async function finalisePayment(admin: SupabaseClient, session: any) {
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
