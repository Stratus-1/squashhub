/**
 * Two-leg (home + return) round-robin fixture generation at association level.
 *
 * Leg 1 is the home round, leg 2 the return round with venues swapped — the
 * shape the NSA season already runs. Play nights are weekly on chosen weekdays;
 * dates that fall on a skipped day (public holiday or club shutdown) push the
 * whole week forward rather than dropping the fixture.
 */
export type FixtureTeam = {
  team_id: string;
  team_name: string;
  team_code: string | null;
  club_id: string;
  club_name: string;
};

export type GeneratedFixture = {
  fixture_date: string;
  venue_name: string;
  division: string;
  home_team_id: string;
  away_team_id: string;
  home_team_code: string;
  away_team_code: string;
  home_team_name: string;
  away_team_name: string;
  leg: 1 | 2;
  round_number: number;
};

export type GenerateOptions = {
  /** Teams of ONE division/level. */
  teams: FixtureTeam[];
  division: string;
  /** First possible play date, ISO yyyy-mm-dd. */
  startDate: string;
  /** Weekday numbers 0..6 (Sun..Sat) the league plays on. */
  playDows: number[];
  /** ISO dates to avoid entirely. */
  skipDates: string[];
  /** Generate the return leg. */
  twoLegs?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Circle-method round robin. Returns rounds of [home, away] index pairs.
 * A bye is represented by `null` and dropped by the caller.
 */
export function roundRobin<T>(items: T[]): [T | null, T | null][][] {
  const list: (T | null)[] = [...items];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds: [T | null, T | null][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [T | null, T | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      // alternate home/away so a team doesn't always host
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // rotate, keeping the first fixed
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

/** Successive play dates honouring weekdays and skip dates. */
export function playDates(startDate: string, playDows: number[], skipDates: string[], count: number): string[] {
  const skip = new Set(skipDates);
  const dows = playDows.length ? [...new Set(playDows)].sort() : [parse(startDate).getDay()];
  const out: string[] = [];
  const cursor = parse(startDate);
  let guard = 0;
  while (out.length < count && guard++ < 4000) {
    if (dows.includes(cursor.getDay())) {
      const d = iso(cursor);
      if (!skip.has(d)) out.push(d);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function generateTwoLegFixtures(opts: GenerateOptions): GeneratedFixture[] {
  const { teams, division, startDate, playDows, skipDates, twoLegs = true } = opts;
  if (teams.length < 2) return [];
  const legOne = roundRobin(teams);
  const rounds = twoLegs
    ? [...legOne, ...legOne.map((r) => r.map(([h, a]) => [a, h] as [FixtureTeam | null, FixtureTeam | null]))]
    : legOne;
  const dates = playDates(startDate, playDows, skipDates, rounds.length);

  const out: GeneratedFixture[] = [];
  rounds.forEach((pairs, idx) => {
    const date = dates[idx];
    if (!date) return;
    const leg: 1 | 2 = idx < legOne.length ? 1 : 2;
    for (const [home, away] of pairs) {
      if (!home || !away) continue;
      out.push({
        fixture_date: date,
        venue_name: home.club_name,
        division,
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
  return out;
}
