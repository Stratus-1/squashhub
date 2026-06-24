// Public webhook endpoint for Stitch settlement events.
// Stitch sends events server-side as JSON with HMAC-SHA256 signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-stitch-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const rawBody = await req.text();
    const signature = req.headers.get("x-stitch-signature") || "";
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return new Response("bad json", { status: 400 }); }

    // Stitch event shape varies; common fields: data.node.id, data.eventType
    const requestId: string | undefined = payload?.data?.node?.id || payload?.data?.id;
    if (!requestId) return new Response("no request id", { status: 400 });

    const { data: session } = await admin.from("stitch_payment_sessions")
      .select("*").eq("stitch_request_id", requestId).maybeSingle();
    if (!session) {
      console.log("stitch-webhook: no session for", requestId);
      return new Response("ok", { status: 200 });
    }

    // Verify HMAC using this club's client_secret
    const { data: secrets } = await admin.from("club_secrets")
      .select("payment_gateway_credentials").eq("club_id", session.club_id).maybeSingle();
    const creds = (secrets?.payment_gateway_credentials || {}) as Record<string, string>;
    if (creds.client_secret && signature) {
      const valid = await verifyHmac(rawBody, signature, creds.client_secret);
      if (!valid) {
        console.error("stitch-webhook: invalid signature for", requestId);
        return new Response("invalid signature", { status: 401 });
      }
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

async function verifyHmac(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, "0")).join("");
    return signature.toLowerCase().includes(computed.toLowerCase());
  } catch { return false; }
}

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
