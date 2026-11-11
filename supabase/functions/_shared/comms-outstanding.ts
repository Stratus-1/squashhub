/**
 * "Members with an outstanding balance" campaign audience.
 *
 * Balance = the member statement net on the debtors + member_credits ledger
 * (billed = Dr debtors, paid = Cr debtors + net member credit), exactly as the
 * Members tab and Member Statement show it. Read-only: never changes balances.
 */
export type LedgerRow = {
  club_member_id: string | null;
  account: string | null;
  debit: number | string | null;
  credit: number | string | null;
};

/** Anything above half a cent owed counts as an outstanding balance. */
export const OUTSTANDING_MIN = 0.005;

export function balancesByMember(rows: LedgerRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.club_member_id) continue;
    if (r.account !== "debtors" && r.account !== "member_credits") continue;
    const net = Number(r.debit || 0) - Number(r.credit || 0);
    map.set(r.club_member_id, (map.get(r.club_member_id) ?? 0) + net);
  }
  return map;
}

export function owingMemberIds(rows: LedgerRow[]): Set<string> {
  const out = new Set<string>();
  for (const [id, bal] of balancesByMember(rows)) if (bal > OUTSTANDING_MIN) out.add(id);
  return out;
}

/** Outstanding audiences include suspended members (often the ones in arrears) but never resigned ones. */
export function isOutstandingAudienceMember(member: { status?: string | null } | null | undefined): boolean {
  return member?.status === "active";
}
