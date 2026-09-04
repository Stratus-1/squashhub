/**
 * Season fixture generation across MANY divisions in one pass.
 *
 * Each division keeps its own play night(s) — Men 1st on Tuesday, Ladies 2nd on
 * Wednesday — while sharing one season start date and one exclusion calendar
 * (public holidays, school-holiday weeks, manual shutdowns). Excluded dates push
 * the affected league forward a week instead of dropping fixtures, and every
 * skip is reported so an organiser can see why a week is missing.
 */
import {
  FixtureTeam,
  GeneratedFixture,
  roundRobin,
} from "@/lib/leagues/two-leg-fixtures";
import { weekStart, parseISODate, toISO } from "@/lib/leagues/calendar";

export type DivisionPlan = {
  /** League/division label, e.g. "Men 1st". */
  division: string;
  teams: FixtureTeam[];
  /** Weekday numbers 0..6 (Sun..Sat). Empty = weekday of the start date. */
  playDows: number[];
};

export type SeasonOptions = {
  divisions: DivisionPlan[];
  /** ISO yyyy-mm-dd, first possible play date. */
  startDate: string;
  /** ISO dates excluded, mapped to the reason shown in the preview. */
  exclusions: Record<string, string>;
  /** Generate the return leg with venues swapped. */
  twoLegs: boolean;
  /** Optional mid-season break: earliest date the return leg may start. */
  secondLegStart?: string;
  /** How many fixtures one club may host on the same night (default 2). */
  maxHomePerClubPerNight?: number;
};

export type SkippedWeek = { division: string; date: string; reason: string };

export type SeasonConflict = {
  kind: "venue-clash" | "team-double-booked" | "too-few-teams" | "home-away-uneven";
  division: string;
  detail: string;
};

export type SeasonPlanResult = {
  fixtures: GeneratedFixture[];
  byDivision: Record<string, GeneratedFixture[]>;
  skipped: SkippedWeek[];
  conflicts: SeasonConflict[];
};

