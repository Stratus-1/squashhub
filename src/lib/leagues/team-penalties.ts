/**
 * League team penalties — pure. A penalty deducts points from a team's
 * accumulated SEASON standings total only. Fixture scores, rubbers and bonus
 * points (e.g. regional-player bonus) are never touched.
 *
 * Invariant: `points` is always stored positive; the deduction is applied here,
 * once, as `adjusted = total - sum(active points)`. Reversed rows never count.
 */
import { inSeason, type SeasonWindow, type StandingRow } from "./team-standings";

export interface TeamPenalty {
  id: string;
  team_code: string;
  points: number;
  rule_name: string;
  reason: string | null;
  fixture_id: string | null;
  season_id: string | null;
  effective_date: string;
  applied_at: string;
  reversed_at: string | null;
}

export interface PenalisedRow extends StandingRow {
  penalty: number; // positive deduction
  adjusted: number;
  penalties: TeamPenalty[];
}

export function activeSeasonPenalties(all: TeamPenalty[], season: SeasonWindow): TeamPenalty[] {
  return all.filter(
    (p) => !p.reversed_at && Math.abs(Number(p.points)) > 0 &&
      inSeason({ season_id: p.season_id, date: p.effective_date }, season),
  );
}

/** Adds penalty/adjusted totals and re-sorts by adjusted total. */
export function applyTeamPenalties(rows: StandingRow[], penalties: TeamPenalty[]): PenalisedRow[] {
  const seen = new Set<string>();
  const byTeam = new Map<string, TeamPenalty[]>();
  for (const p of penalties) {
    if (p.reversed_at || seen.has(p.id)) continue; // never double-count
    seen.add(p.id);
    const k = p.team_code.toUpperCase();
    byTeam.set(k, [...(byTeam.get(k) ?? []), p]);
  }
  return rows
    .map((r) => {
      const list = byTeam.get(r.team_code.toUpperCase()) ?? [];
      const penalty = list.reduce((s, p) => s + Math.abs(Number(p.points) || 0), 0);
      return { ...r, penalty, adjusted: r.total - penalty, penalties: list };
    })
    .sort((a, b) => b.adjusted - a.adjusted || b.total - a.total || a.team_code.localeCompare(b.team_code));
}
