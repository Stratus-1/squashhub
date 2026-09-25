/**
 * Smart Tournament Builder — Tournament Definition (BETA).
 *
 * A generic, composable description of a tournament:
 *   Tournament → Division → Section → Stage[] (a flow).
 * Stages feed each other through `input.fromStageId`; transformations (such as
 * "create doubles pairs from previous-stage results") are stages too.
 *
 * This object is the single source of truth for a Smart Builder draft. The AI
 * only proposes a new Definition; the deterministic validator checks it, and
 * only an explicit "Create Tournament" maps it onto the existing engine.
 */
import { z } from "zod";

export const STAGE_KINDS = [
  "round_robin",
  "knockout",
  "swiss",
  "placement",
  "split",
  "pair_from_positions",
  "custom",
  "cross_pool_league",
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const SCHEDULE_MODES = ["unset", "fixed", "play_by", "self_booking", "admin"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

const ScheduleSchema = z.object({
  mode: z.enum(SCHEDULE_MODES).default("unset"),
  /** Fixed date, or start of a play-by / booking window (YYYY-MM-DD). */
  startDate: z.string().nullable().optional(),
  /** Play-by date / end of window. */
  endDate: z.string().nullable().optional(),
  /** Optional per-round dates (round robin / knockout rounds). */
  roundDates: z.array(z.string()).optional(),
  /** Deliberate per-round overrides (round index → date). Everything else is generated from the recurrence. */
  roundDateOverrides: z.record(z.string()).optional(),
  /** 0=Sun … 6=Sat for recurring evenings (e.g. every Thursday). */
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  /** Venue club ids (existing clubs). Names are kept for display when ids are unknown. */
  venueClubIds: z.array(z.string()).optional(),
  venueNames: z.array(z.string()).optional(),
  rotateVenues: z.boolean().optional(),
  /** Planning inputs for capacity checks. */
  courtsPerVenue: z.number().int().min(0).nullable().optional(),
  sessionMinutes: z.number().int().min(0).nullable().optional(),
  matchMinutes: z.number().int().min(0).nullable().optional(),
});
export type StageSchedule = z.infer<typeof ScheduleSchema>;

const StageSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(STAGE_KINDS),
  discipline: z.enum(["singles", "doubles"]).default("singles"),
  /** Number of pools / draws / levels this stage runs in parallel. */
  groups: z.number().int().min(1).default(1),
  /** Entrants per group (round robin pool size, knockout draw size). null = dynamic. */
  groupSize: z.number().int().min(1).nullable().optional(),
  input: z.object({
    /** "entrants" = registrations; otherwise the stage it draws from. */
    fromStageId: z.string().nullable().optional(),
    /** Direct entry count for the first stage (null = unknown until registration closes). */
    entrants: z.number().int().min(0).nullable().optional(),
    /** How units from the previous stage are arranged: per level across groups, or combined. */
    arrangement: z.enum(["combined", "by_level_across_groups", "same_group"]).optional(),
  }).default({}),
  /** What leaves this stage. */
  advance: z.object({
    perGroup: z.number().int().min(0).nullable().optional(),
    /** qualify = a subset advances; seed = everyone advances, standings decide seeding. */
    role: z.enum(["qualify", "seed", "none"]).default("qualify"),
    /** Specific finishing positions (1-based), overrides perGroup when set. */
    positions: z.array(z.number().int().min(1)).optional(),
  }).default({ role: "none" }),
  /** For pair_from_positions: [[1,2],[3,4],[5,6]] → level 1, 2, 3. */
  pairing: z.array(z.array(z.number().int().min(1)).length(2)).optional(),
  /** Seeding / strength bands feeding this stage (not separate competitions). */
  seedingBands: z.array(z.string()).optional(),
  /** Split competitions (Championship / Plate / Shield) by finishing positions. */
  splits: z.array(z.object({ name: z.string(), fromPosition: z.number().int(), toPosition: z.number().int() })).optional(),
  swissRounds: z.number().int().min(1).nullable().optional(),
  /** Swiss tie-breaks after wins, in order. */
  tieBreaks: z.array(z.enum(["buchholz", "sonneborn_berger", "seed"])).optional(),
  /** Round robin: 1 = once, 2 = everyone plays everyone twice. */
  legs: z.union([z.literal(1), z.literal(2)]).optional(),
  /** Later stages: how entrants arrive from the previous stage (separate from format and grouping). */
  progression: z.object({
    mode: z.enum(["qualifiers", "all_continue", "top_n", "form_pairs"]),
    standings: z.enum(["carry", "reset"]).nullable().optional(),
    /** Only when the match type changes: fold / positions / manual (singles→doubles) or split (doubles→singles). */
    pairing: z.enum(["fold", "positions", "manual", "split"]).nullable().optional(),
    /** top_n: how many continue. */
    top: z.number().int().min(1).nullable().optional(),
    /** top_n from a pooled stage: top N of EACH pool (slots = pool index + position). */
    perPool: z.boolean().optional(),
  }).nullable().optional(),
  /** Knockout: add a 3rd/4th place match. */
  thirdPlace: z.boolean().optional(),
  /** Playoff stages: how qualifiers are placed into the bracket (never inferred). */
  qualifierMapping: z.enum(["cross_pool", "reseed", "same_pool"]).nullable().optional(),
  /** Playoff stages: the explicit pool→next-stage progression rule. Stable pool INDEXES and positions only — never pool names. */
  qualifierTransition: z.object({
    positions: z.array(z.number().int().min(1)).default([1, 2]),
    sourcePoolIndexes: z.array(z.number().int().min(0)).nullable().optional(),
    method: z.enum(["cross_pool", "reseed", "manual"]).default("cross_pool"),
    poolPairs: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).optional(),
    pairing: z.enum(["winner_runner_up", "same_position"]).optional(),
    manualSlots: z.array(z.tuple([
      z.object({ poolIndex: z.number().int().min(0), position: z.number().int().min(1) }).nullable(),
      z.object({ poolIndex: z.number().int().min(0), position: z.number().int().min(1) }).nullable(),
    ])).optional(),
    reseedBy: z.enum(["pool_position", "seed"]).optional(),
  }).nullable().optional(),
  /** Playoff stages: generate automatically once prerequisites finish, or only after the owner previews and confirms. */
  generation: z.enum(["automatic", "owner_approval"]).nullable().optional(),
  /** Playoff stages: courts/times allocated automatically or by the owner. */
  playoffScheduling: z.enum(["automatic", "owner"]).nullable().optional(),
  /** Knockout matchups for seeded playoffs, e.g. "1v4,2v3". */
  seededMatchups: z.string().nullable().optional(),
  /** Minimum matches each entrant should get in this stage. */
  minMatches: z.number().int().min(0).nullable().optional(),
  /** Resolves only after registration closes (draw size, byes, bands). */
  dynamic: z.boolean().optional(),
  loserBehaviour: z.enum(["eliminated", "plate", "placement"]).optional(),
  notes: z.string().optional(),
  schedule: ScheduleSchema.default({ mode: "unset" }),
  /** Per-stage scoring overrides; unset fields inherit the tournament scoring. */
  scoring: z.lazy(() => ScoringSchema).optional(),
  /**
   * Compound fixture: one pool-v-pool (team-v-team) TIE on one court, one evening, made of
   * ordered rubbers of different disciplines and slot lengths. The tie is the scheduling unit;
   * rubbers are never scheduled independently of their tie.
   */
  tieFormat: z.object({
    rubbers: z.array(z.object({
      discipline: z.enum(["singles", "doubles"]),
      /** Pool positions per side: [1] = #1 v #1; [1,2] = pair of positions 1+2 v 1+2. */
      positions: z.array(z.number().int().min(1)).min(1).max(2),
      minutes: z.number().int().min(1),
    })).min(1),
    sameCourt: z.boolean().default(true),
    /** Evening start (HH:MM). Instance setting. */
    startTime: z.string().nullable().optional(),
  }).optional(),
  /**
   * Explicit "same session" link: this stage is played in the SAME session (date, courts)
   * as the named earlier stage, straight after it. Unset = normal later-date progression.
   */
  sameSessionAs: z.string().nullable().optional(),
});
export type Stage = z.infer<typeof StageSchema>;

