// Shared Paynow settlement logic — used by paynow-verify-checkout and paynow-webhook.
import { verifyPaynowMessage, isPaynowPaid } from "./paynow.ts";

export async function pollPaynow(pollUrl: string, integrationKey: string): Promise<string | null> {
  try {
    const resp = await fetch(pollUrl, { method: "POST" });
    const raw = await resp.text();
    if (!resp.ok) return null;
    const { ok, fields } = await verifyPaynowMessage(raw, integrationKey);
    if (!ok) {
      console.error("Paynow poll hash mismatch");
      return null;
    }
    return fields.status || null;
  } catch (e) {
    console.error("Paynow poll error", e);
    return null;
  }
}

export function mapStatus(paynowStatus: string): string {
  const s = paynowStatus.toLowerCase();
  if (isPaynowPaid(s)) return "completed";
  if (s === "cancelled") return "cancelled";
  if (s === "failed" || s === "disputed" || s === "refunded") return "failed";
  if (s === "sent") return "sent";
  return "processing";
}

/** Finalize a claimed Paynow session: credit wallet / mark fees / mark tournament entry. */
export async function settlePaynowSession(admin: any, session: any) {
  const amount = Number(session.amount);
  const description =
    session.description ||
    (session.purpose === "topup"
      ? "Wallet top-up (Paynow)"
      : session.purpose === "tournament"
        ? "Tournament entry fee (Paynow)"
        : "Fee payment (Paynow)");
  const ref = session.paynow_reference || session.id;

  if (session.purpose !== "tournament") {
    const { error: insErr } = await admin.from("member_credit_transactions").insert({
      club_id: session.club_id,
      club_member_id: session.club_member_id,
      amount,
      type: "debit",
      method: "card",
      description: `${description} [Paynow]`,
      reference: `PAYNOW-${ref}`,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    // 23505 = unique_violation → already recorded, treat as success.
    if (insErr && (insErr as any).code !== "23505") {
      console.error("member_credit_transactions insert failed:", insErr);
    }
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
          await admin
            .from("club_member_fee_payments")
            .update({ amount: newAmount })
            .eq("id", f.id);
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
        payment_ref: `PAYNOW-${ref}`,
        paid_at: new Date().toISOString(),
      })
      .eq("id", session.champ_registration_id);

    if (regRow?.fee_payment_id) {
      await admin
        .from("club_member_fee_payments")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("id", regRow.fee_payment_id);
    }

    // Cancel the pending EFT row created when the invite was accepted.
    await admin
      .from("member_credit_transactions")
      .update({ status: "cancelled" })
      .eq("reference", `TOURN-REG-${session.champ_registration_id}`)
      .eq("status", "pending");
  }
}
