/**
 * Central round definitions — the SINGLE source of truth for a tournament's
 * round names and "play by" dates.
 *
 * Two things are deliberately kept apart:
 *
 *  1. DEFINITIONS are tournament-wide. "Round 6 must be played by 12 Sep" is
 *     one fact for the whole event, edited in exactly one place. Round 6 may
 *     exist even though only the biggest league ever reaches it.
 *  2. PROGRESS is per league. A 4-player league can be at its final while a
 *     20-player league is still on Round 3. Nothing here computes a
 *     tournament-wide "current round" — that idea is what broke the dates.
 *
 * Championship milestones (quarter-final / semi-final / final) are also
 * centrally defined deadlines, but WHICH league is at which milestone is
 * decided by the system from the players still standing, never by the organiser
 * and never by a round number.
 *
 * Pure logic: no React, no network.
 */
import type { RoundDeadline } from "./round-deadlines";

/* ------------------------------------------------------------------ *
 * Stages
 * ------------------------------------------------------------------ */

export type StageKey = "early" | "quarter_final" | "semi_final" | "final" | "third_place";

export type MilestoneKey = Exclude<StageKey, "early">;

export const MILESTONE_KEYS: MilestoneKey[] = ["quarter_final", "semi_final", "final"];

/** Championship deadlines, keyed by stage. */
export type MilestonePlayBy = Partial<Record<MilestoneKey, string | null>>;

const STAGE_NAMES: Record<StageKey, string> = {
  early: "Round",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  final: "Final",
  third_place: "Third-place play-off",
};

/**
 * The stage a LEAGUE is at, from how many of its players are still standing.
 *
 * This counts survivors across the whole league — every pool plus the
 * cross-pool bracket — so uneven pools and byes take care of themselves. Three
 * pools with 1, 1 and 2 players left is four alive: a league semi-final, even
 * though no single pool is at a semi-final.
 */
export function stageForAlive(alive: number): StageKey {
  const n = Number(alive) || 0;
  if (n <= 2) return "final";
  if (n <= 4) return "semi_final";
  if (n <= 8) return "quarter_final";
  return "early";
}

export function isMilestone(stage: StageKey): stage is MilestoneKey {
  return stage !== "early";
}

/** Display name for a stage. Early rounds carry their round number. */
export function stageName(stage: StageKey, roundNumber?: number): string {
  if (stage === "early") return `Round ${Math.max(1, Number(roundNumber) || 1)}`;
  return STAGE_NAMES[stage];
}

/**
 * The name a player should see, e.g. "2nd League Semi-final".
 *
 * A round is only ever called "Final" when winning it makes that player the
 * league champion, so a pool's last match while another pool still runs is a
 * semi-final of the league — never "Section A Final".
 */
export function leagueStageName(
  stage: StageKey,
  opts: { roundNumber?: number; leagueLabel?: string | null; sectionLabel?: string | null } = {},
): string {
  const base = stageName(stage, opts.roundNumber);
  const league = String(opts.leagueLabel || "").trim();
  const section = String(opts.sectionLabel || "").trim();
  // Section letters are only ever a secondary tag on an early round; they must
  // never turn into a competing championship name.
  const tail = stage === "early" && section ? `${base} · ${section}` : base;
  return league ? `${league} ${tail}` : tail;
}

/* ------------------------------------------------------------------ *
 * Definitions
 * ------------------------------------------------------------------ */

export type RoundDefinition = {
  /** Round number, 1-based. Unique within a tournament. */
  round: number;
  label: string;
  /** yyyy-mm-dd, or null when the organiser has not set it yet. */
  play_by: string | null;
  notes?: string | null;
};

const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

export const asDate = (v: unknown): string | null => (isDate(v) ? v.slice(0, 10) : null);

