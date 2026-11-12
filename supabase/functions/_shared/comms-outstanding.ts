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

/** Rand amount as shown to members, e.g. "R1 234.50" style via en-ZA grouping. */
export function formatRand(n: number): string {
  return `R${(Math.round(n * 100) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** True when any channel body/subject uses the {{outstanding_amount}} merge field. */
export function usesOutstandingAmount(content: unknown): boolean {
  if (!content || typeof content !== "object") return false;
  return Object.values(content as Record<string, any>).some((v) =>
    /{{\s*outstanding_amount\s*}}/.test(`${v?.subject ?? ""} ${v?.body ?? ""}`)
  );
}

/** Admin-unticked members are removed from an outstanding-balance send. */
export function excludeMembers<T extends { id: string }>(members: T[], excludeIds: unknown): T[] {
  const ex = new Set(Array.isArray(excludeIds) ? excludeIds.map(String) : []);
  return ex.size ? members.filter((m) => !ex.has(m.id)) : members;
}

const TITLES = /^(mr|mrs|ms|miss|dr|prof|ds|adv|mnr|mev|me)\.?$/i;

/**
 * Greeting name: the first name when it is a real name; the full name when the
 * first word is only initials (e.g. "WD"), a single letter or a title, or the
 * member has a single-word name.
 */
export function greetingName(fullName: string | null | undefined): string {
  const full = String(fullName ?? "").trim().replace(/\s+/g, " ");
  if (!full) return "member";
  const [first, ...rest] = full.split(" ");
  if (!rest.length) return full;
  const bare = first.replace(/\./g, "");
  const initials = /^[A-Z]{1,3}$/.test(bare) || /^([A-Za-z]\.)+$/.test(first);
  if (initials || TITLES.test(first)) return full;
  return first;
}
