/**
 * Season + canonical league level resolution.
 *
 * The `leagues` table stores TEAM rows ("Boomslangs", "1st L Reserves"). The
 * competition structure organisers think in is:
 *
 *     Season / year  →  canonical level (1, 2, 3 …)  →  teams / reserves
 *
 * `leagues.season_year`, `leagues.level` and `leagues.is_reserve` are the
 * stored source of truth. They are nullable, so every reader falls back to the
 * inference that was in place before those columns existed:
 *
 *   1. stored `level` / `season_year`                      (authoritative)
 *   2. tier derived from fixtures (round name → team code)
 *   3. an ordinal in the row's own name ("Men's 2nd Eagles", "3rd L Reserves")
 *   4. the nearest reserves anchor when the club numbers codes sequentially
 *   5. unknown → the row keeps its own group and is never hidden
 *
 * Both the club admin Leagues page and the tournament "Players from" selector
 * consume this module, so the two surfaces cannot disagree.
 */

export interface LeagueRowLike {
  id: string;
  name: string;
  code?: string | null;
  association_id?: string | null;
  season_year?: number | null;
  level?: number | null;
  is_reserve?: boolean | null;
}

export type LevelSource = "stored" | "fixtures" | "name" | "anchor" | "unknown";
export type SeasonSource = "stored" | "fixtures" | "unknown";

export interface ResolvedLeague {
  id: string;
  level: number | null;
  levelSource: LevelSource;
  seasonYear: number | null;
  seasonSource: SeasonSource;
  isReserve: boolean;
}

const RESERVE_RE = /\breserves?\b/i;

export function isReserveName(name: string): boolean {
  return RESERVE_RE.test(String(name || ""));
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

/** "3rd L Reserves" → 3, "Second League" → 2, "Boomslangs" → null. */
export function ordinalFromName(name: string): number | null {
  const s = String(name || "").toLowerCase();
  const digit = s.match(/(\d+)\s*(?:st|nd|rd|th)?\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n > 0 && n < 100) return n;
  }
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return n;
  }
  return null;
}

/** 1 → "1st League". Display label only — never an identity. */
export function levelLabel(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix} League`;
}

/** Fixture-derived evidence, keyed by the club league id. */
export interface FixtureEvidence {
  level?: number | null;
  seasonYear?: number | null;
}

export interface ResolveOptions {
  /** Level/season derived from league_rounds + platform_league_fixtures. */
  fixtureEvidence?: Map<string, FixtureEvidence> | null;
}

/**
 * Resolve level + season for a set of league rows, scoped per association so a
 * club running two associations never borrows the other's reserves anchors.
 */
export function resolveLeagueSeasonLevels(
  rows: LeagueRowLike[],
  opts: ResolveOptions = {},
): Map<string, ResolvedLeague> {
  const out = new Map<string, ResolvedLeague>();
  const byAssoc = new Map<string, LeagueRowLike[]>();
  rows.forEach((r) => {
    const key = r.association_id || "__none__";
    if (!byAssoc.has(key)) byAssoc.set(key, []);
    byAssoc.get(key)!.push(r);
  });

  byAssoc.forEach((group) => {
    // Code-ordered reserves anchors: NIL002–006 sit above "1st L Reserves" (NIL007).
    const sorted = [...group].sort((a, b) =>
      String(a.code || "").toUpperCase().localeCompare(String(b.code || "").toUpperCase()),
    );
    const anchors: Array<{ idx: number; level: number }> = [];
    sorted.forEach((l, i) => {
      if (isReserveName(l.name)) {
        const n = ordinalFromName(l.name);
        if (n != null) anchors.push({ idx: i, level: n });
      }
    });

    // Season fallback for rows without their own evidence: when every resolved
    // row in the association agrees on one year, unresolved rows inherit it.
    const evidenceYears = new Set<number>();
    group.forEach((l) => {
      const stored = l.season_year ?? null;
      const fx = opts.fixtureEvidence?.get(l.id)?.seasonYear ?? null;
      if (stored != null) evidenceYears.add(stored);
      else if (fx != null) evidenceYears.add(fx);
    });
    const soleYear = evidenceYears.size === 1 ? Array.from(evidenceYears)[0] : null;

    sorted.forEach((l, i) => {
      const isReserve = l.is_reserve ?? isReserveName(l.name);
      const fx = opts.fixtureEvidence?.get(l.id);

      let level: number | null = null;
      let levelSource: LevelSource = "unknown";
      if (l.level != null) {
        level = l.level;
        levelSource = "stored";
      } else if (fx?.level != null && !isReserve) {
        level = fx.level;
        levelSource = "fixtures";
      } else {
        const own = ordinalFromName(l.name);
        if (own != null) {
          level = own;
          levelSource = "name";
        } else {
          const next = anchors.find((a) => a.idx >= i);
          if (next) {
            level = next.level;
            levelSource = "anchor";
          } else if (anchors.length > 0) {
            level = anchors[anchors.length - 1].level + 1;
            levelSource = "anchor";
          }
        }
      }

      let seasonYear: number | null = null;
      let seasonSource: SeasonSource = "unknown";
      if (l.season_year != null) {
        seasonYear = l.season_year;
        seasonSource = "stored";
      } else if (fx?.seasonYear != null) {
        seasonYear = fx.seasonYear;
        seasonSource = "fixtures";
      } else if (soleYear != null) {
        seasonYear = soleYear;
        seasonSource = "fixtures";
      }

      out.set(l.id, { id: l.id, level, levelSource, seasonYear, seasonSource, isReserve });
    });
  });

  return out;
}

/** Distinct seasons present, newest first. Rows without a season are excluded. */
export function seasonsPresent(resolved: Map<string, ResolvedLeague>): number[] {
  const set = new Set<number>();
  resolved.forEach((r) => { if (r.seasonYear != null) set.add(r.seasonYear); });
  return Array.from(set).sort((a, b) => b - a);
}

/**
 * Which season should a tournament in `preferredYear` draw from?
 * Exact match wins; otherwise the latest season that is not in the future;
 * otherwise the latest season we have. `null` when the club has no seasons.
 */
export function pickSeasonForYear(seasons: number[], preferredYear: number): number | null {
  if (seasons.length === 0) return null;
  if (seasons.includes(preferredYear)) return preferredYear;
  const past = seasons.filter((s) => s < preferredYear);
  if (past.length > 0) return Math.max(...past);
  return Math.max(...seasons);
}

/** True when the preferred year has no structure of its own. */
export function isSeasonFallback(seasons: number[], preferredYear: number): boolean {
  return seasons.length > 0 && !seasons.includes(preferredYear);
}

/** Rows the admin still has to classify (level unknown or only guessed). */
export function needsLevelConfirmation(resolved: Map<string, ResolvedLeague>): string[] {
  const out: string[] = [];
  resolved.forEach((r) => {
    if (r.level == null || r.levelSource === "anchor" || r.levelSource === "unknown") out.push(r.id);
  });
  return out;
}