/** Tolerant parse: canonical rows, the legacy deadline list, or a bare date. */
export function parseRoundDefinitions(value: unknown): RoundDefinition[] {
  if (!value) return [];
  if (isDate(value)) return [{ round: 1, label: "Round 1", play_by: asDate(value) }];
  if (Array.isArray(value)) {
    const out: RoundDefinition[] = [];
    value.forEach((raw, i) => {
      if (isDate(raw)) {
        out.push({ round: i + 1, label: `Round ${i + 1}`, play_by: asDate(raw) });
        return;
      }
      if (!raw || typeof raw !== "object") return;
      const row = raw as Record<string, unknown>;
      const round = Number(row.round ?? row.round_number ?? i + 1) || i + 1;
      out.push({
        round,
        label: String(row.label || `Round ${round}`).trim() || `Round ${round}`,
        play_by: asDate(row.play_by ?? row.date),
        notes: typeof row.notes === "string" && row.notes.trim() ? row.notes : null,
      });
    });
    return dedupeDefinitions(out);
  }
  if (typeof value === "object") {
    const out: RoundDefinition[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const round = Number(k);
      if (!Number.isFinite(round) || round < 1) continue;
      out.push({ round, label: `Round ${round}`, play_by: asDate(v) });
    }
    return dedupeDefinitions(out);
  }
  return [];
}

/** One row per round number, ascending; the first entry for a round wins. */
export function dedupeDefinitions(list: RoundDefinition[]): RoundDefinition[] {
  const byRound = new Map<number, RoundDefinition>();
  for (const d of list) {
    const round = Number(d.round) || 0;
    if (round < 1 || byRound.has(round)) continue;
    byRound.set(round, { ...d, round });
  }
  return Array.from(byRound.values()).sort((a, b) => a.round - b.round);
}

export function serializeRoundDefinitions(list: RoundDefinition[]): RoundDefinition[] {
  return dedupeDefinitions(list).map((d) => ({
    round: d.round,
    label: d.label,
    play_by: d.play_by ?? null,
    ...(d.notes ? { notes: d.notes } : {}),
  }));
}

/** Migrate the old positional `round_play_by` list into central definitions. */
export function fromLegacyDeadlines(list: RoundDeadline[]): RoundDefinition[] {
  return dedupeDefinitions(
    (list || []).map((d, i) => ({
      round: i + 1,
      label: String(d.label || `Round ${i + 1}`).trim() || `Round ${i + 1}`,
      play_by: asDate(d.date),
      notes: d.notes ?? null,
    })),
  );
}

export function definitionFor(defs: RoundDefinition[], round: number): RoundDefinition | null {
  return defs.find((d) => Number(d.round) === Number(round)) ?? null;
}

export function hasDefinition(defs: RoundDefinition[], round: number): boolean {
  return !!definitionFor(defs, round);
}

export function maxDefinedRound(defs: RoundDefinition[]): number {
  return defs.reduce((max, d) => Math.max(max, Number(d.round) || 0), 0);
}

/** Add a round, or leave the list untouched when that round already exists. */
export function addRoundDefinition(
  defs: RoundDefinition[],
  round: number,
  patch: Partial<Omit<RoundDefinition, "round">> = {},
): RoundDefinition[] {
  if (hasDefinition(defs, round)) return defs;
  return dedupeDefinitions([
    ...defs,
    {
      round,
      label: String(patch.label || `Round ${round}`).trim() || `Round ${round}`,
      play_by: asDate(patch.play_by) ?? null,
      notes: patch.notes ?? null,
    },
  ]);
}

/** The next round after the highest one defined. */
export function appendRoundDefinition(
  defs: RoundDefinition[],
  patch: Partial<Omit<RoundDefinition, "round">> = {},
): RoundDefinition[] {
  return addRoundDefinition(defs, maxDefinedRound(defs) + 1, patch);
}

