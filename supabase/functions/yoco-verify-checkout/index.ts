// Verifies a Yoco checkout by ID and finalizes the payment in our DB.
// Called from the frontend success-return page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { session_id = null } = await req.json().catch(() => ({}));

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let session: any | null = null;
    if (session_id) {
      const { data } = await admin
        .from("yoco_payment_sessions")
        .select("*")
        .eq("id", session_id)
        .maybeSingle();
      session = data;
    } else {
      const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await admin
        .from("yoco_payment_sessions")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["created", "processing", "started"])
        .gte("created_at", since)
        .not("yoco_checkout_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      session = data;
    }
    if (!session) return json({ error: "Session not found" }, 404);
    if (session.user_id !== userId) return json({ error: "Forbidden" }, 403);

    if (session.status === "completed") {
      return json({ status: "completed", already: true });
    }

    // Fetch Yoco checkout status
    const { data: secrets } = await admin
      .from("club_secrets")
      .select("payment_gateway_credentials")
      .eq("club_id", session.club_id)
      .maybeSingle();
    const secretKey = (secrets?.payment_gateway_credentials as any)?.secret_key;
    if (!secretKey) return json({ error: "Yoco key not configured" }, 400);

    // Yoco statuses: created, processing, completed, cancelled, failed, expired.
    // Mobile/browser returns are not always reliable after 3DS. If the app asks
    // about an older pending session, also reconcile the user's latest recent
    // pending sessions and complete whichever Yoco now says is paid.
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentSessions = [] } = await admin
      .from("yoco_payment_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("club_id", session.club_id)
      .eq("club_member_id", session.club_member_id)
      .in("status", ["created", "processing", "started", "cancelled", "failed", "expired"])
      .gte("created_at", since)
      .not("yoco_checkout_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);

    const sessionsToCheck = [session, ...recentSessions.filter((s: any) => s.id !== session.id)];
    let requestedStatus = "created";
    let completedSession: any | null = null;

    for (const candidate of sessionsToCheck) {
      const resp = await fetch(
        `https://payments.yoco.com/api/checkouts/${candidate.yoco_checkout_id}`,
        { headers: { Authorization: `Bearer ${secretKey}` } },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        console.error("Yoco verify failed", candidate.id, resp.status, data);
        if (candidate.id === session.id) {
          return json({ error: `Yoco verify failed [${resp.status}]: ${JSON.stringify(data)}` }, 502);
        }
        continue;
      }

      const yocoStatus: string = data?.status || "created";
      console.log("Yoco checkout status", { session_id: candidate.id, checkout_id: candidate.yoco_checkout_id, status: yocoStatus });

      if (candidate.id === session.id) requestedStatus = yocoStatus;
      if (yocoStatus === "completed") {
        completedSession = candidate;
        break;
      }

      await admin
        .from("yoco_payment_sessions")
        .update({ status: ["processing", "started", "cancelled", "failed", "expired"].includes(yocoStatus) ? yocoStatus : "created" })
        .eq("id", candidate.id);
    }

    if (!completedSession) {
      return json({ status: requestedStatus });
    }
    session = completedSession;

    // Atomically claim the session: only the request that flips status from
    // a non-completed value to "completed" is allowed to write the credit
    // transaction. Prevents duplicate top-ups when the success page double-fires.
    const { data: claimed, error: claimErr } = await admin
      .from("yoco_payment_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", session.id)
      .neq("status", "completed")
      .select("id");
    if (claimErr) {
      return json({ error: `Failed to claim session: ${claimErr.message}` }, 500);
    }
    if (!claimed || claimed.length === 0) {
      // Another concurrent call already completed it — nothing more to do.
      return json({ status: "completed", already: true });
    }

    const amount = Number(session.amount);
    const description =
      session.description ||
      (session.purpose === "topup"
        ? "Wallet top-up (Yoco)"
        : session.purpose === "tournament"
        ? "Tournament entry fee (Yoco)"
        : "Fee payment (Yoco)");

    // Record member_credit_transactions (skip for tournament — entry fees are not member-credit ledger items)
    if (session.purpose !== "tournament") {
      const { error: insErr } = await admin.from("member_credit_transactions").insert({
        club_id: session.club_id,
        club_member_id: session.club_member_id,
        amount,
        type: "debit",
        method: "card",
        description: `${description} [Yoco]`,
        reference: session.yoco_checkout_id,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });
      // Unique index member_credit_tx_card_ref_uniq guards against duplicates.
      // 23505 = unique_violation: a row for this (member, checkout_id) already exists, treat as success.
      if (insErr && (insErr as any).code !== "23505") {
        console.error("member_credit_transactions insert failed:", insErr);
      }
    }

    // For fee purpose, mark linked fees paid
    if (session.purpose === "fee" && Array.isArray(session.fee_ids) && session.fee_ids.length) {
      const { data: fees } = await admin
        .from("club_member_fee_payments")
        .select("id, amount")
        .in("id", session.fee_ids);

      const total = (fees || []).reduce((s: number, f: any) => s + Number(f.amount), 0);
      const isPartial = amount < total - 0.001;

      if (!isPartial) {
        for (const f of fees || []) {
          await admin
            .from("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", f.id);
        }
      } else {
        let remaining = amount;
        for (const f of fees || []) {
          const feeAmt = Number(f.amount);
          const deduction = Math.min(remaining, feeAmt);
          remaining -= deduction;
          const newAmount = feeAmt - deduction;
          if (newAmount <= 0) {
            await admin
              .from("club_member_fee_payments")
              .update({ paid: true, paid_at: new Date().toISOString(), amount: 0 })
              .eq("id", f.id);
          } else {
            await admin
              .from("club_member_fee_payments")
              .update({ amount: newAmount })
              .eq("id", f.id);
          }
          if (remaining <= 0) break;
        }
      }
    }

    // For tournament purpose, mark the registration as paid and clear the linked entry fee
    if (session.purpose === "tournament" && session.champ_registration_id) {
      const { data: regRow } = await admin
        .from("club_champs_registrations")
        .select("fee_payment_id")
        .eq("id", session.champ_registration_id)
        .maybeSingle();

      await admin
        .from("club_champs_registrations")
        .update({
          status: "paid",
          fee_paid_cents: Math.round(amount * 100),
          payment_ref: session.yoco_checkout_id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", session.champ_registration_id);

      if (regRow?.fee_payment_id) {
        await admin
          .from("club_member_fee_payments")
          .update({ paid: true, paid_at: new Date().toISOString() })
          .eq("id", regRow.fee_payment_id);
      }

      // Cancel the pending EFT member_credit_transactions row that the
      // tournament_reg_create_pending_eft_tx trigger created when the invite
      // was first accepted. Without this the row sits forever in the admin's
      // "Pending EFT payments" inbox even though the player actually paid by card.
      await admin
        .from("member_credit_transactions")
        .update({ status: "cancelled" })
        .eq("reference", `TOURN-REG-${session.champ_registration_id}`)
        .eq("status", "pending");
    }


    return json({ status: "completed", amount });
  } catch (e: any) {
    console.error("yoco-verify-checkout error:", e);
    return json({ error: e.message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
