// Round-robin pairing + slot allocator for league rounds
import { addMinutes, format, parse } from "date-fns";

export type Pairing = { home: string; away: string };

/**
 * Single round-robin: every team plays each other once.
 * Uses the circle method. Returns rounds of pairings (BYE pairings excluded).
 */
export function roundRobin(teams: string[]): Pairing[][] {
  const ts = [...teams];
  if (ts.length < 2) return [];
  if (ts.length % 2 === 1) ts.push("__BYE__");
  const n = ts.length;
  const rounds: Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ts[i];
      const b = ts[n - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") {
        round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
      }
    }
    rounds.push(round);
    // rotate (keep ts[0] fixed)
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

/**
 * Flatten pairings into all-vs-all (single round) for a single round of play.
 */
export function allPairsOnce(teams: string[]): Pairing[] {
  const out: Pairing[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      out.push({ home: teams[i], away: teams[j] });
    }
  }
  return out;
}

export type SlotAssignment = {
  home: string;
  away: string;
  courtId: number;
  startTime: string; // HH:mm
};

/**
 * Allocate pairings across (courts × time slots), avoiding back-to-back conflicts
 * for any single team where possible.
 */
export function allocateSlots(
  pairings: Pairing[],
  courtIds: number[],
  startTime: string,
  endTime: string,
  slotMinutes: number,
): SlotAssignment[] {
  if (!courtIds.length || !pairings.length) return [];
  const start = parse(startTime, "HH:mm", new Date());
  const end = parse(endTime, "HH:mm", new Date());
  const slots: string[] = [];
  let cur = start;
  while (cur < end) {
    slots.push(format(cur, "HH:mm"));
    cur = addMinutes(cur, slotMinutes);
  }
  if (!slots.length) return [];

  const remaining = [...pairings];
  const out: SlotAssignment[] = [];
  const lastSlotByTeam = new Map<string, number>();

  for (let s = 0; s < slots.length && remaining.length; s++) {
    const usedTeams = new Set<string>();
    for (const courtId of courtIds) {
      if (!remaining.length) break;
      // prefer a pairing whose teams aren't already playing this slot
      // and ideally weren't playing in the immediately previous slot
      let pickIdx = remaining.findIndex(
        (p) =>
          !usedTeams.has(p.home) &&
          !usedTeams.has(p.away) &&
          (lastSlotByTeam.get(p.home) ?? -2) !== s - 1 &&
          (lastSlotByTeam.get(p.away) ?? -2) !== s - 1,
      );
      if (pickIdx === -1) {
        pickIdx = remaining.findIndex(
          (p) => !usedTeams.has(p.home) && !usedTeams.has(p.away),
        );
      }
      if (pickIdx === -1) break;
      const [pair] = remaining.splice(pickIdx, 1);
      out.push({ ...pair, courtId, startTime: slots[s] });
      usedTeams.add(pair.home);
      usedTeams.add(pair.away);
      lastSlotByTeam.set(pair.home, s);
      lastSlotByTeam.set(pair.away, s);
    }
  }
  // overflow — append remaining unscheduled at last slot, first court (admin can edit)
  for (const p of remaining) {
    out.push({ ...p, courtId: courtIds[0], startTime: slots[slots.length - 1] });
  }
  return out;
}
