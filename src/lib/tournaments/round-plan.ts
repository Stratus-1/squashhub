/**
 * Round plan — works out which dates a tournament actually needs, from the
 * structure the organiser chose, so setup only asks for dates that apply.
 *
 *  - Opening rounds: how many pool/league rounds the biggest pool needs.
 *  - Play-off rounds: exactly the rounds the chosen play-off type has
 *    (position play-offs = one round, crossover = semis + final, …).
 *
 * Play-off games take the date of THEIR play-off round and never borrow a
 * pool round's date; with no date set they read "Date to be set".
 *
 * Pure logic: no React, no network.
 */
import type { MilestoneKey, MilestonePlayBy } from "./round-definitions";

export type PlayoffKey = "place_playoffs" | "quarter_final" | "semi_final" | "final";
export const PLAYOFF_KEY_ORDER: PlayoffKey[] = ["place_playoffs", "quarter_final", "semi_final", "final"];

export type PlayoffType = "none" | "position" | "crossover" | "knockout";

export const PLAYOFF_TYPE_INFO: Record<Exclude<PlayoffType, "none">, { name: string; example: string }> = {
  position: { name: "Position play-offs", example: "1st Pool A v 1st Pool B, 2nd v 2nd … — every qualifier plays once for a final place." },
  crossover: { name: "Crossover play-offs", example: "1st Pool A v 2nd Pool B and 1st Pool B v 2nd Pool A, then a final." },
  knockout: { name: "Knockout", example: "Seeded draw of all qualifiers (1 v 8, 2 v 7 …) through to a final." },
};

export interface PlayoffRound {
  key: PlayoffKey;
  name: string;
  /** Divisions that play this round. */
  usedBy: string[];
}

const ROUND_NAME: Record<PlayoffKey, string> = {
  place_playoffs: "Place play-offs",
  quarter_final: "Quarter-finals",
  semi_final: "Semi-finals",
  final: "Final (and 3rd/4th)",
};

/** Rounds one round-robin pool needs (odd sizes need an extra round for the bye). */
export function roundsForPool(size: number, opts: { double?: boolean } = {}): number {
  const n = Math.max(0, Math.floor(Number(size) || 0));
  if (n < 2) return 0;
  const single = n % 2 === 0 ? n - 1 : n;
  return opts.double ? single * 2 : single;
}

/** Knockout rounds needed to get `entrants` down to one winner. */
export function knockoutRounds(entrants: number): number {
  const n = Math.max(0, Math.floor(Number(entrants) || 0));
  return n < 2 ? 0 : Math.ceil(Math.log2(n));
}

export interface DivisionShape {
  label: string;
  /** "single_round_robin" | "double_round_robin" | "knockout" | "swiss" | … */
  format: string;
  /** Entrants per pool (one entry for a single pool). */
  poolSizes: number[];
  playoffs: boolean;
  /** Stored play-off mode: "position" | "knockout". */
  playoffMode?: string | null;
  qualifiersPerPool?: number;
  /** Swiss: number of rounds chosen. */
  swissRounds?: number;
}

/** Opening rounds one division needs before any play-off. */
export function openingRoundsFor(d: DivisionShape): number {
  const sizes = (d.poolSizes || []).filter((n) => n > 0);
  if (d.format === "knockout") {
    // Pure knockout: rounds before the quarter-final count as opening rounds.
    const total = knockoutRounds(sizes.reduce((a, b) => a + b, 0));
    return Math.max(0, total - 3);
  }
  if (d.format === "swiss") return Math.max(0, Number(d.swissRounds) || 0);
  const double = d.format === "double_round_robin";
  return sizes.reduce((max, n) => Math.max(max, roundsForPool(n, { double })), 0);
}

export function openingRoundsNeeded(divisions: DivisionShape[]): number {
  return divisions.reduce((max, d) => Math.max(max, openingRoundsFor(d)), 0);
}

/** The play-off type a division really runs. */
export function playoffTypeFor(d: DivisionShape): PlayoffType {
  const pools = (d.poolSizes || []).filter((n) => n > 0).length;
  if (d.format === "knockout") return "knockout";
  if (!d.playoffs) return "none";
  if (d.playoffMode === "knockout") {
    const q = Math.max(1, Math.floor(Number(d.qualifiersPerPool) || 2));
    return pools === 2 && q === 2 ? "crossover" : "knockout";
  }
  return pools > 1 ? "position" : "knockout";
}

