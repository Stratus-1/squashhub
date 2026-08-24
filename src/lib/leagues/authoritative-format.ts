/**
 * Authoritative playing structure for a Club League.
 *
 * INVARIANT: for a given Club League (association) + season, the playing
 * structure — how many singles rubbers and doubles rubbers a fixture has, and
 * the derived starting-player requirement — is stored ONCE, on the
 * association-scoped `league_rules` row (`league_id IS NULL`).
 *
 * Per-team `league_rules` rows (`league_id = <team>`) are DERIVED MIRRORS kept
 * only for legacy/compatibility readers (old fixtures, scorecards, imports).
 * They must never be treated as an independent editable source, and the team
 * wizard must never persist a UI default over the authoritative record.
 *
 * Dimensions never to be conflated:
 *  - eligible player POOL size  : who may be picked (affiliation) — never format.
 *  - TEAM roster size           : starting players + reserves for one team.
 *  - MATCH positions / rubbers  : the format — this module.
 */

export interface StoredComposition {
  singles_rubbers?: number | null;
  doubles_rubbers?: number | null;
  team_size?: number | null;
  reserves_per_team?: number | null;
}

export type CompositionSource = "association" | "teams" | "none";

export interface ResolvedComposition {
  singlesRubbers: number | null;
  doublesRubbers: number | null;
  teamSize: number | null;
  reservesPerTeam: number | null;
  /** Where the numbers came from. "none" = nothing stored yet. */
  source: CompositionSource;
  /** True when at least one rubber count is stored somewhere. */
  hasStoredComposition: boolean;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

/** Consensus value across legacy per-team mirrors: the max stored positive value. */
function teamConsensus(rows: StoredComposition[], key: keyof StoredComposition): number | null {
  const vals = rows.map((r) => num(r?.[key])).filter((n): n is number => n !== null && n > 0);
  if (!vals.length) return null;
  return Math.max(...vals);
}

/**
 * Resolve the authoritative composition.
 *
 * Association row wins for every field it actually stores. Team mirrors are a
 * read-only fallback so legacy leagues (configured before the authoritative row
 * existed) keep resolving their real numbers instead of silently defaulting.
 */
export function resolveAuthoritativeComposition(input: {
  associationRules?: StoredComposition | null;
  teamRules?: StoredComposition[] | null;
}): ResolvedComposition {
  const assoc = input.associationRules ?? null;
  const teams = (input.teamRules ?? []).filter(Boolean) as StoredComposition[];

  const pick = (key: keyof StoredComposition): { value: number | null; from: CompositionSource } => {
    const a = num(assoc?.[key]);
    if (a !== null) return { value: a, from: "association" };
    const t = teamConsensus(teams, key);
    if (t !== null) return { value: t, from: "teams" };
    return { value: null, from: "none" };
  };

  const singles = pick("singles_rubbers");
  const doubles = pick("doubles_rubbers");
  const size = pick("team_size");
  const reserves = pick("reserves_per_team");

  const sources = [singles, doubles, size].map((p) => p.from).filter((s) => s !== "none");
  const source: CompositionSource = sources.includes("association")
    ? "association"
    : sources.length
      ? "teams"
      : "none";

  return {
    singlesRubbers: singles.value,
    doublesRubbers: doubles.value,
    teamSize: size.value,
    reservesPerTeam: reserves.value,
    source,
    hasStoredComposition: singles.value !== null || doubles.value !== null,
  };
}

/**
 * Build the rules object handed to `resolveFormat` / `inheritLeagueConfig`.
 * Association fields (pairing policy, dual participation, …) are carried
 * through unchanged; only the composition numbers are resolved authoritatively.
 */
export function authoritativeRules<T extends Record<string, any>>(
  associationRules: T | null | undefined,
  teamRules: StoredComposition[] | null | undefined,
): (T & StoredComposition) | null {
  const resolved = resolveAuthoritativeComposition({ associationRules, teamRules });
  if (!associationRules && resolved.source === "none") return null;
  return {
    ...((associationRules ?? {}) as T),
    singles_rubbers: resolved.singlesRubbers,
    doubles_rubbers: resolved.doublesRubbers,
    team_size: resolved.teamSize,
    reserves_per_team: resolved.reservesPerTeam,
  };
}

/**
 * Guard for the team wizard save path: never let a UI default overwrite a
 * stored composition. Returns the numbers that may be written.
 */
export function compositionToPersist(input: {
  stored: ResolvedComposition;
  /** What the wizard currently shows. */
  draft: { singlesRubbers: number; doublesRubbers: number };
  /** False while the authoritative record is still loading. */
  loaded: boolean;
  /** True when the admin actually edited the counts in this session. */
  dirty: boolean;
}): { singlesRubbers: number; doublesRubbers: number; write: boolean } {
  const { stored, draft, loaded, dirty } = input;
  if (!loaded) {
    // Unknown state: keep whatever is stored, write nothing.
    return {
      singlesRubbers: stored.singlesRubbers ?? draft.singlesRubbers,
      doublesRubbers: stored.doublesRubbers ?? draft.doublesRubbers,
      write: false,
    };
  }
  if (!dirty && stored.hasStoredComposition) {
    return {
      singlesRubbers: stored.singlesRubbers ?? draft.singlesRubbers,
      doublesRubbers: stored.doublesRubbers ?? draft.doublesRubbers,
      write: false,
    };
  }
  return { singlesRubbers: draft.singlesRubbers, doublesRubbers: draft.doublesRubbers, write: true };
}

/** Starting player positions implied by the format for ONE team. */
export function startingPositions(cfg: {
  singlesRubbers: number;
  doublesRubbers: number;
  allowDualParticipation?: boolean;
}): number {
  const singles = Math.max(0, cfg.singlesRubbers);
  const doublesPlayers = Math.max(0, cfg.doublesRubbers) * 2;
  return cfg.allowDualParticipation ? Math.max(singles, doublesPlayers) : singles + doublesPlayers;
}