/** Next `count` play dates from a cursor, logging every excluded candidate. */
function takeDates(
  from: string,
  playDows: number[],
  exclusions: Record<string, string>,
  count: number,
  division: string,
  skipped: SkippedWeek[],
): string[] {
  const dows = playDows.length ? [...new Set(playDows)].sort() : [parseISODate(from).getDay()];
  const out: string[] = [];
  const cursor = parseISODate(from);
  let guard = 0;
  while (out.length < count && guard++ < 4000) {
    if (dows.includes(cursor.getDay())) {
      const d = toISO(cursor);
      const reason = exclusions[d];
      if (reason) skipped.push({ division, date: d, reason });
      else out.push(d);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function swap(
  rounds: [FixtureTeam | null, FixtureTeam | null][][],
): [FixtureTeam | null, FixtureTeam | null][][] {
  return rounds.map((r) => r.map(([h, a]) => [a, h] as [FixtureTeam | null, FixtureTeam | null]));
}

export function generateSeasonFixtures(opts: SeasonOptions): SeasonPlanResult {
  const { divisions, startDate, exclusions, twoLegs, secondLegStart } = opts;
  const maxHomePerNight = Math.max(1, opts.maxHomePerClubPerNight ?? 2);
  const skipped: SkippedWeek[] = [];
  const conflicts: SeasonConflict[] = [];
  const byDivision: Record<string, GeneratedFixture[]> = {};
  const all: GeneratedFixture[] = [];

  for (const plan of divisions) {
    if (plan.teams.length < 2) {
      conflicts.push({
        kind: "too-few-teams",
        division: plan.division,
        detail: `${plan.teams.length} team(s) — needs at least 2 to generate fixtures.`,
      });
      byDivision[plan.division] = [];
      continue;
    }

    const legOne = roundRobin(plan.teams);
    const legOneDates = takeDates(startDate, plan.playDows, exclusions, legOne.length, plan.division, skipped);

    let legTwo: [FixtureTeam | null, FixtureTeam | null][][] = [];
    let legTwoDates: string[] = [];
    if (twoLegs) {
      legTwo = swap(legOne);
      const lastLegOne = legOneDates[legOneDates.length - 1] ?? startDate;
      const nextDay = parseISODate(lastLegOne);
      nextDay.setDate(nextDay.getDate() + 1);
      const resume =
        secondLegStart && secondLegStart > toISO(nextDay) ? secondLegStart : toISO(nextDay);
      legTwoDates = takeDates(resume, plan.playDows, exclusions, legTwo.length, plan.division, skipped);
    }

    const rounds = [...legOne, ...legTwo];
    const dates = [...legOneDates, ...legTwoDates];
    const rows: GeneratedFixture[] = [];

    rounds.forEach((pairs, idx) => {
      const date = dates[idx];
      if (!date) return;
      const leg: 1 | 2 = idx < legOne.length ? 1 : 2;
      for (const [home, away] of pairs) {
        if (!home || !away) continue;
        rows.push({
          fixture_date: date,
          venue_name: home.club_name,
          division: plan.division,
          home_team_id: home.team_id,
          away_team_id: away.team_id,
          home_team_code: home.team_code || home.team_name,
          away_team_code: away.team_code || away.team_name,
          home_team_name: home.team_name,
          away_team_name: away.team_name,
          leg,
          round_number: idx + 1,
        });
      }
    });

    byDivision[plan.division] = rows;
    all.push(...rows);

    // home/away balance within the division
    const homeCount = new Map<string, number>();
    const awayCount = new Map<string, number>();
    for (const f of rows) {
      homeCount.set(f.home_team_id, (homeCount.get(f.home_team_id) ?? 0) + 1);
      awayCount.set(f.away_team_id, (awayCount.get(f.away_team_id) ?? 0) + 1);
    }
    for (const t of plan.teams) {
      const h = homeCount.get(t.team_id) ?? 0;
      const a = awayCount.get(t.team_id) ?? 0;
      if (Math.abs(h - a) > 1) {
        conflicts.push({
          kind: "home-away-uneven",
          division: plan.division,
          detail: `${t.team_name}: ${h} home vs ${a} away.`,
        });
      }
    }
  }

  // venue clashes: a club may host up to `maxHomePerClubPerNight` fixtures on one
  // night (2 by default); anything above that is flagged.
  const venueMap = new Map<string, GeneratedFixture[]>();
  for (const f of all) {
    const key = `${f.fixture_date}|${f.venue_name}`;
    venueMap.set(key, [...(venueMap.get(key) ?? []), f]);
  }
  for (const [key, rows] of venueMap) {
    if (rows.length > maxHomePerNight) {
      const [date, venue] = key.split("|");
      conflicts.push({
        kind: "venue-clash",
        division: [...new Set(rows.map((r) => r.division))].join(", "),
        detail: `${venue} hosts ${rows.length} fixtures on ${date} (max ${maxHomePerNight} per night).`,
      });
    }
  }

  // a team playing twice in the same week
  const teamWeek = new Map<string, GeneratedFixture[]>();
  for (const f of all) {
    for (const [id, name] of [
      [f.home_team_id, f.home_team_name],
      [f.away_team_id, f.away_team_name],
    ] as const) {
      const key = `${weekStart(f.fixture_date)}|${id}|${name}`;
      teamWeek.set(key, [...(teamWeek.get(key) ?? []), f]);
    }
  }
  for (const [key, rows] of teamWeek) {
    if (rows.length > 1) {
      const [wk, , name] = key.split("|");
      conflicts.push({
        kind: "team-double-booked",
        division: rows[0].division,
        detail: `${name} plays ${rows.length} times in the week of ${wk}.`,
      });
    }
  }

  return { fixtures: all, byDivision, skipped, conflicts };
}
