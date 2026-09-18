// Shared PayFast settlement — used by payfast-itn and payfast-verify-checkout.
// Mirrors the Paynow settlement so wallet credits, fee marking and tournament
// entries behave identically whichever gateway the club uses.
import { autoSettleFeesFromTopup } from "./wallet-auto-settle.ts";

export async function settlePayfastSession(admin: any, session: any) {
  const amount = Number(session.amount);
  const description =
    session.description ||
    (session.purpose === "topup"
      ? "Wallet top-up (PayFast)"
      : session.purpose === "tournament"
        ? "Tournament entry fee (PayFast)"
        : "Fee payment (PayFast)");
  const ref = session.payfast_payment_id || session.id;

  if (session.purpose !== "tournament") {
    const { error: insErr } = await admin.from("member_credit_transactions").insert({
      club_id: session.club_id,
      club_member_id: session.club_member_id,
      amount,
      type: "debit",
      method: "card",
      description: `${description} [PayFast]`,
      reference: `PAYFAST-${ref}`,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    if (insErr && (insErr as any).code !== "23505") {
      console.error("member_credit_transactions insert failed:", insErr);
    }
  }

  if (session.purpose === "topup" && session.club_member_id) {
    await autoSettleFeesFromTopup(admin, {
      clubId: session.club_id,
      clubMemberId: session.club_member_id,
      amount,
      sourceTag: "PayFast",
    });
  }

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
          await admin.from("club_member_fee_payments").update({ amount: newAmount }).eq("id", f.id);
        }
        if (remaining <= 0) break;
      }
    }
  }

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
        payment_ref: `PAYFAST-${ref}`,
        paid_at: new Date().toISOString(),
      })
      .eq("id", session.champ_registration_id);

    if (regRow?.fee_payment_id) {
      await admin
        .from("club_member_fee_payments")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("id", regRow.fee_payment_id);
    }

    await admin
      .from("member_credit_transactions")
      .update({ status: "cancelled" })
      .eq("reference", `TOURN-REG-${session.champ_registration_id}`)
      .eq("status", "pending");
  }
}

/** Atomically claim a session as completed. Returns true when this caller won. */
export async function claimPayfastSession(admin: any, sessionId: string): Promise<boolean> {
  const { data } = await admin
    .from("payfast_payment_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .neq("status", "completed")
    .select("id");
  return !!(data && data.length > 0);
}