const SectionSchema = z.object({ id: z.string(), name: z.string(), stages: z.array(StageSchema).default([]) });
export type Section = z.infer<typeof SectionSchema>;

const DivisionSchema = z.object({
  id: z.string(),
  /** Display label only — never drives logic. */
  name: z.string(),
  eligibility: z.enum(["men", "ladies", "mixed", "open", "open_any_pair"]).default("open"),
  entry: z.enum(["individual", "pairs", "teams"]).default("individual"),
  /** How existing league structure is used (see lib/tournaments/hierarchy.ts). null = not yet decided. */
  leagueUse: z.enum(["division_allocation", "pool_seeding", "team_allocation", "ignore", "manual"]).nullable().optional(),
  /** Source league ids when leagueUse = division_allocation. */
  leagueSourceIds: z.array(z.string()).optional(),
  /** Optional owner labels for pools, by pool index. Labels only. */
  poolLabels: z.array(z.string()).optional(),
  /** Explicit advanced opt-in to differing pool formats inside one stage. */
  allowMixedPoolFormats: z.boolean().optional(),
  sections: z.array(SectionSchema).default([]),
  /** Editable pool names by stable pool index (0 = A). Display only. */
  poolNames: z.array(z.string()).optional(),
  /** Confirmed pool pairings used for home courts and crossover play-offs, by pool index. */
  poolGroups: z.array(z.object({ pools: z.tuple([z.number().int().min(0), z.number().int().min(0)]), court: z.string().nullable().optional() })).optional(),
});
export type Division = z.infer<typeof DivisionSchema>;

