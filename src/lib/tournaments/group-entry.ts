// Helpers for entering (and paying for) several players in one go.

export interface GroupEntryRow {
  memberId: string;
  name: string;
  partnerMemberId?: string | null;
}

/** Total payable in cents for the rows that still need paying. */
export function groupEntryTotalCents(rows: GroupEntryRow[], entryFeeCents: number): number {
  const fee = Math.max(0, Math.round(entryFeeCents || 0));
  return fee * rows.length;
}

/** Payload for register_players_for_champ — partners are optional. */
export function buildGroupEntryPayload(rows: GroupEntryRow[]) {
  return rows
    .filter((r) => !!r.memberId)
    .map((r) => ({
      member_id: r.memberId,
      partner_member_id: r.partnerMemberId || null,
    }));
}

/**
 * Members that may still be added to a group entry: not the payer, not already
 * entered by anyone, and matching the tournament's gender where it is single-sex.
 */
export function eligibleGroupCandidates<T extends { id: string; gender?: string | null }>(
  members: T[],
  opts: {
    payerMemberId: string;
    alreadyEnteredIds: Iterable<string>;
    selectedIds: Iterable<string>;
    gender?: string | null;
  },
): T[] {
  const taken = new Set<string>([...opts.alreadyEnteredIds, ...opts.selectedIds, opts.payerMemberId]);
  const g = (opts.gender || "").toLowerCase();
  return members.filter((m) => {
    if (taken.has(m.id)) return false;
    const mg = (m.gender || "").toLowerCase();
    if (g === "men") return ["men", "male", "m"].includes(mg);
    if (g === "ladies") return ["ladies", "female", "f", "women"].includes(mg);
    return true;
  });
}