export function patchRoundDefinition(
  defs: RoundDefinition[],
  round: number,
  patch: Partial<Omit<RoundDefinition, "round">>,
): RoundDefinition[] {
  const withRound = addRoundDefinition(defs, round);
  return withRound.map((d) =>
    Number(d.round) === Number(round)
      ? {
          ...d,
          ...(patch.label !== undefined ? { label: String(patch.label) } : {}),
          ...(patch.play_by !== undefined ? { play_by: asDate(patch.play_by) } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        }
      : d,
  );
}

export function removeRoundDefinition(defs: RoundDefinition[], round: number): RoundDefinition[] {
  return defs.filter((d) => Number(d.round) !== Number(round));
}

/** Organiser-facing validation of the central list. [] = ok. */
export function validateRoundDefinitions(defs: RoundDefinition[]): string[] {
  const problems: string[] = [];
  const rounds = defs.map((d) => Number(d.round));
  if (new Set(rounds).size !== rounds.length) problems.push("Each round may only be listed once.");
  const sorted = [...defs].sort((a, b) => a.round - b.round);
  sorted.forEach((d, i) => {
    if (Number(d.round) !== i + 1) problems.push("Rounds must be numbered consecutively from 1.");
  });
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].play_by;
    const cur = sorted[i].play_by;
    if (prev && cur && cur < prev) {
      problems.push(`${sorted[i].label} is due before ${sorted[i - 1].label}.`);
    }
  }
  if (!defs.some((d) => d.play_by)) problems.push("Give at least the first round a play-by date.");
  return Array.from(new Set(problems));
}

/* ------------------------------------------------------------------ *
 * Milestones
 * ------------------------------------------------------------------ */

export function parseMilestones(value: unknown): MilestonePlayBy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const out: MilestonePlayBy = {};
  for (const key of [...MILESTONE_KEYS, "third_place" as MilestoneKey]) {
    const d = asDate(row[key]);
    if (d) out[key] = d;
  }
  return out;
}

export function milestoneFor(milestones: MilestonePlayBy, stage: StageKey): string | null {
  if (stage === "early") return null;
  return asDate(milestones?.[stage]) ?? null;
}

/** Validation for the milestone block. [] = ok. */
export function validateMilestones(m: MilestonePlayBy, opts: { require?: boolean } = {}): string[] {
  const problems: string[] = [];
  if (opts.require) {
    for (const key of MILESTONE_KEYS) {
      if (!asDate(m?.[key])) problems.push(`Set the ${stageName(key).toLowerCase()} play-by date.`);
    }
  }
  const q = asDate(m?.quarter_final);
  const s = asDate(m?.semi_final);
  const f = asDate(m?.final);
  if (q && s && s < q) problems.push("The semi-final is due before the quarter-final.");
  if (s && f && f < s) problems.push("The final is due before the semi-final.");
  if (q && f && f < q) problems.push("The final is due before the quarter-final.");
  return problems;
}

/* ------------------------------------------------------------------ *
 * Resolution — ONE rule, used everywhere
 * ------------------------------------------------------------------ */

export type PlayBySource =
  | "match_override"
  | "round_override"
  | "milestone"
  | "definition"
  | "none";

export type ResolvedPlayBy = {
  date: string | null;
  source: PlayBySource;
  stage: StageKey;
  /** Human sentence for the admin UI, e.g. "Championship milestone". */
  sourceLabel: string;
};

const SOURCE_LABELS: Record<PlayBySource, string> = {
  match_override: "Fixture exception",
  round_override: "League override",
  milestone: "Championship milestone",
  definition: "Central tournament round",
  none: "No date set",
};

/**
 * The effective play-by date for a fixture/round.
 *
 * Order: fixture exception → league override → championship milestone (when
 * the league is actually at that stage) → central round definition.
 */
export function resolvePlayBy(opts: {
  stage: StageKey;
  roundNumber: number;
  definitions?: RoundDefinition[];
  milestones?: MilestonePlayBy;
  /** `club_champs_rounds.play_by` — a deliberate per-league exception. */
  roundOverride?: string | null;
  /** `club_champs_matches.play_by` — a deliberate per-fixture exception. */
  matchOverride?: string | null;
}): ResolvedPlayBy {
  const stage = opts.stage;
  const make = (date: string | null, source: PlayBySource): ResolvedPlayBy => ({
    date,
    source,
    stage,
    sourceLabel: SOURCE_LABELS[source],
  });

  const match = asDate(opts.matchOverride);
  if (match) return make(match, "match_override");
  const round = asDate(opts.roundOverride);
  if (round) return make(round, "round_override");
  const milestone = milestoneFor(opts.milestones || {}, stage);
  if (milestone) return make(milestone, "milestone");
  const def = definitionFor(opts.definitions || [], opts.roundNumber);
  const date = asDate(def?.play_by);
  if (date) return make(date, "definition");
  return make(null, "none");
}

