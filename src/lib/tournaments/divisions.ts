/**
 * Competition divisions ("League 1", "League 2", …) inside one tournament.
 *
 * Organiser model:
 *  - A tournament holds one or more competition divisions.
 *  - Each division owns its own format, its own pools and its own winner.
 *  - Pools are groups WITHIN a division. A division may run pools and then
 *    progress into its own knockout.
 *  - "Sections" is legacy implementation wording for the same idea on knockout
 *    divisions: a knockout split into N independent sub-draws. Legacy data is
 *    preserved and mapped onto the pool count so the organiser only ever sees
 *    "pools".
 *
 * Nothing here touches the database — these are pure helpers so the wizard, the
 * capacity engine and the tests all agree.
 */

export type DivisionSourceMode = "all" | "selected" | "combined";

export interface DivisionSource {
  /**
   * all       — every club league feeds this division (or an equivalent
   *             structure is applied per league; players are NOT merged
   *             silently into one draw).
   * selected  — only the listed club leagues feed this division.
   * combined  — the listed leagues are deliberately mixed into ONE draw.
   */
  mode: DivisionSourceMode;
  leagueIds: string[];
}

export const DEFAULT_DIVISION_SOURCE: DivisionSource = { mode: "all", leagueIds: [] };

type RawMap = Record<string, unknown> | null | undefined;