const QuestionSchema = z.object({
  id: z.string(),
  term: z.string().optional(),
  question: z.string(),
  options: z.array(z.string()).optional(),
  /** structural questions block Build; operational ones don't. */
  kind: z.enum(["structural", "operational"]).default("structural"),
  resolved: z.boolean().default(false),
  answer: z.string().nullable().optional(),
});
export type OpenQuestion = z.infer<typeof QuestionSchema>;

/** Match scoring. Every field optional; a stage without a value inherits the tournament default. */
const ScoringSchema = z.object({
  /** Bells uses a timed points total, not PAR games. */
  mode: z.enum(["standard", "time_capped_points"]).nullable().optional(),
  pointsPerGame: z.union([z.literal(11), z.literal(15)]).nullable().optional(),
  bestOf: z.union([z.literal(3), z.literal(5)]).nullable().optional(),
  playAllGames: z.boolean().nullable().optional(),
  winCondition: z.enum(["win_by_2", "sudden_death"]).nullable().optional(),
});
export type Scoring = z.infer<typeof ScoringSchema>;

/** Recognise older Bells drafts that were described in words before scoring.mode existed. */
export function isBellsDefinition(def: TournamentDefinition) {
  if (def.scoring?.mode) return def.scoring.mode === "time_capped_points";
  return /\bbells\b/i.test(def.name) || def.divisions.some((div) =>
    div.sections.some((sec) => sec.stages.some((stage) => /\bbells\b/i.test(stage.name))));
}

/** Who plays and how they get in. null = not decided yet. */
const PlayersSchema = z.object({
  entryMethod: z.enum(["self_entry", "selected", "both"]).nullable().optional(),
  audience: z.enum(["all_club", "leagues", "clubs", "individuals"]).nullable().optional(),
  /** Selected players only confirm availability (no open entry form). */
  confirmAvailabilityOnly: z.boolean().nullable().optional(),
  allocation: z.enum(["by_eligibility", "admin_allocates", "by_ranking"]).nullable().optional(),
  seedingSource: z.enum(["ranking", "ladder", "manual", "none"]).nullable().optional(),
  minEntries: z.number().int().min(0).nullable().optional(),
  maxEntries: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
}).default({});
export type PlayersSettings = z.infer<typeof PlayersSchema>;

export const COMMS_CHANNELS = ["in_app", "email", "whatsapp", "sms"] as const;
export type CommsChannel = (typeof COMMS_CHANNELS)[number];

/** Invitations & communications. Sending is ALWAYS manual unless explicitly set. */
const CommsSchema = z.object({
  inviteSending: z.enum(["manual", "automatic"]).nullable().optional(),
  inviteChannels: z.array(z.enum(COMMS_CHANNELS)).nullable().optional(),
  registrationOpensAt: z.string().nullable().optional(),
  registrationClosesAt: z.string().nullable().optional(),
  inviteMessage: z.string().nullable().optional(),
  reminders: z.enum(["none", "before_close", "before_matches", "both"]).nullable().optional(),
  /** null = fee not decided; 0 = free. */
  entryFeeRands: z.number().min(0).nullable().optional(),
  paymentRequired: z.boolean().nullable().optional(),
  paymentMethods: z.array(z.enum(["card", "eft", "cash", "account"])).nullable().optional(),
  whatsappGroup: z.enum(["yes", "no"]).nullable().optional(),
  whatsappGroupUrl: z.string().nullable().optional(),
  resultNotify: z.enum(["all", "playoffs", "none"]).nullable().optional(),
  resultChannels: z.array(z.enum(COMMS_CHANNELS)).nullable().optional(),
}).default({});
export type CommsSettings = z.infer<typeof CommsSchema>;

