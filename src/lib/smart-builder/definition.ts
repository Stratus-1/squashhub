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
  /** Knockout matchups for seeded playoffs, e.g. "1v4,2v3". */
  seededMatchups: z.string().nullable().optional(),
  /** Minimum matches each entrant should get in this stage. */
  minMatches: z.number().int().min(0).nullable().optional(),
  /** Resolves only after registration closes (draw size, byes, bands). */
  dynamic: z.boolean().optional(),
  loserBehaviour: z.enum(["eliminated", "plate", "placement"]).optional(),
  notes: z.string().optional(),
  schedule: ScheduleSchema.default({ mode: "unset" }),
});
export type Stage = z.infer<typeof StageSchema>;

const SectionSchema = z.object({ id: z.string(), name: z.string(), stages: z.array(StageSchema).default([]) });
export type Section = z.infer<typeof SectionSchema>;

const DivisionSchema = z.object({
  id: z.string(),
  name: z.string(),
  eligibility: z.enum(["men", "ladies", "mixed", "open", "open_any_pair"]).default("open"),
  entry: z.enum(["individual", "pairs"]).default("individual"),
  sections: z.array(SectionSchema).default([]),
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

export const DefinitionSchema = z.object({
  version: z.literal(1).default(1),
  name: z.string().default("Untitled tournament"),
  ownerKind: z.enum(["club", "association", "federation"]).default("federation"),
  category: z.enum(["championship", "closed", "open", "invitational"]).default("open"),
  /** Separate from category, as in the existing model. */
  rankingEvent: z.boolean().default(false),
  registrationClosesAt: z.string().nullable().optional(),
  divisions: z.array(DivisionSchema).default([]),
  understood: z.array(z.string()).default([]),
  questions: z.array(QuestionSchema).default([]),
  notUnderstood: z.array(z.string()).default([]),
});
export type TournamentDefinition = z.infer<typeof DefinitionSchema>;

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
