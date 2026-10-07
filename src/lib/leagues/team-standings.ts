/**
 * Team standings derivation — pure, shared by every league (singles, doubles, hybrid).
 *
 * Invariant: a submitted/confirmed fixture result inside the selected season
 * always appears in standings. Rounds only LABEL/GROUP fixtures; a missing,
 * unlinked or season-mismatched round can never hide a valid result.
 * Totals come from the saved result's `*_total_points`, which the scorecard
 * computes from the league's own rules (rubber points + configured bonus).
 */

export const BYE_CODE = "__BYE__";
export const FALLBACK_TIER = "League";

export interface SeasonWindow {
  id: string | null;
  season_year: number;
  starts_on?: string | null;
  ends_on?: string | null;
}

export interface StandingsRound {
  id: string;
  name: string | null;
  round_number: number | null;
  round_date: string | null;
  season_id: string | null;
}

export interface StandingsFixture {
  id: string;
  fixture_date: string;
  home_team_code: string | null;
  away_team_code: string | null;
  status: string | null;
  round_id: string | null;
  season_id?: string | null;
}

export interface StandingsResult {
  fixture_id: string;
  home_total_points: number | null;
  away_total_points: number | null;
  status: string | null;
}

export interface StandingWeek {
  date: string;
  value: string;
  fixture_id: string | null;
  status: string | null;
  isBye?: boolean;
}

export interface StandingRow {
  team_code: string;
  total: number;
  played: number;
  weeks: StandingWeek[];
}

export interface Tier {
  tier: string;
  roundIds: string[];
  firstNumber: number;
}

const FINAL = new Set(["submitted", "confirmed"]);

export function tierFromRoundName(name: string): string {
  return name.replace(/\s+(round|week|wk|rd)\s*\d+\s*$/i, "").trim() || name.trim();
}

function windowOf(season: SeasonWindow) {
  return {
    from: season.starts_on || `${season.season_year}-01-01`,
    to: season.ends_on || `${season.season_year}-12-31`,
  };
}

/** Linked rows belong to their season; unlinked legacy rows belong by date. */
export function inSeason(
  row: { season_id?: string | null; date: string | null },
  season: SeasonWindow,
): boolean {
  if (row.season_id) return !!season.id && row.season_id === season.id;
  if (!row.date) return false;
  const { from, to } = windowOf(season);
  const d = row.date.slice(0, 10);
  return d >= from && d <= to;
}

/** Tiers for the season, built from rounds AND from fixtures that have no usable round. */
export function deriveTiers(
  rounds: StandingsRound[],
  fixtures: StandingsFixture[],
  season: SeasonWindow,
): Tier[] {
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const grouped = new Map<string, Tier>();
  const add = (tier: string, roundId: string | null, n: number) => {
    const ex = grouped.get(tier);
    if (ex) {
      if (roundId && !ex.roundIds.includes(roundId)) ex.roundIds.push(roundId);
      ex.firstNumber = Math.min(ex.firstNumber, n);
    } else grouped.set(tier, { tier, roundIds: roundId ? [roundId] : [], firstNumber: n });
  };
  rounds
    .filter((r) => inSeason({ season_id: r.season_id, date: r.round_date }, season))
    .forEach((r) => add(tierFromRoundName(r.name || `Round ${r.round_number}`), r.id, r.round_number ?? 0));
  fixtures.forEach((f) => {
    const r = f.round_id ? roundById.get(f.round_id) : undefined;
    if (r) add(tierFromRoundName(r.name || `Round ${r.round_number}`), r.id, r.round_number ?? 0);
    else add(FALLBACK_TIER, null, Number.MAX_SAFE_INTEGER);
  });
  return Array.from(grouped.values()).sort((a, b) => a.firstNumber - b.firstNumber);
}

export function tierOfFixture(f: StandingsFixture, tiers: Tier[]): string {
  return (f.round_id && tiers.find((t) => t.roundIds.includes(f.round_id!))?.tier) || FALLBACK_TIER;
}

export function buildTierStandings(
  fixtures: StandingsFixture[],
  results: StandingsResult[],
): { weeks: string[]; rows: StandingRow[] } {
  const resBy = new Map(results.map((r) => [r.fixture_id, r]));
  const weekDates = Array.from(new Set(fixtures.map((f) => f.fixture_date))).sort();
  const teams = Array.from(
    new Set(
      fixtures
        .flatMap((f) => [f.home_team_code, f.away_team_code])
        .filter((c): c is string => !!c && c !== BYE_CODE),
    ),
  );
  const rows = teams.map((tc) => {
    let total = 0;
    let played = 0;
    const weeks = weekDates.map<StandingWeek>((d) => {
      const fx = fixtures.find(
        (f) => f.fixture_date === d && (f.home_team_code === tc || f.away_team_code === tc),
      );
      if (!fx) return { date: d, value: "", fixture_id: null, status: null };
      const opp = fx.home_team_code === tc ? fx.away_team_code : fx.home_team_code;
      if (opp === BYE_CODE) return { date: d, value: "", fixture_id: null, status: "bye", isBye: true };
      const r = resBy.get(fx.id);
      if (!r || !FINAL.has(String(r.status)) || (r.home_total_points == null && r.away_total_points == null)) {
        return { date: d, value: "", fixture_id: fx.id, status: r?.status ?? null };
      }
      const home = fx.home_team_code === tc;
      const own = (home ? r.home_total_points : r.away_total_points) ?? 0;
      const oppPts = (home ? r.away_total_points : r.home_total_points) ?? 0;
      total += own;
      played += 1;
      return { date: d, value: `${own}-${oppPts}`, fixture_id: fx.id, status: r.status };
    });
    return { team_code: tc, total, played, weeks };
  });
  rows.sort((a, b) => b.total - a.total || a.team_code.localeCompare(b.team_code));
  return { weeks: weekDates, rows };
}
