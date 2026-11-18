/**
 * Entry counting — one authoritative answer to "how many players entered?".
 *
 * A tournament entrant can take part in more than one division, so there are
 * two different numbers organisers need and they must never be conflated:
 *   • unique players — distinct humans in the tournament (doubles partners count too)
 *   • total entries  — one per player per division they entered
 */
import {
  classifyEntrant,
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
  /** Players invited but not yet entered (no acceptance yet) — shown so a card never reads "0 players" while invites are out. */
  invitedPlayers?: number;
}

const SETTLED_FEE = new Set(["paid", "waived", "on_account"]);




/**
 * Counts derived from registration rows (admin card / dialog surfaces).
 *
 * Counted per person, per category: a doubles pair where both partners have
 * their own registration is two category entries (not four), and a partner
 * named on someone else's entry is paid/outstanding according to their OWN
 * registration — never the entrant's fee.
 */
export function countEntries(
  rows: EntryCountRowLike[] | null | undefined,
  ctx: EntrantContext = {},
): EntryCounts {
  const list = rows || [];
  const ownRow = new Map<string, EntryCountRowLike>();
  const participating = new Set<string>();
  for (const row of list) {
    const id = row.club_member_id;
    if (!id) continue;
    if (isParticipatingEntrant(row, ctx)) {
      participating.add(id);
      ownRow.set(id, row);
    } else if (!ownRow.has(id) || classifyEntrant(ownRow.get(id)!, ctx) === "declined") {
      ownRow.set(id, row);
    }
  }

  // person -> category key -> fee state of that category entry
  const entries = new Map<string, Map<string, "paid" | "outstanding" | "none">>();
  const feeState = (row: EntryCountRowLike | undefined): "paid" | "outstanding" | "none" => {
    const fee = String((row as any)?.fee_status || "").toLowerCase();
    if (SETTLED_FEE.has(fee)) return "paid";
    if (fee && fee !== "not_required") return "outstanding";
    return "none";
  };
  const add = (id: string, keys: string[], state: "paid" | "outstanding" | "none") => {
    const m = entries.get(id) ?? new Map();
    for (const k of keys) if (!m.has(k)) m.set(k, state);
    entries.set(id, m);
  };

  for (const row of list) {
    // Only entrants who are actually in the tournament count. Invitations that
    // were never accepted, and cancellations, are not entries.
    if (!isParticipatingEntrant(row, ctx)) continue;
    const keys = divisionKeys(row);
    if (row.club_member_id) add(row.club_member_id, keys, feeState(row));
    const partner = row.partner_member_id;
    // A partner with their own live entry is counted from that entry.
    if (partner && !participating.has(partner)) {
      const own = ownRow.get(partner);
      add(partner, keys, feeState(own && classifyEntrant(own, ctx) !== "declined" ? own : row));
    }
  }

  let totalEntries = 0;
  let paidEntries = 0;
  let outstandingEntries = 0;
  for (const m of entries.values()) {
    for (const state of m.values()) {
      totalEntries += 1;
      if (state === "paid") paidEntries += 1;
      else if (state === "outstanding") outstandingEntries += 1;
    }
  }

  // Invited but not entered — tracked separately so a card never reads
  // "0 players" while invites are out. Anyone already counted is excluded.
  const invited = new Set<string>();
  for (const row of list) {
    if (isParticipatingEntrant(row, ctx) || classifyEntrant(row, ctx) === "declined") continue;
    for (const id of [row.club_member_id, row.partner_member_id].filter(Boolean) as string[]) {
      if (!entries.has(id)) invited.add(id);
    }
  }

  return { uniquePlayers: entries.size, totalEntries, paidEntries, outstandingEntries, invitedPlayers: invited.size };
}

function divisionKeys(row: EntryCountRowLike): string[] {
  const raw = row.division_choices;
  if (!Array.isArray(raw)) return ["_"];
  const unique = Array.from(new Set(raw.map((n) => Number(n)).filter((n) => Number.isFinite(n)))).map(String);
  return unique.length > 0 ? unique : ["_"];
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
