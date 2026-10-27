/**
 * Court Manager reports debtor balances: a negative figure means the club owes
 * the member (credit available). Members see their available credit as a
 * positive amount, so the sign is inverted for display only — the GoBook value
 * itself is never written or reinterpreted at source.
 */
export function memberGoBookBalance(raw: number): number {
  return raw === 0 ? 0 : -raw;
}

export type GoBookBalanceTone = "success" | "destructive" | "muted";

export function goBookBalanceTone(memberValue: number): GoBookBalanceTone {
  if (memberValue > 0) return "success";
  if (memberValue < 0) return "destructive";
  return "muted";
}
