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

/* ------------------------------------------------------------------ *
 * Mixed scheduling — each stage can be "play by a date" (players book)
 * or "fixed date & courts" (organiser books). Pools follow `opening`;
 * each play-off round has its own switch. Missing = tournament-wide mode.
 * ------------------------------------------------------------------ */

export type StageMode = "self" | "club";

export interface PlayoffStagePlan {
  mode: StageMode;
  /** "HH:MM" first game time — fixed rounds only. */
  start_time?: string | null;
  /** Courts in use that day — fixed rounds only. */
  court_ids?: number[];
}

export interface StageScheduling {
  opening?: StageMode;
  playoffs?: Partial<Record<PlayoffKey, PlayoffStagePlan>>;
}

export type PlayoffPreset = "same" | "final_fixed" | "all_fixed";

const asMode = (v: unknown): StageMode | undefined => (v === "self" || v === "club" ? v : undefined);

export function parseStageScheduling(value: unknown): StageScheduling {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, any>;
  const out: StageScheduling = {};
  const opening = asMode(v.opening);
  if (opening) out.opening = opening;
  if (v.playoffs && typeof v.playoffs === "object") {
    const p: StageScheduling["playoffs"] = {};
    for (const k of PLAYOFF_KEY_ORDER) {
      const r = v.playoffs[k];
      const mode = asMode(r?.mode);
      if (!mode) continue;
      p[k] = {
        mode,
        start_time: typeof r.start_time === "string" && /^\d{2}:\d{2}/.test(r.start_time) ? r.start_time.slice(0, 5) : null,
        court_ids: Array.isArray(r.court_ids) ? r.court_ids.map(Number).filter((n: number) => Number.isFinite(n)) : [],
      };
    }
    out.playoffs = p;
  }
  return out;
}

const baseMode = (m: unknown): StageMode => (m === "self" ? "self" : "club");

export function openingModeFor(ss: StageScheduling | null | undefined, schedulingMode: unknown): StageMode {
  return ss?.opening ?? baseMode(schedulingMode);
}

export function playoffModeFor(key: PlayoffKey, ss: StageScheduling | null | undefined, schedulingMode: unknown): StageMode {
  return ss?.playoffs?.[key]?.mode ?? openingModeFor(ss, schedulingMode);
}

/** Who books the court for this game: players ("self") or the organiser ("club"). */
export function stageModeForGame(
  m: { stage?: string | null; stage_label?: string | null } | null | undefined,
  ss: StageScheduling | null | undefined,
  schedulingMode: unknown,
): StageMode {
  if (m && isPlayoffGame(m)) {
    const key = playoffKeyForLabel(m.stage_label, m.stage);
    if (key) return playoffModeFor(key, ss, schedulingMode);
  }
  return openingModeFor(ss, schedulingMode);
}

/** Does any stage of this tournament let players arrange their own games? */
export function anyStageSelf(ss: StageScheduling | null | undefined, schedulingMode: unknown, keys: PlayoffKey[] = PLAYOFF_KEY_ORDER): boolean {
  if (openingModeFor(ss, schedulingMode) === "self") return true;
  return keys.some((k) => playoffModeFor(k, ss, schedulingMode) === "self");
}

export function applyPlayoffPreset(
  preset: PlayoffPreset,
  keys: PlayoffKey[],
  current: StageScheduling,
  schedulingMode: unknown,
): StageScheduling {
  const opening = openingModeFor(current, schedulingMode);
  const playoffs: StageScheduling["playoffs"] = {};
  for (const k of keys) {
    const prev = current.playoffs?.[k];
    const mode: StageMode =
      preset === "same" ? opening : preset === "all_fixed" ? "club" : k === "final" ? "club" : "self";
    playoffs[k] = { mode, start_time: prev?.start_time ?? null, court_ids: prev?.court_ids ?? [] };
  }
  return { ...current, opening, playoffs };
}

/** Which preset the current settings match, or null when hand-edited. */
export function presetFor(ss: StageScheduling, keys: PlayoffKey[], schedulingMode: unknown): PlayoffPreset | null {
  const modes = keys.map((k) => playoffModeFor(k, ss, schedulingMode));
  const opening = openingModeFor(ss, schedulingMode);
  if (modes.every((m) => m === opening)) return "same";
  if (modes.every((m) => m === "club")) return "all_fixed";
  if (keys.every((k, i) => modes[i] === (k === "final" ? "club" : "self"))) return "final_fixed";
  return null;
}

export function validateStageScheduling(
  ss: StageScheduling,
  keys: PlayoffKey[],
  schedulingMode: unknown,
  names: Partial<Record<PlayoffKey, string>> = {},
): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (playoffModeFor(k, ss, schedulingMode) !== "club") continue;
    const plan = ss.playoffs?.[k];
    if (!plan) continue; // inherits the tournament-wide court setup
    const name = names[k] ?? ROUND_NAME[k];
    if (!plan.start_time) out.push(`${name}: set a start time.`);
    if (!plan.court_ids || plan.court_ids.length === 0) out.push(`${name}: pick at least one court.`);
  }
  return out;
}

/**
 * Court + time for the games of one fixed play-off round: games fill the
 * chosen courts at the start time, then the next slot after `durationMin`.
 */
export function assignFixedSlots(
  count: number,
  plan: PlayoffStagePlan | null | undefined,
  durationMin: number,
): Array<{ court_id: number; scheduled_time: string } | null> {
  const courts = plan?.court_ids ?? [];
  const start = plan?.start_time;
  if (!start || courts.length === 0) return Array.from({ length: count }, () => null);
  const [h, m] = start.split(":").map(Number);
  const dur = Math.max(10, durationMin || 45);
  return Array.from({ length: count }, (_, i) => {
    const mins = h * 60 + m + Math.floor(i / courts.length) * dur;
    const hh = String(Math.floor(mins / 60) % 24).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    return { court_id: courts[i % courts.length], scheduled_time: `${hh}:${mm}` };
  });
}