export interface LeagueRef {
  id: string;
  name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A stable league identifier (as opposed to a legacy display name). */
export function isLeagueId(value: string): boolean {
  return UUID_RE.test(String(value || "").trim());
}

export interface LeagueRefResolution {
  /** Stable league ids, de-duplicated, in the original order. */
  leagueIds: string[];
  /** Names that matched no league at all. */
  unknown: string[];
  /** Names that matched more than one league — never guessed. */
  ambiguous: string[];
}

/**
 * Compatibility layer for divisions saved before league sources were stored by
 * id. Anything that already looks like an id is kept untouched; a legacy
 * display name is resolved ONLY when exactly one club league carries that name.
 * Duplicate names are reported as ambiguous and deliberately left unmapped —
 * we never silently attach a division to the wrong league.
 */
export function resolveLeagueRefs(raw: string[], leagues: LeagueRef[]): LeagueRefResolution {
  const byId = new Set(leagues.map((l) => l.id));
  const byName = new Map<string, string[]>();
  leagues.forEach((l) => {
    const key = String(l.name || "").trim().toLowerCase();
    if (!key) return;
    byName.set(key, [...(byName.get(key) || []), l.id]);
  });

  const leagueIds: string[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  const seen = new Set<string>();
  raw.forEach((ref) => {
    const value = String(ref || "").trim();
    if (!value) return;
    if (isLeagueId(value) || byId.has(value)) {
      if (!seen.has(value)) { seen.add(value); leagueIds.push(value); }
      return;
    }
    const matches = byName.get(value.toLowerCase()) || [];
    if (matches.length === 1) {
      if (!seen.has(matches[0])) { seen.add(matches[0]); leagueIds.push(matches[0]); }
    } else if (matches.length > 1) {
      ambiguous.push(value);
    } else {
      unknown.push(value);
    }
  });
  return { leagueIds, unknown, ambiguous };
}

export interface DivisionSourceResolution {
  sources: Record<string, DivisionSource>;
  /** Division key → refs that could not be mapped to a stable league id. */
  unresolved: Record<string, string[]>;
  changed: boolean;
}

/**
 * Re-point every division's source onto stable league ids once the club's
 * league list is known. A division whose refs cannot be resolved falls back to
 * "all leagues" (unrestricted) so existing entrants are never dropped.
 */
export function resolveDivisionSources(
  sources: Record<string, DivisionSource>,
  leagues: LeagueRef[],
): DivisionSourceResolution {
  const out: Record<string, DivisionSource> = {};
  const unresolved: Record<string, string[]> = {};
  let changed = false;
  Object.entries(sources || {}).forEach(([key, src]) => {
    const res = resolveLeagueRefs(src.leagueIds || [], leagues);
    const leftover = [...res.unknown, ...res.ambiguous];
    if (leftover.length > 0) unresolved[key] = leftover;
    const mode: DivisionSourceMode = res.leagueIds.length === 0 ? "all" : src.mode;
    if (res.leagueIds.join("|") !== (src.leagueIds || []).join("|") || mode !== src.mode) changed = true;
    out[key] = { mode, leagueIds: res.leagueIds };
  });
  return { sources: out, unresolved, changed };
}

/**
 * Parse the persisted `league_sources` / `league_source_modes` jsonb pair.
 * When the club's leagues are supplied, legacy name-based refs are resolved to
 * stable ids (uniquely matching names only).
 */
export function parseDivisionSources(
  sources: RawMap,
  modes: RawMap,
  leagues?: LeagueRef[],
): Record<string, DivisionSource> {
  const out: Record<string, DivisionSource> = {};
  const keys = new Set<string>([...Object.keys(sources || {}), ...Object.keys(modes || {})]);
  keys.forEach((k) => {
    const rawIds = (sources || {})[k];
    let leagueIds = Array.isArray(rawIds) ? rawIds.filter((v): v is string => typeof v === "string") : [];
    if (leagues && leagues.length > 0) leagueIds = resolveLeagueRefs(leagueIds, leagues).leagueIds;
    const rawMode = (modes || {})[k];
    let mode: DivisionSourceMode =
      rawMode === "all" || rawMode === "selected" || rawMode === "combined" ? rawMode : "selected";
    if (leagueIds.length === 0) mode = "all";
    out[k] = { mode, leagueIds };
  });
  return out;
}


export function divisionSource(map: Record<string, DivisionSource>, gn: number): DivisionSource {
  return map[String(gn)] ?? DEFAULT_DIVISION_SOURCE;
}

/** Plain-language summary for the division card. */
export function describeDivisionSource(src: DivisionSource, names: Map<string, string>): string {
  if (src.mode === "all" || src.leagueIds.length === 0) return "All leagues";
  const labels = src.leagueIds.map((id) => names.get(id) || "League");
  const list = labels.length <= 2 ? labels.join(" + ") : `${labels.slice(0, 2).join(" + ")} +${labels.length - 2}`;
  return src.mode === "combined" ? `${list} (combined draw)` : list;
}

/**
 * The eligible player population for a division.
 *
 * `registrationsByLeague` maps club league id → member ids registered in it.
 * `allLeagueIds` is the club's full league list, used for the "all" mode.
 * The result is de-duplicated and stable in the order the leagues were given.
 */
export function resolveDivisionCandidates(args: {
  source: DivisionSource;
  allLeagueIds: string[];
  registrationsByLeague: Map<string, string[]>;
}): string[] {
  const { source, allLeagueIds, registrationsByLeague } = args;
  const leagueIds = source.mode === "all" || source.leagueIds.length === 0 ? allLeagueIds : source.leagueIds;
  const seen = new Set<string>();
  const out: string[] = [];
  leagueIds.forEach((lid) => {
    (registrationsByLeague.get(lid) || []).forEach((mid) => {
      if (!mid || seen.has(mid)) return;
      seen.add(mid);
      out.push(mid);
    });
  });
  return out;
}

/**
 * Constrain a seeding order (e.g. ladder order) to a division's eligible
 * population. Seeding logic itself is unchanged — only the candidate set is
 * narrowed.
 */
export function constrainSeeds<T extends { member_id: string }>(seeds: T[], candidates: string[]): T[] {
  const allowed = new Set(candidates);
  return seeds.filter((s) => allowed.has(s.member_id));
}

/** Same constraint, for the plain id lists used by the draw builders. */
export function constrainIds(ids: string[], candidates: string[], overrides?: Iterable<string>): string[] {
  const allowed = new Set(candidates);
  const ok = new Set(overrides || []);
  return ids.filter((id) => allowed.has(id) || ok.has(id));
}

export interface EligibilityContext {
  sources: Record<string, DivisionSource>;
  allLeagueIds: string[];
  registrationsByLeague: Map<string, string[]>;
  /** Ids the admin has explicitly kept in a division despite not qualifying. */
  overrides?: Set<string>;
}

/** Eligible member ids for one division ("Players from"). */
export function divisionEligibleIds(gn: number, ctx: EligibilityContext): string[] {
  return resolveDivisionCandidates({
    source: divisionSource(ctx.sources, gn),
    allLeagueIds: ctx.allLeagueIds,
    registrationsByLeague: ctx.registrationsByLeague,
  });
}

/**
 * Is this player allowed in the division?
 *
 * A division on "all leagues" accepts anyone (including guests/visitors that
 * have no league registration at all) — the source is not a restriction there.
 * A restricted division only accepts members registered in its source leagues,
 * unless the admin has explicitly overridden that entry.
 */
export function isEligibleForDivision(memberId: string, gn: number, ctx: EligibilityContext): boolean {
  const src = divisionSource(ctx.sources, gn);
  if (src.mode === "all" || src.leagueIds.length === 0) return true;
  if (ctx.overrides?.has(memberId)) return true;
  return divisionEligibleIds(gn, ctx).includes(memberId);
}

export interface IneligibleAssignment {
  memberId: string;
  gn: number;
}

/**
 * Players assigned to a division they do not belong to — whether they were
 * auto-loaded, added by hand or moved after the source changed. This makes the
 * source selection an invariant of the division, not a one-off load filter.
 */
export function findIneligibleAssignments(
  assignments: Map<string, number> | Array<[string, number]>,
  ctx: EligibilityContext,
): IneligibleAssignment[] {
  const entries = Array.isArray(assignments) ? assignments : Array.from(assignments.entries());
  const cache = new Map<number, Set<string>>();
  const out: IneligibleAssignment[] = [];
  entries.forEach(([memberId, gn]) => {
    const src = divisionSource(ctx.sources, gn);
    if (src.mode === "all" || src.leagueIds.length === 0) return;
    if (ctx.overrides?.has(memberId)) return;
    if (!cache.has(gn)) cache.set(gn, new Set(divisionEligibleIds(gn, ctx)));
    if (!cache.get(gn)!.has(memberId)) out.push({ memberId, gn });
  });
  return out;
}

/** Club leagues (by stable id) a member is actually registered in. */
export function memberLeagueIds(memberId: string, registrationsByLeague: Map<string, string[]>): string[] {
  const out: string[] = [];
  registrationsByLeague.forEach((members, leagueId) => {
    if (members.includes(memberId)) out.push(leagueId);
  });
  return out;
}

export interface IneligibleExplanation extends IneligibleAssignment {
  /** Leagues the player really belongs to (stable ids). */
  memberLeagueIds: string[];
  /** Leagues the division draws from (stable ids). */
  sourceLeagueIds: string[];
}

/**
 * Same invariant as `findIneligibleAssignments`, but carrying the evidence so
 * the UI can state the player's REAL league membership instead of repeating
 * the division's display label.
 */
export function explainIneligibleAssignments(
  assignments: Map<string, number> | Array<[string, number]>,
  ctx: EligibilityContext,
): IneligibleExplanation[] {
  return findIneligibleAssignments(assignments, ctx).map(({ memberId, gn }) => ({
    memberId,
    gn,
    memberLeagueIds: memberLeagueIds(memberId, ctx.registrationsByLeague),
    sourceLeagueIds: divisionSource(ctx.sources, gn).leagueIds,
  }));
}



/* ------------------------------------------------- all-leagues expansion */

export interface ExpansionPlanItem {
  gn: number;
  leagueId: string;
  label: string;
  /** Division the template settings should be cloned from. */
  templateGn: number;
  isNew: boolean;
}

export interface ExpansionPlan {
  items: ExpansionPlanItem[];
  created: ExpansionPlanItem[];
  skipped: Array<{ leagueId: string; gn: number }>;
  divisionCount: number;
}

/**
 * "All leagues" means one independent competition per source league — NOT one
 * merged draw. This plans that expansion: every active source league that is
 * not already the source of a division gets its own division appended, cloning
 * the template division's settings. Re-running is idempotent: leagues already
 * covered are skipped, manual divisions are untouched.
 */
export function planAllLeaguesExpansion(args: {
  templateGn: number;
  divisionCount: number;
  sources: Record<string, DivisionSource>;
  leagues: Array<{ id: string; name: string }>;
  labels?: Record<string, string>;
}): ExpansionPlan {
  const { templateGn, sources, leagues } = args;
  const divisionCount = Math.max(0, Math.floor(args.divisionCount));

  // League → division that already owns it as an exclusive (non-combined) source.
  const owned = new Map<string, number>();
  for (let gn = 1; gn <= divisionCount; gn++) {
    const src = divisionSource(sources, gn);
    if (src.mode !== "selected" || src.leagueIds.length !== 1) continue;
    const lid = src.leagueIds[0];
    if (!owned.has(lid)) owned.set(lid, gn);
  }

  const items: ExpansionPlanItem[] = [];
  const created: ExpansionPlanItem[] = [];
  const skipped: Array<{ leagueId: string; gn: number }> = [];
  let nextGn = divisionCount + 1;
  let reuseTemplate = true;

  leagues.forEach((l) => {
    const existing = owned.get(l.id);
    if (existing) {
      skipped.push({ leagueId: l.id, gn: existing });
      items.push({ gn: existing, leagueId: l.id, label: args.labels?.[String(existing)] || l.name, templateGn, isNew: false });
      return;
    }
    // The template division itself becomes the first generated division when
    // it is still on "all leagues" — no orphan draw is left behind.
    const tmplSrc = divisionSource(sources, templateGn);
    let gn: number;
    if (reuseTemplate && templateGn <= divisionCount && tmplSrc.mode === "all") {
      gn = templateGn;
      reuseTemplate = false;
    } else {
      gn = nextGn++;
    }
    const item: ExpansionPlanItem = { gn, leagueId: l.id, label: l.name, templateGn, isNew: gn > divisionCount };
    items.push(item);
    created.push(item);
    owned.set(l.id, gn);
  });

  return { items, created, skipped, divisionCount: Math.max(divisionCount, nextGn - 1) };
}


/* --------------------------------------------------------------- pools */

/**
 * Effective pool count for a division.
 *
 * Legacy knockout tournaments stored the sub-draw count in `league_sections`.
 * When the organiser has not set a pool count we adopt the legacy section
 * count so existing draws keep exactly the same shape.
 */
export function effectivePools(args: {
  gn: number;
  pools?: Record<string, number> | null;
  legacySections?: Record<string, number> | null;
}): number {
  const key = String(args.gn);
  const pools = Math.floor(Number(args.pools?.[key]) || 0);
  if (pools >= 1) return pools;
  const legacy = Math.floor(Number(args.legacySections?.[key]) || 0);
  return legacy >= 1 ? legacy : 1;
}

/**
 * Merge legacy section counts into the pool map. Used once when an existing
 * tournament is opened for editing — no data is deleted, the section map is
 * still written back for the engine.
 */
export function mergeLegacySectionsIntoPools(
  pools: Record<string, number> | null | undefined,
  legacySections: Record<string, number> | null | undefined,
  divisionCount: number,
): Record<string, number> {
  const out: Record<string, number> = { ...(pools || {}) };
  for (let gn = 1; gn <= Math.max(0, divisionCount); gn++) {
    const key = String(gn);
    const current = Math.floor(Number(out[key]) || 0);
    const legacy = Math.floor(Number((legacySections || {})[key]) || 0);
    if (current < 2 && legacy >= 2) out[key] = legacy;
  }
  return out;
}

/** Knockout divisions keep writing `league_sections` — derive it from pools. */
export function sectionsFromPools(
  pools: Record<string, number> | null | undefined,
  isKnockout: (gn: number) => boolean,
  divisionCount: number,
  legacySections?: Record<string, number> | null,
): Record<string, number> {
  const out: Record<string, number> = { ...(legacySections || {}) };
  for (let gn = 1; gn <= Math.max(0, divisionCount); gn++) {
    const key = String(gn);
    if (!isKnockout(gn)) continue;
    out[key] = Math.max(1, Math.floor(Number((pools || {})[key]) || 0) || Math.floor(Number(out[key]) || 0) || 1);
  }
  return out;
}

/* --------------------------------------------------- pool selector model */

/**
 * Formats that split a division into pools. Every one of these reads the SAME
 * pool count (`swiss_pools[gn]`, with the legacy `league_sections` fallback);
 * there is exactly one organiser-facing pool control per division.
 */
export const POOL_FORMATS = new Set([
  "single_round_robin",
  "double_round_robin",
  "swiss",
  "cross_league",
  "knockout",
]);

export function formatUsesPools(format: string | null | undefined): boolean {
  return POOL_FORMATS.has(String(format || ""));
}

/** Label for a pool count — 1 is a single draw, 2+ are pools. */
export function poolLabel(n: number): string {
  return n <= 1 ? "1 draw" : `${n} pools`;
}

/**
 * Knockout divisions are split into SECTIONS, not pools — a pool implies a
 * round-robin group, whereas these are independent knockout draws whose
 * winners meet in the division final.
 */
export function poolNoun(format: string | null | undefined, plural = true): string {
  if (String(format || "") === "knockout") return plural ? "sections" : "section";
  return plural ? "pools" : "pool";
}

/** Organiser-facing label for a pool/section count, per format. */
export function poolLabelFor(n: number, format: string | null | undefined): string {
  if (n <= 1) return "1 draw";
  return `${n} ${poolNoun(format)}`;
}

/** Heading for the single pool/section selector, per format. */
export function poolSelectorLabel(format: string | null | undefined): string {
  return String(format || "") === "knockout" ? "Sections" : "Pools";
}

/** Choices for the single pool selector, always including the current value. */
export function poolOptions(current: number, base: number[] = [1, 2, 4, 8]): number[] {
  const n = Math.max(1, Math.floor(current) || 1);
  const set = new Set<number>([...base, n]);
  return Array.from(set).sort((a, b) => a - b);
}

/* ---------------------------------------------------------- validation */

export interface DivisionIssue {
  gn: number;
  message: string;
}

/**
 * Warnings the organiser should see on the Structure step. These never block
 * saving a draft — they explain consequences in plain language.
 */
export function validateDivisions(args: {
  divisionCount: number;
  sources: Record<string, DivisionSource>;
  pools: Record<string, number>;
  formatFor: (gn: number) => string;
  labelFor?: (gn: number) => string;
}): DivisionIssue[] {
  const issues: DivisionIssue[] = [];
  for (let gn = 1; gn <= Math.max(0, args.divisionCount); gn++) {
    const src = divisionSource(args.sources, gn);
    if (src.mode === "selected" && src.leagueIds.length > 1) {
      issues.push({
        gn,
        message:
          "This division draws players from more than one league. Tick “Combined competition” if they should share one draw, otherwise give each league its own division.",
      });
    }
    const pools = Math.max(1, Math.floor(Number(args.pools[String(gn)]) || 1));
    const fmt = args.formatFor(gn);
    if (fmt === "cross_league" && pools < 2) {
      issues.push({ gn, message: "Cross-league play needs at least 2 pools in this division." });
    }
  }
  return issues;
}

export interface AllocationResult {
  /** member id → division index (0-based, matching the wizard's group index). */
  assignments: Map<string, number>;
  /**
   * Accepted entrants who belong to none of the divisions' source leagues.
   * They are deliberately NOT placed — the organiser must assign them.
   */
  unassigned: string[];
}

/**
 * Allocate accepted entrants to the division that matches the club league they
 * actually play in ("primarily players from"), instead of a blind snake draft.
 *
 * Rules:
 *  - An existing (manual) assignment always wins and is never overwritten.
 *  - A player registered in a league named by exactly one division goes there.
 *  - If several divisions could take them, the lowest division index wins.
 *  - Divisions on "all leagues" act as a catch-all: they accept anyone, but a
 *    restricted division that names the player's real league is preferred.
 *  - A player matching no division at all is returned as `unassigned`.
 */
export function allocateEntrantsToDivisions(args: {
  entrantIds: string[];
  numDivisions: number;
  sources: Record<string, DivisionSource>;
  registrationsByLeague: Map<string, string[]>;
  /** Existing manual placements to preserve (member id → 0-based index). */
  existing?: Map<string, number>;
  /** Ids the admin explicitly kept in a division despite not qualifying. */
  overrides?: Set<string>;
  /**
   * Entrants whose division decision is final ("locked in"). They are never
   * re-allocated by the auto-seeder — only an admin moving or removing them
   * changes their division. A locked entrant whose division no longer exists
   * (division count shrank) is surfaced as unassigned for the admin to place,
   * never silently redrafted somewhere else.
   */
  locked?: Set<string>;
}): AllocationResult {
  const { entrantIds, numDivisions, sources, registrationsByLeague } = args;
  const assignments = new Map<string, number>();
  const unassigned: string[] = [];
  if (numDivisions < 1) return { assignments, unassigned: [...entrantIds] };

  // Pre-compute each division's eligible population + whether it is a catch-all.
  const divisions = Array.from({ length: numDivisions }, (_, i) => {
    const src = divisionSource(sources, i + 1);
    const catchAll = src.mode === "all" || src.leagueIds.length === 0;
    const eligible = new Set<string>();
    if (!catchAll) {
      src.leagueIds.forEach((lid) =>
        (registrationsByLeague.get(lid) || []).forEach((mid) => eligible.add(mid)),
      );
    }
    return { catchAll, eligible };
  });

  for (const id of entrantIds) {
    if (!id) continue;
    const existing = args.existing?.get(id);
    const isValid = existing !== undefined && existing >= 0 && existing < numDivisions;
    if (isValid) {
      assignments.set(id, existing as number);
      continue;
    }
    if (args.locked?.has(id)) {
      // Locked decision, but the division is gone — leave it to the admin.
      unassigned.push(id);
      continue;
    }
    let target = divisions.findIndex((d) => !d.catchAll && d.eligible.has(id));
    if (target < 0 && args.overrides?.has(id)) target = -1;
    if (target < 0) {
      const catchAllIdx = divisions.findIndex((d) => d.catchAll);
      // Only fall back to a catch-all division when the player has no league at
      // all AND at least one division accepts everyone.
      if (catchAllIdx >= 0) target = catchAllIdx;
    }
    if (target < 0) unassigned.push(id);
    else assignments.set(id, target);
  }

  return { assignments, unassigned };
}
