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

/** Convenience reader for a raw fixture row + a code→name map. */
export function fixtureSideName(
  fixture: {
    home_team_code?: string | null;
    away_team_code?: string | null;
    home_team_name_snapshot?: string | null;
    away_team_name_snapshot?: string | null;
  },
  side: FixtureTeamSide,
  teamNameByCode?: Record<string, string> | null,
): string {
  const code = side === "home" ? fixture.home_team_code : fixture.away_team_code;
  const snapshot = side === "home" ? fixture.home_team_name_snapshot : fixture.away_team_name_snapshot;
  const liveName = code ? teamNameByCode?.[code.toUpperCase()] : undefined;
  return fixtureTeamDisplayName({ snapshot, code, liveName });
}

/** True when a distinct friendly name exists (i.e. it isn't just the code). */
export function hasFixtureTeamName(
  fixture: Parameters<typeof fixtureSideName>[0],
  side: FixtureTeamSide,
  teamNameByCode?: Record<string, string> | null,
): boolean {
  const code = side === "home" ? fixture.home_team_code : fixture.away_team_code;
  const name = fixtureSideName(fixture, side, teamNameByCode);
  return name.length > 0 && name !== (code ?? "").trim() && !isByeCode(code);
}
