/**
 * What a member's own tournament entry fee looks like RIGHT NOW, derived from the
 * entry AND its linked account charge (club_member_fee_payments via
 * registration.fee_payment_id) — never from the "on account" flag alone.
 * Pure: never charges, never posts. Used by every club's entry card.
 */
export type EntryFeeReg = {
  status?: string | null;
  fee_status?: string | null;
  fee_settled_via?: string | null;
  paid_at?: string | null;
  fee_payment_id?: string | null;
};
export type LinkedCharge = { id: string; amount: number | string; paid: boolean } | null | undefined;

export type EntryFeeState =
  | { kind: "not_required" }
  | { kind: "paid" }
  | { kind: "waived" }
  | { kind: "pending_eft" }
  /** A real, unpaid charge sits on the member account. amountCents = the charge itself. */
  | { kind: "account_charged"; amountCents: number; mismatch: boolean }
  /** Status says "on account" but no live charge backs it — club must check; offer nothing automatic. */
  | { kind: "account_unverified" }
  /** Genuinely unpaid and not on account — offer payment choices. */
  | { kind: "unpaid" };

export function deriveEntryFeeState(
  reg: EntryFeeReg | null | undefined,
  charge: LinkedCharge,
  dueCents: number,
  opts: { chargeLoaded: boolean },
): EntryFeeState | null {
  if (!reg) return null;
  const fs = String(reg.fee_status ?? "");
  if (reg.paid_at || fs === "paid" || reg.status === "paid") return { kind: "paid" };
  if (fs === "waived" || reg.status === "waived") return { kind: "waived" };
  if (fs === "not_required" || dueCents <= 0) return { kind: "not_required" };
  if (reg.status === "pending_eft" || fs === "pending") return { kind: "pending_eft" };

  const onAccount = reg.fee_settled_via === "account" || fs === "on_account";
  const live = charge && !charge.paid && Number(charge.amount) > 0 ? charge : null;
  if (onAccount) {
    if (reg.fee_payment_id && !opts.chargeLoaded) return null; // wait — never guess
    if (live) {
      const amountCents = Math.round(Number(live.amount) * 100);
      return { kind: "account_charged", amountCents, mismatch: amountCents !== Math.round(dueCents) };
    }
    if (charge?.paid) return { kind: "paid" };
    return { kind: "account_unverified" };
  }
  return { kind: "unpaid" };
}

/** "I've already paid" only makes sense while the fee is genuinely open and not already on account or awaiting EFT check. */
export const canReportPayment = (s: EntryFeeState | null) => s?.kind === "unpaid";
/** Payment buttons (card / EFT / account / cash) only when nothing is settled or charged. */
export const canChoosePayment = (s: EntryFeeState | null) => s?.kind === "unpaid" || s?.kind === "pending_eft";
