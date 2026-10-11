/**
 * Entry counting — one authoritative answer to "how many players entered?".
 *
 * A tournament entrant can take part in more than one division, so there are
 * two different numbers organisers need and they must never be conflated:
 *   • unique players — distinct humans in the tournament (doubles partners count too)
 *   • total entries  — one per player per division they entered
 */
import {
  isParticipatingEntrant,
  type EntrantContext,
  type EntrantRowLike,
} from "./entrant-status";

export interface EntryCountRowLike extends EntrantRowLike {
  fee_status?: string | null;
  club_member_id?: string | null;
  partner_member_id?: string | null;
  status?: string | null;
  division_choices?: unknown;
}

export interface EntryCounts {
  uniquePlayers: number;
  totalEntries: number;
  /** Category entries whose fee is settled (paid, waived or charged to the member account). */
  paidEntries?: number;
  /** Category entries with a fee still owing (due / payment pending). */
  outstandingEntries?: number;
}

const SETTLED_FEE = new Set(["paid", "waived", "on_account"]);



function divisionCount(row: EntryCountRowLike): number {
  const raw = row.division_choices;
  if (!Array.isArray(raw)) return 1;
  const unique = new Set(raw.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
  return unique.size > 0 ? unique.size : 1;
}

/** Counts derived from registration rows (admin card / dialog surfaces). */
export function countEntries(
  rows: EntryCountRowLike[] | null | undefined,
  ctx: EntrantContext = {},
): EntryCounts {
  const players = new Set<string>();
  let totalEntries = 0;
  let paidEntries = 0;
  let outstandingEntries = 0;
  for (const row of rows || []) {
    // Only entrants who are actually in the tournament count. Invitations that
    // were never accepted, and cancellations, are not entries.
    if (!isParticipatingEntrant(row, ctx)) continue;
    const divisions = divisionCount(row);
    const ids = [row.club_member_id, row.partner_member_id].filter(Boolean) as string[];
    if (ids.length === 0) continue;
    for (const id of ids) players.add(id);
    const n = divisions * ids.length;
    totalEntries += n;
    // Payment is tracked per registration (one fee covers that row's categories);
    // it never decides whether the entry counts.
    const fee = String((row as any).fee_status || "").toLowerCase();
    if (SETTLED_FEE.has(fee)) paidEntries += n;
    else if (fee && fee !== "not_required") outstandingEntries += n;
  }
  return { uniquePlayers: players.size, totalEntries, paidEntries, outstandingEntries };
}

/**
 * Counts derived from the live allocation grid, where the same player may sit
 * in several league buckets.
 */
export function countAllocatedEntries(
  buckets: (string[] | null | undefined)[],
  unassigned: string[] | null | undefined = [],
): EntryCounts {
  const players = new Set<string>();
  let totalEntries = 0;
  for (const bucket of buckets || []) {
    for (const id of bucket || []) {
      if (!id) continue;
      players.add(id);
      totalEntries += 1;
    }
  }
  for (const id of unassigned || []) {
    if (!id) continue;
    players.add(id);
    totalEntries += 1;
  }
  return { uniquePlayers: players.size, totalEntries };
}

export function formatEntryCounts(counts: EntryCounts, noun: "player" | "pair" = "player"): string {
  const p = counts.uniquePlayers === 1 ? noun : `${noun}s`;
  return `${counts.uniquePlayers} unique ${p} · ${counts.totalEntries} ${counts.totalEntries === 1 ? "entry" : "entries"}`;
}
