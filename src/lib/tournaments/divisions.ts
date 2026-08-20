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

/** Parse the persisted `league_sources` / `league_source_modes` jsonb pair. */
export function parseDivisionSources(sources: RawMap, modes: RawMap): Record<string, DivisionSource> {
  const out: Record<string, DivisionSource> = {};
  const keys = new Set<string>([...Object.keys(sources || {}), ...Object.keys(modes || {})]);
  keys.forEach((k) => {
    const rawIds = (sources || {})[k];
    const leagueIds = Array.isArray(rawIds) ? rawIds.filter((v): v is string => typeof v === "string") : [];
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
