/**
 * Phase 2 — season-safe historical fixture display.
 *
 * Fixtures carry immutable `home_team_name_snapshot` / `away_team_name_snapshot`
 * values captured for the season the fixture was played in. Historical views must
 * prefer the snapshot so a later team rename (or a new season re-using the same
 * team code) can never rewrite what an old fixture displays.
 *
 * The live lookup remains the fallback for legacy rows that could not be
 * uniquely resolved during backfill (e.g. `CSIL01`, `LG001`).
 *
 * NOTE: team CODES are untouched and remain the key for NSA/platform sync.
 */

export type FixtureTeamSide = "home" | "away";

export interface FixtureTeamNameInput {
  /** Immutable name captured at fixture time (nullable for unresolved rows). */
  snapshot?: string | null;
  /** Original text code — still the NSA/platform compatibility key. */
  code?: string | null;
  /** Current live name for the team, if resolvable today. */
  liveName?: string | null;
}

const clean = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

export const BYE_CODE = "__BYE__";

export function isByeCode(code?: string | null): boolean {
  return (code ?? "").trim().toUpperCase() === BYE_CODE;
}

/**
 * Resolve the name to display for one side of a fixture.
 * Priority: snapshot → live name → code → "".
 */
export function fixtureTeamDisplayName({ snapshot, code, liveName }: FixtureTeamNameInput): string {
  if (isByeCode(code)) return "BYE";
  return clean(snapshot) ?? clean(liveName) ?? clean(code) ?? "";
}

/**
 * Phase 2.1 — competition-aware team lookup.
 *
 * NSA team codes are NOT globally unique: the same code (e.g. `CSI001`) can
 * legitimately belong to two different competitions/divisions in the same
 * association+season (Men's 2nd vs Ladies 1st). A plain `code -> name` map
 * therefore silently overwrites one of them.
 *
 * `TeamNameIndex` keeps a division-scoped map (the authoritative one) plus a
 * code-only map that is deliberately blanked when a code is ambiguous.
 */
export interface TeamNameIndexInput {
  code?: string | null;
  /** NSA's per-competition team code — the stable discriminator when present. */
  nsa_team_code?: string | null;
  name?: string | null;
  division?: string | null;
}

export interface TeamNameIndex {
  /** `${DIVISION}|${CODE}` -> name */
  byDivisionCode: Record<string, string>;
  /** CODE -> name, only when that code is unambiguous across competitions. */
  byCode: Record<string, string>;
}

const normDiv = (v?: string | null) => (v ?? "").trim().toUpperCase();

export function buildTeamNameIndex(teams: TeamNameIndexInput[]): TeamNameIndex {
  const byDivisionCode: Record<string, string> = {};
  const byCode: Record<string, string> = {};
  const seen: Record<string, string> = {};
  const ambiguous = new Set<string>();

  for (const t of teams) {
    const name = clean(t.name);
    if (!name) continue;
    for (const raw of [t.nsa_team_code, t.code]) {
      const code = clean(raw)?.toUpperCase();
      if (!code) continue;
      if (t.division) byDivisionCode[`${normDiv(t.division)}|${code}`] = name;
      if (seen[code] === undefined) seen[code] = name;
      else if (seen[code] !== name) ambiguous.add(code);
    }
  }
  for (const [code, name] of Object.entries(seen)) {
    if (!ambiguous.has(code)) byCode[code] = name;
  }
  return { byDivisionCode, byCode };
}

export type TeamNameLookup = Record<string, string> | TeamNameIndex | null | undefined;

function lookupName(lookup: TeamNameLookup, code?: string | null, division?: string | null) {
  if (!lookup || !code) return undefined;
  const key = code.toUpperCase();
  if ("byDivisionCode" in (lookup as TeamNameIndex)) {
    const idx = lookup as TeamNameIndex;
    return idx.byDivisionCode[`${normDiv(division)}|${key}`] ?? idx.byCode[key];
  }
  return (lookup as Record<string, string>)[key];
}

/** Convenience reader for a raw fixture row + a team-name lookup. */
export function fixtureSideName(
  fixture: {
    home_team_code?: string | null;
    away_team_code?: string | null;
    home_team_name_snapshot?: string | null;
    away_team_name_snapshot?: string | null;
    division?: string | null;
  },
  side: FixtureTeamSide,
  teamNames?: TeamNameLookup,
): string {
  const code = side === "home" ? fixture.home_team_code : fixture.away_team_code;
  const snapshot = side === "home" ? fixture.home_team_name_snapshot : fixture.away_team_name_snapshot;
  const liveName = lookupName(teamNames, code, fixture.division);
  return fixtureTeamDisplayName({ snapshot, code, liveName });
}

/** True when a distinct friendly name exists (i.e. it isn't just the code). */
export function hasFixtureTeamName(
  fixture: Parameters<typeof fixtureSideName>[0],
  side: FixtureTeamSide,
  teamNames?: TeamNameLookup,
): boolean {
  const code = side === "home" ? fixture.home_team_code : fixture.away_team_code;
  const name = fixtureSideName(fixture, side, teamNames);
  return name.length > 0 && name !== (code ?? "").trim() && !isByeCode(code);
}

