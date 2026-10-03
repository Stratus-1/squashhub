/**
 * Championship outcome + optional awards for Standings.
 *
 * Stored on the tournament at `beta_lifecycle.standings_awards`. When absent,
 * callers MUST keep their existing behaviour (readStandingsAwards → null).
 * The winner SOURCE is never stored here: it comes from the tournament's own
 * progression (final match / playoffs / last-stage standings).
 */
export type ChampionshipOutcome = "individual" | "pair" | "team" | "none";

export interface StandingsAwards {
  outcome: ChampionshipOutcome;
  champion: boolean;
  runnerUp: boolean;
  topScorer: boolean;
  woodenSpoon: boolean;
  finalPositions: boolean;
}

export const OUTCOME_LABEL: Record<ChampionshipOutcome, string> = {
  individual: "Individual winner",
  pair: "Pair winner",
  team: "Team/group winner",
  none: "No overall winner",
};

const OUTCOMES: ChampionshipOutcome[] = ["individual", "pair", "team", "none"];

export function readStandingsAwards(betaLifecycle: any): StandingsAwards | null {
  const raw = betaLifecycle?.standings_awards;
  if (!raw || typeof raw !== "object" || !OUTCOMES.includes(raw.outcome)) return null;
  return {
    outcome: raw.outcome,
    champion: raw.outcome !== "none" && raw.champion !== false,
    runnerUp: raw.outcome !== "none" && !!raw.runnerUp,
    topScorer: !!raw.topScorer,
    woodenSpoon: !!raw.woodenSpoon,
    finalPositions: !!raw.finalPositions,
  };
}

/** Suggested starting point — only Champion on; new awards are always opt-in. */
export function defaultStandingsAwards(opts: { doubles?: boolean; betweenGroups?: boolean }): StandingsAwards {
  return {
    outcome: opts.betweenGroups ? "team" : opts.doubles ? "pair" : "individual",
    champion: true, runnerUp: false, topScorer: false, woodenSpoon: false, finalPositions: false,
  };
}

export interface OutcomeRow {
  id: string;
  partnerId?: string | null;
  name: string;
  group: number;
  played: number;
  won: number;
  lost?: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesWon?: number;
  gamesLost?: number;
}

/**
 * Individual points ordering shared by Top points scorer and Wooden Spoon:
 * points scored, then points difference, wins, games difference, name.
 */
export function compareByPoints(a: OutcomeRow, b: OutcomeRow): number {
  if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
  const d = (r: OutcomeRow) => r.pointsFor - r.pointsAgainst;
  if (d(b) !== d(a)) return d(b) - d(a);
  if (b.won !== a.won) return b.won - a.won;
  const g = (r: OutcomeRow) => (r.gamesWon ?? 0) - (r.gamesLost ?? 0);
  if (g(b) !== g(a)) return g(b) - g(a);
  return a.name.localeCompare(b.name);
}

const sameScore = (a: OutcomeRow, b: OutcomeRow) =>
  a.pointsFor === b.pointsFor && a.pointsAgainst === b.pointsAgainst && a.won === b.won
  && (a.gamesWon ?? 0) - (a.gamesLost ?? 0) === (b.gamesWon ?? 0) - (b.gamesLost ?? 0);

export type AwardState = "pending" | "current" | "final";

export interface TeamTotal { group: number; label: string; points: number; against: number; won: number; lost: number; played: number }
export interface TeamOutcome { teams: TeamTotal[]; leader: TeamTotal | null; state: AwardState; tied: boolean }

/** Aggregate each competing group from its players' authoritative played results. */
export function teamOutcome(groups: Array<{ group: number; label: string }>, rows: OutcomeRow[], complete: boolean): TeamOutcome {
  const teams = groups.map((g) => {
    const mine = rows.filter((r) => r.group === g.group);
    return {
      group: g.group, label: g.label,
      points: mine.reduce((s, r) => s + r.pointsFor, 0),
      against: mine.reduce((s, r) => s + r.pointsAgainst, 0),
      won: mine.reduce((s, r) => s + r.won, 0),
      lost: mine.reduce((s, r) => s + (r.lost ?? r.played - r.won), 0),
      played: mine.reduce((s, r) => s + r.played, 0),
    };
  });
  const anyPlayed = teams.some((t) => t.played > 0);
  const sorted = [...teams].sort((a, b) => b.points - a.points || b.won - a.won);
  const tied = sorted.length > 1 && sorted[0].points === sorted[1].points && sorted[0].won === sorted[1].won;
  return {
    teams,
    leader: anyPlayed && !tied ? sorted[0] : null,
    tied: anyPlayed && tied,
    state: !anyPlayed ? "pending" : complete ? "final" : "current",
  };
}

export interface IndividualAwards {
  topScorer: { rows: OutcomeRow[]; state: AwardState } | null;
  /** Only ever set once the tournament is complete. */
  woodenSpoon: { rows: OutcomeRow[] } | null;
}

/** Top scorer / Wooden Spoon across ALL groups, one ordering for both. */
export function individualAwards(rows: OutcomeRow[], complete: boolean): IndividualAwards {
  const played = rows.filter((r) => r.played > 0);
  if (!played.length) return { topScorer: null, woodenSpoon: null };
  const sorted = [...rows].sort(compareByPoints);
  const top = sorted.filter((r) => sameScore(r, sorted[0]));
  const last = sorted[sorted.length - 1];
  const bottom = sorted.filter((r) => sameScore(r, last));
  return {
    topScorer: { rows: top, state: complete ? "final" : "current" },
    woodenSpoon: complete && sorted.length > 1 ? { rows: bottom } : null,
  };
}

/** Every non-bye, non-cancelled fixture in scope has a result. */
export function fixturesComplete(matches: Array<{ status?: string | null; is_bye?: boolean | null }>): boolean {
  const live = matches.filter((m) => !m.is_bye && m.status !== "cancelled" && m.status !== "void");
  return live.length > 0 && live.every((m) => ["completed", "forfeited", "walkover"].includes(String(m.status)));
}