/* ------------------------------------------------------------------ *
 * Progressing one league
 * ------------------------------------------------------------------ */

export type NextRoundReference = {
  roundNumber: number;
  stage: StageKey;
  /** How many players contest this round. */
  alive: number;
  /** The centrally defined round backing it (null for a milestone stage). */
  definition: RoundDefinition | null;
  playBy: string | null;
  source: PlayBySource;
  sourceLabel: string;
  /** Name shown to admins and players. */
  label: string;
  /** Nothing central covers this round yet — the organiser must add it. */
  needsDefinition: boolean;
  /** Sentence for the progress button / dialog. */
  headline: string;
};

/**
 * What progressing THIS league would do — referencing the central definitions
 * rather than inventing a round or a date.
 *
 * When the league needs an early round the tournament has not defined yet,
 * `needsDefinition` is true and the caller must send the organiser to the one
 * central editor instead of quietly creating a second definition.
 */
export function nextRoundReference(opts: {
  alive: number;
  roundNumber: number;
  definitions?: RoundDefinition[];
  milestones?: MilestonePlayBy;
  roundOverride?: string | null;
  leagueLabel?: string | null;
}): NextRoundReference {
  const alive = Math.max(0, Number(opts.alive) || 0);
  const stage = stageForAlive(alive);
  const definition = stage === "early" ? definitionFor(opts.definitions || [], opts.roundNumber) : null;
  const resolved = resolvePlayBy({
    stage,
    roundNumber: opts.roundNumber,
    definitions: opts.definitions,
    milestones: opts.milestones,
    roundOverride: opts.roundOverride,
  });
  const label = leagueStageName(stage, {
    roundNumber: opts.roundNumber,
    leagueLabel: opts.leagueLabel,
  });
  const needsDefinition = stage === "early" && !definition;
  const dated = resolved.date ? ` — play by ${resolved.date}` : "";
  const headline = needsDefinition
    ? `Round ${opts.roundNumber} is not defined for this tournament yet.`
    : `Progress ${String(opts.leagueLabel || "this league").trim()} to ${
        stage === "early" ? `Round ${opts.roundNumber}` : stageName(stage)
      }${dated}.`;

  return {
    roundNumber: opts.roundNumber,
    stage,
    alive,
    definition,
    playBy: resolved.date,
    source: resolved.source,
    sourceLabel: resolved.sourceLabel,
    label: definition?.label?.trim() || label,
    needsDefinition,
    headline,
  };
}

/* ------------------------------------------------------------------ *
 * Editing a central date safely
 * ------------------------------------------------------------------ */

export type FixtureLike = {
  round_number?: number | null;
  status?: string | null;
  scheduled_date?: string | null;
  court_id?: number | string | null;
  booking_id?: string | null;
  play_by?: string | null;
};

const SETTLED = new Set(["completed", "complete", "walkover", "forfeit", "cancelled"]);

export type CentralDateImpact = {
  /** Unplayed fixtures whose date would move. */
  affected: number;
  /** Completed/booked fixtures that are left exactly as they are. */
  protected: number;
  summary: string;
};

/**
 * What changing a central round date would touch. Completed fixtures are never
 * moved and never relabelled — history stays intact.
 */
export function centralDateImpact(
  fixtures: FixtureLike[],
  roundNumber: number,
): CentralDateImpact {
  const rows = (fixtures || []).filter((f) => Number(f.round_number) === Number(roundNumber));
  let affected = 0;
  let locked = 0;
  for (const f of rows) {
    const settled = SETTLED.has(String(f.status || "").toLowerCase());
    const booked = !!f.booking_id || !!f.court_id;
    if (settled || booked) locked += 1;
    else affected += 1;
  }
  const parts = [`${affected} fixture${affected === 1 ? "" : "s"} would move`];
  if (locked > 0) parts.push(`${locked} already played or booked stay unchanged`);
  return { affected, protected: locked, summary: parts.join(" · ") };
}
