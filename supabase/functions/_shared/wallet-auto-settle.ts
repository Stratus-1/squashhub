// Shared wallet auto-settlement helper.
//
// When a member tops up their wallet (Stitch / Yoco / Paynow "topup" purpose),
// immediately apply the topped-up funds against their outstanding club fees
// (oldest first). This mirrors the manual "Pay from credit balance" flow so a
// member who has effectively paid is not left with unpaid fee rows — which
// otherwise keeps nudging them (e.g. the recurring-payment prompt) even though
// money is sitting in their wallet.
//
// Idempotent by construction: it only touches fees that are still unpaid at
// call time, and settlement is driven by the payment provider's once-off
// finalisation which itself is guarded against double-processing.

export async function autoSettleFeesFromTopup(
  admin: any,
  opts: {
    clubId: string;
    clubMemberId: string;
    amount: number;
    /** Short tag appended to the ledger description, e.g. "Stitch". */
    sourceTag: string;
  },
) {
  const { clubId, clubMemberId, sourceTag } = opts;
  let remaining = Number(opts.amount);
  if (!clubId || !clubMemberId || !(remaining > 0)) return;

  // Protect the club's floating booking balance: a top-up first fills the
  // member's required buffer (e.g. R20 at Gordon's Bay); only money above the
  // buffer is swept onto old fees. Without this, a top-up made to unblock
  // bookings was immediately swallowed by the oldest unpaid fee.
  try {
    const { data: clubRow } = await admin
      .from("clubs")
      .select("min_booking_balance")
      .eq("id", clubId)
      .maybeSingle();
    const buffer = Number(clubRow?.min_booking_balance ?? 0);
    if (buffer > 0) remaining = Math.max(0, remaining - buffer);
  } catch (e) {
    console.error("auto-settle: club buffer lookup failed, settling full amount:", e);
  }
  if (remaining <= 0) return;

  const { data: unpaid, error } = await admin
    .from("club_member_fee_payments")
    .select("id, fee_label, amount, fee_type")
    .eq("club_member_id", clubMemberId)
    .eq("paid", false)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("auto-settle: fee lookup failed:", error);
    return;
  }

  // Members on an active monthly arrangement may carry their membership fee.
  // Sweeping a top-up onto it swallows money paid to clear court lights / bar
  // charges and leaves the booking gate exactly where it was.
  let carryMembership = false;
  try {
    const { data: mandate } = await admin
      .from("stitch_mandates")
      .select("id")
      .eq("club_member_id", clubMemberId)
      .eq("status", "active")
      .eq("frequency", "monthly")
      .is("suspended_at", null)
      .maybeSingle();
    carryMembership = !!mandate;
  } catch (e) {
    console.error("auto-settle: mandate lookup failed:", e);
  }
  const MEMBERSHIP_TYPES = ["membership", "club_membership", "club"];

  const fees = (unpaid || []).filter(
    (f: any) =>
      Number(f.amount) > 0 &&
      !(carryMembership && MEMBERSHIP_TYPES.includes(f.fee_type ?? "")),
  );
  if (!fees.length) return;

  const settledLabels: string[] = [];
  let settledTotal = 0;

  for (const fee of fees) {
    if (remaining <= 0) break;
    const feeAmt = Number(fee.amount);
    const deduction = Math.min(remaining, feeAmt);
    remaining -= deduction;
    settledTotal += deduction;
    settledLabels.push(String(fee.fee_label || "Club fee"));

    if (deduction >= feeAmt - 0.001) {
      // Fully settled. Keep the original amount on the row for reporting —
      // `paid` is the settlement flag.
      await admin
        .from("club_member_fee_payments")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("id", fee.id);
    } else {
      // Partially settled — reduce the outstanding amount.
      await admin
        .from("club_member_fee_payments")
        .update({ amount: feeAmt - deduction })
        .eq("id", fee.id);
    }
  }

  if (settledTotal > 0) {
    const { error: txErr } = await admin.from("member_credit_transactions").insert({
      club_id: clubId,
      club_member_id: clubMemberId,
      amount: settledTotal,
      type: "debit",
      method: "credit",
      description: `Fee payment from wallet: ${settledLabels.join(", ")} [${sourceTag} auto-settle]`,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    if (txErr) console.error("auto-settle: credit_tx insert failed:", txErr);
  }
}