/** Tournament-wide scheduling defaults; each stage inherits unless it overrides. */
const ScheduleDefaultsSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  startTime: z.string().nullable().optional(),
  venueClubIds: z.array(z.string()).optional(),
  venueNames: z.array(z.string()).optional(),
  rotateVenues: z.boolean().optional(),
  courtsPerVenue: z.number().int().min(0).nullable().optional(),
  sessionMinutes: z.number().int().min(0).nullable().optional(),
  matchMinutes: z.number().int().min(0).nullable().optional(),
  provisionalBookings: z.boolean().nullable().optional(),
}).default({});
export type ScheduleDefaults = z.infer<typeof ScheduleDefaultsSchema>;

/** Opening steps: scope → audience → seeding coverage → expected entries. */
const EventScopeSchema = z.object({
  scope: z.enum(["club", "regional", "national"]).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  audience: z.enum(["all_members", "league_players", "selected_members", "open_public", "all_clubs", "selected_clubs", "selected_leagues", "selected_regions", "ranked_players", "selected_players"]).nullable().optional(),
  selectedIds: z.array(z.string()).optional(),
  /** Discovered, not invented: eligible count and per-source ranking coverage. */
  eligibleCount: z.number().int().min(0).nullable().optional(),
  coverage: z.record(z.number().int().min(0)).optional(),
  seedingSource: z.enum(["national", "regional", "league_strength", "club_ladder", "match_history", "manual"]).nullable().optional(),
  expectedEntries: z.number().int().min(0).nullable().optional(),
  /** EVENT VENUE(S): where this tournament may be played. Round/fixture court allocation (Schedule) must stay inside this set. */
  venues: z.object({
    mode: z.enum(["single", "multiple"]).nullable().optional(),
    clubIds: z.array(z.string()).default([]),
    /** Display names, same order as clubIds. Labels only. */
    names: z.array(z.string()).default([]),
    /** Selected court IDs per venue club (real `courts` records). Names are never stored. */
    courtIds: z.record(z.array(z.number().int())).optional(),
    /** National events: region filter used to browse clubs (UI only). */
    regionId: z.string().nullable().optional(),
  }).optional(),
  /** Venues that became ineligible after an owner/level change; must be resolved before creation. */
  venuesStale: z.array(z.string()).optional(),
  /** Owner explicitly says no physical venue is needed (e.g. results-only). */
  noVenue: z.boolean().optional(),
}).default({});
export type EventScopeSettings = z.infer<typeof EventScopeSchema>;

export const DefinitionSchema = z.object({
  event: EventScopeSchema,
  version: z.literal(1).default(1),
  /** Fast "I know what I want" setup path = MATCH FORMAT only. Only controls which questions are shown — never the engine.
   *  "pools_playoffs" is legacy (older drafts); it is read as round_robin + pools + play-offs. */
  quickPath: z.enum(["round_robin", "swiss", "knockout", "pools_playoffs", "custom"]).nullable().optional(),
  /** Progressive-disclosure answers for the fast path. Grouping and progression are separate dimensions;
   *  null = not answered yet (next questions stay hidden). The structure itself lives on the stages. */
  quickAnswers: z.object({ pools: z.boolean().nullable().default(null), playoffs: z.boolean().nullable().default(null) }).optional(),
  name: z.string().default("Untitled tournament"),
  /** Final table across a multi-stage tournament: last stage only, or points added up across stages. */
  finalStandings: z.enum(["last_stage", "cumulative"]).optional(),
  ownerKind: z.enum(["club", "association", "federation"]).default("federation"),
  category: z.enum(["championship", "closed", "open", "invitational"]).default("open"),
  /** Separate from category, as in the existing model. */
  rankingEvent: z.boolean().default(false),
  registrationClosesAt: z.string().nullable().optional(),
  divisions: z.array(DivisionSchema).default([]),
  scoring: ScoringSchema.default({}),
  players: PlayersSchema,
  comms: CommsSchema,
  scheduleDefaults: ScheduleDefaultsSchema,
  understood: z.array(z.string()).default([]),
  questions: z.array(QuestionSchema).default([]),
  /** Entry capacity and admission; null = no cap. */
  admission: z.object({
    capacity: z.number().int().min(1).nullable().optional(),
    mode: z.enum(["first_confirmed", "manual"]).default("first_confirmed"),
    waitlist: z.boolean().default(true),
  }).optional(),
  /** Seeding into pools across ALL divisions (e.g. ladder snake over 8 pools). */
  poolSeeding: z.object({ source: z.enum(["ladder", "ranking", "manual"]).default("ladder"), allocation: z.enum(["snake", "banded"]).default("snake"), scope: z.enum(["division", "tournament"]).default("tournament") }).optional(),
  /** Which template this came from and which fields are per-instance settings. */
  templateMeta: z.object({ key: z.string(), name: z.string(), instanceFields: z.array(z.string()).default([]) }).optional(),
  /** Pair source for position-based doubles: seeded order or re-ranked stage standings. null = unresolved. */
  pairSource: z.enum(["seed", "prior_stage_standings"]).nullable().optional(),
  notUnderstood: z.array(z.string()).default([]),
});
export type TournamentDefinition = z.infer<typeof DefinitionSchema>;

