/**
 * Cross-gender league play.
 *
 * In several regional leagues (NSA especially) strong ladies — typically the
 * 1st and 2nd league players — also turn out for the men's teams. Until now
 * they only ever appeared in a men's team pool if a captain pulled them in by
 * hand, and only ever on the ladies' club ladder.
 *
 * This module holds the pure rules:
 *   - which ladies QUALIFY (they actually played men's-league rubbers in the
 *     current or previous season);
 *   - how strong they were there (league level + string position), so they can
 *     be slotted into the men's ladder sensibly;
 *   - how the association default and the club override combine.
 *
 * Nothing here reads the database or writes anything — callers do that.
 */

/** Rubber row as stored in `nsa_rubber_history`. */
export interface CrossGenderRubberRow {
  player_code: string | null;
  /** 'Mens' | 'Ladies' as scraped. */
  category: string | null;
  league_label: string | null;
  position: number | null;
  season_year: number | null;
  won?: boolean | null;
}

export interface CrossGenderQualification {
  /** Played in the men's league in the current or previous season. */
  qualifies: boolean;
  /** Most recent season with a men's-league rubber. */
  lastSeason: number | null;
  /** Strongest (lowest) men's league level played recently. */
  bestLeagueLevel: number | null;
  /** Typical men's league level played recently (rounded to 1 decimal). */
  typicalLeagueLevel: number | null;
  /** Typical string position played in the men's team (1 = number one). */
  typicalPosition: number | null;
  /** Men's-league rubbers counted in the qualifying window. */
  rubbers: number;
  /** Men's-league rubbers of any age (context only). */
  totalRubbers: number;
}

export const MENS_CATEGORY = "Mens";
export const LADIES_CATEGORY = "Ladies";

/** How many seasons back still qualify: current + previous. */
export const QUALIFYING_SEASON_WINDOW = 1;

export const normalizeAssociationCode = (code: string | null | undefined) =>
  String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** "3rd", "3rd League", "League 3" -> 3. Unknown -> null. */
export function parseLevel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = String(label).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const isMensRow = (row: CrossGenderRubberRow) =>
  String(row.category || "").trim().toLowerCase().startsWith("men");

/** Is this club member a lady, using the many spellings stored over the years? */
export function isLadiesGender(gender: string | null | undefined): boolean {
  const g = String(gender || "").trim().toLowerCase();
  return g === "f" || g === "female" || g === "ladies" || g === "lady" || g === "women" || g === "woman";
}

/** League NAME helpers — the club's own team names, e.g. "Men's 3rd League". */
export const isLadiesLeagueName = (name: string | null | undefined) => /ladies|women/i.test(String(name || ""));
export const isMensLeagueName = (name: string | null | undefined) =>
  /\bmen\b|\bmen's\b|\bmens\b/i.test(String(name || "")) && !/women/i.test(String(name || ""));

/**
 * Resolve the switch: the association sets the default, a club may override it.
 * `null`/`undefined` on the club means "follow the association".
 */
export function resolveCrossGenderSetting(
  clubOverride: boolean | null | undefined,
  associationDefault: boolean | null | undefined,
): boolean {
  if (clubOverride === true || clubOverride === false) return clubOverride;
  return associationDefault === true;
}

/**
 * Turn one player's rubber history into their cross-gender qualification.
 * Only men's-league rubbers count; the qualifying window is the latest season
 * in the data (or the current year) and the one before it.
 */
export function qualifyFromRubbers(
  rows: CrossGenderRubberRow[],
  latestSeason: number,
): CrossGenderQualification {
  const mens = (rows || []).filter(isMensRow);
  const cutoff = latestSeason - QUALIFYING_SEASON_WINDOW;

  let lastSeason: number | null = null;
  let bestLeagueLevel: number | null = null;
  let levelSum = 0;
  let positionSum = 0;
  let counted = 0;

  for (const row of mens) {
    const season = Number(row.season_year);
    if (Number.isFinite(season)) {
      if (lastSeason === null || season > lastSeason) lastSeason = season;
      if (season < cutoff) continue;
    } else {
      // No season recorded — history we cannot date never qualifies anyone.
      continue;
    }
    const level = parseLevel(row.league_label);
    const position = Number(row.position);
    if (!level || !Number.isFinite(position) || position < 1) continue;
    counted += 1;
    levelSum += level;
    positionSum += position;
    if (bestLeagueLevel === null || level < bestLeagueLevel) bestLeagueLevel = level;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    qualifies: counted > 0,
    lastSeason,
    bestLeagueLevel,
    typicalLeagueLevel: counted > 0 ? round1(levelSum / counted) : null,
    typicalPosition: counted > 0 ? round1(positionSum / counted) : null,
    rubbers: counted,
    totalRubbers: mens.length,
  };
}

/**
 * Build the qualification map for a whole club.
 * `codesByMember` maps club_member_id -> that member's association numbers.
 */
export function buildCrossGenderQualifications(
  rows: CrossGenderRubberRow[],
  codesByMember: Map<string, string[]>,
  opts: { latestSeason?: number } = {},
): Map<string, CrossGenderQualification> {
  const byCode = new Map<string, CrossGenderRubberRow[]>();
  let latest = opts.latestSeason ?? 0;
  for (const row of rows || []) {
    const season = Number(row.season_year);
    if (!opts.latestSeason && Number.isFinite(season) && season > latest) latest = season;
    const code = normalizeAssociationCode(row.player_code);
    if (!code) continue;
    const list = byCode.get(code);
    if (list) list.push(row);
    else byCode.set(code, [row]);
  }
  if (!latest) latest = new Date().getFullYear();

  const out = new Map<string, CrossGenderQualification>();
  for (const [memberId, codes] of codesByMember) {
    const memberRows = (codes || [])
      .map(normalizeAssociationCode)
      .filter(Boolean)
      .flatMap((c) => byCode.get(c) ?? []);
    if (memberRows.length === 0) continue;
    const q = qualifyFromRubbers(memberRows, latest);
    if (q.qualifies) out.set(memberId, q);
  }
  return out;
}

/** Short human note for a pool chip / ladder badge. */
export function describeCrossGender(q: CrossGenderQualification | null | undefined): string {
  if (!q) return "";
  const level = q.typicalLeagueLevel;
  const pos = q.typicalPosition;
  if (level && pos) return `Plays men's league ${level} · usually #${pos} (${q.rubbers} rubbers)`;
  return `Has played in the men's league (${q.rubbers} rubbers)`;
}

/**
 * Ordering key for slotting a cross-listed player into the men's ladder:
 * absolute string number = (league level - 1) x 4 + position. Lower = stronger.
 */
export function crossGenderStrengthKey(q: CrossGenderQualification): number {
  const level = q.typicalLeagueLevel ?? q.bestLeagueLevel ?? 99;
  const pos = q.typicalPosition ?? 4;
  return (level - 1) * 4 + pos;
}
