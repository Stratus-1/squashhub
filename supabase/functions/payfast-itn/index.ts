// PayFast ITN (Instant Transaction Notification). PayFast POSTs payment
// status here. We verify the signature, confirm the payload with PayFast,
// check the amount, then settle idempotently.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveGatewayCreds } from "../_shared/gateway-creds.ts";
import {
  isSandboxCreds,
  mapPayfastStatus,
  parseOrderedForm,
  pfItnSignature,
  pfValidateItn,
} from "../_shared/payfast.ts";
import { nextChargeDate } from "../_shared/payfast-recurring.ts";
import { claimPayfastSession, settlePayfastSession } from "../_shared/payfast-settlement.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const raw = await req.text();
    const ordered = parseOrderedForm(raw);
    const fields: Record<string, string> = {};
    for (const [k, v] of ordered) fields[k] = v;

    const reference = fields.m_payment_id;
    if (!reference) return new Response("ok");

    const { data: session } = await admin
      .from("payfast_payment_sessions")
      .select("*")
      .eq("id", reference)
      .maybeSingle();
    if (!session) {
      console.error("payfast-itn: unknown reference", reference);
      return new Response("ok");
    }

    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", session.club_id)
      .maybeSingle();
    const creds = resolveGatewayCreds(secrets?.payment_gateway_credentials, "payfast");
    const merchantId = (creds.merchant_id || "").trim();
    if (!merchantId) {
      console.error("payfast-itn: no credentials for club", session.club_id);
      return new Response("ok");
    }

    if ((fields.merchant_id || "").trim() !== merchantId) {
      console.error("payfast-itn: merchant mismatch", { reference });
      return new Response("ok");
    }

    const expected = pfItnSignature(ordered, creds.passphrase || "");
    if ((fields.signature || "").toLowerCase() !== expected.toLowerCase()) {
      console.error("payfast-itn: signature mismatch", { reference });
      return new Response("ok");
    }

    const valid = await pfValidateItn(raw, isSandboxCreds(creds));
    if (!valid) {
      console.error("payfast-itn: PayFast did not validate payload", { reference });
      return new Response("ok");
    }

    const paid = Number(fields.amount_gross || 0);
    const expectedAmount = Number(session.amount);
    if (!(paid > 0) || Math.abs(paid - expectedAmount) > 0.01) {
      console.error("payfast-itn: amount mismatch", { reference, paid, expectedAmount });
      await admin
        .from("payfast_payment_sessions")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .neq("status", "completed");
      return new Response("ok");
    }

    const status = (fields.payment_status || "").toUpperCase();
    console.log("payfast-itn status", { reference, status });

    if (status === "COMPLETE") {
      await admin
        .from("payfast_payment_sessions")
        .update({ payfast_payment_id: fields.pf_payment_id || null })
        .eq("id", session.id);

      // Tokenisation payment: activate the member's monthly card arrangement
      // and remember the saved-card token for future monthly charges.
      if (session.mandate_id) {
        const token = (fields.token || "").trim();
        const { data: mandate } = await admin
          .from("stitch_mandates")
          .select("id, debit_day, months_charged")
          .eq("id", session.mandate_id)
          .maybeSingle();
        if (mandate) {
          await admin
            .from("stitch_mandates")
            .update({
              payfast_token: token || null,
              status: token ? "active" : "failed",
              authorised_at: new Date().toISOString(),
              last_collection_at: new Date().toISOString(),
              months_charged: Number(mandate.months_charged || 0) + 1,
              next_charge_date: token ? nextChargeDate(Number(mandate.debit_day) || 1) : null,
              last_failure_reason: token ? null : "PayFast did not return a card token",
              updated_at: new Date().toISOString(),
            })
            .eq("id", mandate.id);

          await admin.from("stitch_collections").insert({
            club_id: session.club_id,
            mandate_id: mandate.id,
            club_member_id: session.club_member_id,
            amount_cents: Math.round(Number(session.amount) * 100),
            due_date: new Date().toISOString().slice(0, 10),
            status: "paid",
            approval_required: false,
            gateway: "payfast",
            submitted_at: new Date().toISOString(),
            settled_at: new Date().toISOString(),
            posted_at: new Date().toISOString(),
            payfast_payment_id: fields.pf_payment_id || null,
          });
        }
      }
      if (await claimPayfastSession(admin, session.id)) {
        await settlePayfastSession(admin, {
          ...session,
          payfast_payment_id: fields.pf_payment_id || session.payfast_payment_id,
        });
      }
    } else {
      await admin
        .from("payfast_payment_sessions")
        .update({ status: mapPayfastStatus(status), updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .neq("status", "completed");
    }

    return new Response("ok");
  } catch (e: any) {
    console.error("payfast-itn error:", e);
    return new Response("ok");
  }
});