/** Effective schedule for a stage: its own values, falling back to tournament defaults. */
export function effectiveSchedule(def: TournamentDefinition, stage: Stage) {
  const s = stage.schedule, d = def.scheduleDefaults ?? {};
  const pick = <K extends keyof StageSchedule & keyof ScheduleDefaults>(k: K) => {
    const own = s[k] as unknown;
    const hasOwn = own !== undefined && own !== null && !(Array.isArray(own) && own.length === 0);
    return { value: (hasOwn ? own : d[k]) as StageSchedule[K], inherited: !hasOwn && d[k] != null && !(Array.isArray(d[k]) && (d[k] as unknown[]).length === 0) };
  };
  return {
    mode: s.mode,
    startDate: pick("startDate"), endDate: pick("endDate"), weekday: pick("weekday"),
    venueNames: pick("venueNames"), courtsPerVenue: pick("courtsPerVenue"),
    sessionMinutes: pick("sessionMinutes"), matchMinutes: pick("matchMinutes"),
    startTime: { value: d.startTime ?? null, inherited: !!d.startTime },
  };
}


export function emptyDefinition(name = "Untitled tournament"): TournamentDefinition {
  return DefinitionSchema.parse({ name });
}

/** Parse untrusted JSON (AI output / stored draft) into a Definition. */
export function parseDefinition(raw: unknown): { ok: true; value: TournamentDefinition } | { ok: false; error: string } {
  const r = DefinitionSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

let seq = 0;
export function newId(prefix: string) {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`;
}

export function newStage(kind: StageKind, name?: string): Stage {
  return StageSchema.parse({
    id: newId("stage"),
    name: name || STAGE_LABELS[kind],
    kind,
    groups: 1,
    groupSize: kind === "knockout" ? 8 : kind === "round_robin" ? 4 : null,
    input: {},
    advance: { role: "none" },
  });
}

export const STAGE_LABELS: Record<StageKind, string> = {
  round_robin: "Round robin",
  knockout: "Knockout",
  swiss: "Swiss",
  placement: "Placement matches",
  split: "Split (Championship / Plate)",
  pair_from_positions: "Create doubles pairs from results",
  custom: "Custom stage",
  cross_pool_league: "Pool-v-pool ties (same positions meet)",
};

/** All stages with their division/section context, in flow order. */
export function allStages(def: TournamentDefinition) {
  const out: { division: Division; section: Section; stage: Stage; index: number }[] = [];
  def.divisions.forEach((division) =>
    division.sections.forEach((section) =>
      section.stages.forEach((stage, index) => out.push({ division, section, stage, index })),
    ),
  );
  return out;
}

/** Knockout round names use the stage/league label, never a pool name. */
export function knockoutRoundNames(drawSize: number, label?: string): string[] {
  const names: string[] = [];
  let size = 1;
  while (size < drawSize) size *= 2;
  for (let n = size; n >= 2; n /= 2) {
    const base = n === 2 ? "Final" : n === 4 ? "Semi Final" : n === 8 ? "Quarter Final" : `Round of ${n}`;
    names.push(label ? `${label} ${base}` : base);
  }
  return names;
}

export function isAdjacentPairing(pairing?: number[][]) {
  return !!pairing && pairing.length > 0 && pairing.every((p, i) => p[0] === i * 2 + 1 && p[1] === i * 2 + 2);
}