/** Play-off rounds for one division, in playing order. */
export function playoffKeysFor(d: DivisionShape): PlayoffKey[] {
  const type = playoffTypeFor(d);
  if (type === "none") return [];
  if (type === "position") return ["place_playoffs"];
  if (type === "crossover") return ["semi_final", "final"];
  const sizes = (d.poolSizes || []).filter((n) => n > 0);
  const entrants =
    d.format === "knockout"
      ? sizes.reduce((a, b) => a + b, 0)
      : sizes.length > 1
        ? sizes.length * Math.max(1, Math.floor(Number(d.qualifiersPerPool) || 2))
        : Math.min(4, sizes[0] || 0); // single pool: top 4 into semis
  const rounds = knockoutRounds(entrants);
  const keys: PlayoffKey[] = [];
  if (rounds >= 3) keys.push("quarter_final");
  if (rounds >= 2) keys.push("semi_final");
  if (rounds >= 1) keys.push("final");
  return keys;
}

/** Tournament-wide play-off rounds: only the ones some division plays. */
export function playoffRoundsFor(divisions: DivisionShape[]): PlayoffRound[] {
  const used = new Map<PlayoffKey, string[]>();
  for (const d of divisions) {
    for (const k of playoffKeysFor(d)) {
      if (!used.has(k)) used.set(k, []);
      used.get(k)!.push(d.label);
    }
  }
  return PLAYOFF_KEY_ORDER.filter((k) => used.has(k)).map((k) => ({
    key: k,
    name: k === "semi_final" && divisions.every((d) => !playoffKeysFor(d).includes("semi_final") || playoffTypeFor(d) === "crossover")
      ? "Crossover semi-finals"
      : ROUND_NAME[k],
    usedBy: used.get(k)!,
  }));
}

/** Warning when the organiser's round count doesn't match the structure. */
export function openingRoundsWarning(planned: number, needed: number): string | null {
  if (needed <= 0 || planned === needed) return null;
  if (planned < needed) {
    return `Your pools need ${needed} rounds but only ${planned} ${planned === 1 ? "is" : "are"} listed — rounds ${planned + 1}–${needed} would have no date.`;
  }
  return `Your pools only need ${needed} rounds — round${planned - needed > 1 ? "s" : ""} ${needed + 1}${planned - needed > 1 ? `–${planned}` : ""} would be empty.`;
}

/* ------------------------------------------------------------------ *
 * Dating play-off games
 * ------------------------------------------------------------------ */

const PLACE_RE = /\d+(st|nd|rd|th)\s*\/\s*\d+(st|nd|rd|th)|placement/i;

/** Is this game a play-off / knockout game (never dated by pool round number)? */
export function isPlayoffGame(m: { stage?: string | null; stage_label?: string | null }): boolean {
  const stage = String(m?.stage || "").toLowerCase();
  if (stage.startsWith("playoff") || stage === "ko" || stage === "knockout") return true;
  return playoffKeyForLabel(m?.stage_label) !== null;
}

/** Which play-off round a stage / label belongs to; null for pool games. */
export function playoffKeyForLabel(label?: string | null, stage?: string | null): PlayoffKey | null {
  const s = String(stage || "").toLowerCase();
  const tail = String(label || "").split("·").pop()!.trim();
  if (PLACE_RE.test(tail)) return "place_playoffs";
  if (s === "playoff_qf" || /quarter/i.test(tail)) return "quarter_final";
  if (s === "playoff_sf" || /semi/i.test(tail)) return "semi_final";
  if (s === "playoff_final" || s === "playoff_3rd" || /\bfinal\b|3rd place|third/i.test(tail)) return "final";
  return null;
}

/** The play-by date for a play-off game, from its own play-off round only. */
export function playoffDeadline(
  milestones: MilestonePlayBy & { place_playoffs?: string | null } | null | undefined,
  label?: string | null,
  stage?: string | null,
): string | null {
  const key = playoffKeyForLabel(label, stage);
  if (!key || !milestones) return null;
  const pick = (k: string) => {
    const v = (milestones as Record<string, unknown>)[k];
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  };
  if (key === "place_playoffs") return pick("place_playoffs");
  return pick(key as MilestoneKey);
}

export const DATE_TO_BE_SET = "Date to be set";
