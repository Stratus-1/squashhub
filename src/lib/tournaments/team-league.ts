/**
 * Diamond League (teams) — pure rules for a team pool competition.
 *
 * Teams of N ranked players (1 = strongest) meet in "ties". Every tie is
 * N singles (position v same position, lowest first) followed by N/2 doubles
 * (pairs from the bottom up: 5+6, 3+4, 1+2). All games are timed points games.
 * A tie is won on total points; the winner gets a bonus.
 *
 * Stages: pool round robin → crossover semis (points carry) → placing finals
 * (points reset). Tie-breaks are deliberately NOT invented: when totals are
 * level and no rule is configured, ranking reports `undecided`.
 */

export type TeamLeagueConfig = {
  playersPerTeam: number; // even, 2..8
  singlesMinutes: number;
  doublesMinutes: number;
  winBonus: number;
  startTime: string; // "17:45"
  endTime: string; // "21:15"
  courts: number;
};

export const DIAMOND_TEAM_DEFAULTS: TeamLeagueConfig = {
  playersPerTeam: 6,
  singlesMinutes: 20,
  doublesMinutes: 30,
  winBonus: 5,
  startTime: "17:45",
  endTime: "21:15",
  courts: 2,
};

export type TieGame =
  | { order: number; kind: "singles"; positions: [number] ; minutes: number }
  | { order: number; kind: "doubles"; positions: [number, number]; minutes: number };

export function configIssues(c: TeamLeagueConfig): string[] {
  const out: string[] = [];
  if (!Number.isInteger(c.playersPerTeam) || c.playersPerTeam < 2 || c.playersPerTeam > 8 || c.playersPerTeam % 2)
    out.push("Players per team must be an even number from 2 to 8.");
  if (c.singlesMinutes <= 0 || c.doublesMinutes <= 0) out.push("Game lengths must be more than 0 minutes.");
  if (c.courts < 1) out.push("At least one court is needed.");
  return out;
}

/** The fixed game order of one tie. */
export function tieGames(c: TeamLeagueConfig): TieGame[] {
  const n = c.playersPerTeam;
  const games: TieGame[] = [];
  let order = 1;
  for (let p = n; p >= 1; p--) games.push({ order: order++, kind: "singles", positions: [p], minutes: c.singlesMinutes });
  for (let p = n; p >= 2; p -= 2)
    games.push({ order: order++, kind: "doubles", positions: [p - 1, p], minutes: c.doublesMinutes });
  return games;
}

export const gameLabel = (g: TieGame) =>
  g.kind === "singles" ? `Singles #${g.positions[0]}` : `Doubles #${g.positions[0]}+#${g.positions[1]}`;

/** Round-robin weeks for one pool. Slots are 1-based seeds ("A1" = slot 1). */
export function poolRounds(size: number): [number, number][][] {
  if (size === 4) {
    // Exactly as the organiser's email: A1vA4 A2vA3 / A1vA2 A3vA4 / A1vA3 A2vA4
    return [
      [[1, 4], [2, 3]],
      [[1, 2], [3, 4]],
      [[1, 3], [2, 4]],
    ];
  }
  // Circle method for other sizes (bye when odd).
  const slots = Array.from({ length: size % 2 ? size + 1 : size }, (_, i) => i + 1);
  const m = slots.length;
  const rounds: [number, number][][] = [];
  const arr = [...slots];
  for (let r = 0; r < m - 1; r++) {
    const round: [number, number][] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i], b = arr[m - 1 - i];
      if (a <= size && b <= size) round.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

/** Crossover semis for two pools of 4: A1vB2, A2vB1, A3vB4, A4vB3. */
export const CROSSOVER: { match: number; a: number; b: number }[] = [
  { match: 1, a: 1, b: 2 },
  { match: 2, a: 2, b: 1 },
  { match: 3, a: 3, b: 4 },
  { match: 4, a: 4, b: 3 },
];

/** Placing finals from semi results; points reset. */
export const PLACING_FINALS: { places: [number, number]; from: ["W" | "L", number, "W" | "L", number] }[] = [
  { places: [1, 2], from: ["W", 1, "W", 2] },
  { places: [3, 4], from: ["L", 1, "L", 2] },
  { places: [5, 6], from: ["W", 3, "W", 4] },
  { places: [7, 8], from: ["L", 3, "L", 4] },
];

export type GameScore = { home: number; away: number } | null;

export type TieResult = {
  complete: boolean;
  homePoints: number;
  awayPoints: number;
  winner: "home" | "away" | "draw" | null;
  homeBonus: number;
  awayBonus: number;
};

/**
 * Tie total. A level tie gets NO bonus until the organiser confirms the rule
 * (`drawBonus` left undefined = draw is reported, no bonus awarded).
 */
export function tieResult(scores: GameScore[], games: number, winBonus: number, drawBonus?: number): TieResult {
  const played = scores.filter(Boolean) as { home: number; away: number }[];
  const homePoints = played.reduce((s, g) => s + g.home, 0);
  const awayPoints = played.reduce((s, g) => s + g.away, 0);
  const complete = played.length === games;
  let winner: TieResult["winner"] = null;
  if (complete) winner = homePoints > awayPoints ? "home" : awayPoints > homePoints ? "away" : "draw";
  const d = drawBonus ?? 0;
  return {
    complete, homePoints, awayPoints, winner,
    homeBonus: winner === "home" ? winBonus : winner === "draw" ? d : 0,
    awayBonus: winner === "away" ? winBonus : winner === "draw" ? d : 0,
  };
}

export type StandingRow = { teamId: string; played: number; points: number; bonus: number; total: number };

export type TieRecord = { homeId: string; awayId: string; result: TieResult };

/** Team table. `carry` rows are added in (semis carry pool totals). */
export function standings(teamIds: string[], ties: TieRecord[], carry?: Map<string, number>) {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, points: 0, bonus: 0, total: carry?.get(id) ?? 0 }]),
  );
  for (const t of ties) {
    if (!t.result.complete) continue;
    const h = rows.get(t.homeId), a = rows.get(t.awayId);
    if (h) { h.played++; h.points += t.result.homePoints; h.bonus += t.result.homeBonus; h.total += t.result.homePoints + t.result.homeBonus; }
    if (a) { a.played++; a.points += t.result.awayPoints; a.bonus += t.result.awayBonus; a.total += t.result.awayPoints + t.result.awayBonus; }
  }
  const sorted = [...rows.values()].sort((x, y) => y.total - x.total);
  const undecided: string[][] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].total === sorted[i].total) j++;
    if (j > i) undecided.push(sorted.slice(i, j + 1).map((r) => r.teamId));
    i = j + 1;
  }
  return { rows: sorted, undecided };
}

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Night timing: ties run in parallel on separate courts when possible; games
 * inside one tie are played one after another in the fixed order.
 */
export function nightPlan(c: TeamLeagueConfig, tiesPerNight: number) {
  const tieMinutes = tieGames(c).reduce((s, g) => s + g.minutes, 0);
  const waves = Math.ceil(tiesPerNight / Math.max(1, c.courts));
  const finish = toMin(c.startTime) + waves * tieMinutes;
  return { tieMinutes, finish: toHm(finish), overruns: finish > toMin(c.endTime) };
}
