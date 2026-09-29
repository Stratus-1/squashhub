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
  /** Level tie: split = half the bonus each, both = full bonus each, none. */
  drawRule: DrawRule;
  /** Ordered tie-breaks when team totals are level. */
  tieBreaks: TieBreak[];
  /** How a level final (points reset) is decided. */
  finalLevelRule: FinalLevelRule;
  /** How doubles pairs form: fixed team positions or seeded by singles results. */
  doublesPairing: DoublesPairing;
};

export type DrawRule = "split" | "both" | "none";
export type TieBreak = "most_wins" | "games_won" | "points_diff" | "head_to_head";
export type FinalLevelRule = "games_won" | "last_game" | "organiser";

export const DRAW_RULE_LABEL: Record<DrawRule, string> = {
  split: "Split the bonus (e.g. 2.5 each)",
  both: "Both teams get the full bonus",
  none: "No bonus for a draw",
};
export const TIE_BREAK_LABEL: Record<TieBreak, string> = {
  most_wins: "Most ties won",
  games_won: "Most individual games won",
  points_diff: "Best points difference",
  head_to_head: "Head-to-head result",
};
export const FINAL_LEVEL_LABEL: Record<FinalLevelRule, string> = {
  games_won: "Most individual games won",
  last_game: "Winner of the last game (#1+#2 doubles)",
  organiser: "Organiser decides",
};
/** Doubles pairing: the email's fixed positions, or seeded by singles results. */
export type DoublesPairing = "position" | "singles_results";
export const DOUBLES_PAIRING_LABEL: Record<DoublesPairing, string> = {
  position: "Fixed by team position (#5+#6, #3+#4, #1+#2) — as in the email",
  singles_results: "By singles results (each team's top two scorers pair up, then the next two)",
};

export const DIAMOND_TEAM_DEFAULTS: TeamLeagueConfig = {
  playersPerTeam: 6,
  singlesMinutes: 20,
  doublesMinutes: 30,
  winBonus: 5,
  startTime: "17:45",
  endTime: "21:15",
  courts: 4,
  drawRule: "split",
  tieBreaks: ["most_wins"],
  finalLevelRule: "games_won",
  doublesPairing: "singles_results",
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

export type DiamondTeam = { id: string; name: string; pool: "A" | "B"; players: (string | null)[] };
export type DiamondTie = { id: string; home: string; away: string; court: number; label?: string };
export type DiamondWeek = { week: number; date: string; stage: "pool" | "semi" | "final"; ties: DiamondTie[] };

/** Build the pool weeks shown in setup and persisted for scoring. */
export function buildPoolWeeks(teams: DiamondTeam[], dates: string[], courts: number): DiamondWeek[] {
  const pools = { A: teams.filter((team) => team.pool === "A"), B: teams.filter((team) => team.pool === "B") };
  const rounds = { A: poolRounds(pools.A.length), B: poolRounds(pools.B.length) };
  const count = Math.max(rounds.A.length, rounds.B.length);
  const courtCount = Math.max(1, courts);
  return Array.from({ length: count }, (_, roundIndex) => {
    const ties: DiamondTie[] = [];
    (["A", "B"] as const).forEach((pool) => {
      (rounds[pool][roundIndex] || []).forEach(([a, b]) => {
        const home = pools[pool][a - 1];
        const away = pools[pool][b - 1];
        if (!home || !away) return;
        ties.push({ id: `p${roundIndex + 1}-${home.id}-${away.id}`, home: home.id, away: away.id,
          court: (ties.length % courtCount) + 1, label: `${pool}${a} v ${pool}${b}` });
      });
    });
    return { week: roundIndex + 1, date: dates[roundIndex] || "", stage: "pool", ties };
  });
}

export type GameScore = { home: number; away: number } | null;

export type TieResult = {
  complete: boolean;
  homePoints: number;
  awayPoints: number;
  winner: "home" | "away" | "draw" | null;
  homeBonus: number;
  awayBonus: number;
  homeGames: number;
  awayGames: number;
};

/** Decide a level final (points reset). Returns null when the organiser decides or still level. */
export function decideLevelFinal(scores: GameScore[], r: TieResult, rule: FinalLevelRule): "home" | "away" | null {
  if (r.winner !== "draw") return r.winner === "home" || r.winner === "away" ? r.winner : null;
  if (rule === "games_won") return r.homeGames > r.awayGames ? "home" : r.awayGames > r.homeGames ? "away" : null;
  if (rule === "last_game") {
    const last = scores[scores.length - 1];
    if (!last || last.home === last.away) return null;
    return last.home > last.away ? "home" : "away";
  }
  return null;
}

/**
 * Tie total. A level tie gets NO bonus until the organiser confirms the rule
 * (`drawBonus` left undefined = draw is reported, no bonus awarded).
 */
export function tieResult(scores: GameScore[], games: number, winBonus: number, drawBonus?: number | DrawRule): TieResult {
  const played = scores.filter(Boolean) as { home: number; away: number }[];
  const homePoints = played.reduce((s, g) => s + g.home, 0);
  const awayPoints = played.reduce((s, g) => s + g.away, 0);
  const complete = played.length === games;
  let winner: TieResult["winner"] = null;
  if (complete) winner = homePoints > awayPoints ? "home" : awayPoints > homePoints ? "away" : "draw";
  const d = typeof drawBonus === "number" ? drawBonus
    : drawBonus === "split" ? winBonus / 2 : drawBonus === "both" ? winBonus : 0;
  const homeGames = played.filter((g) => g.home > g.away).length;
  const awayGames = played.filter((g) => g.away > g.home).length;
  return {
    complete, homePoints, awayPoints, winner, homeGames, awayGames,
    homeBonus: winner === "home" ? winBonus : winner === "draw" ? d : 0,
    awayBonus: winner === "away" ? winBonus : winner === "draw" ? d : 0,
  };
}

export type StandingRow = {
  teamId: string; played: number; won: number; points: number; against: number;
  bonus: number; games: number; total: number;
};

export type TieRecord = { homeId: string; awayId: string; result: TieResult };

/**
 * Team table. `carry` totals are added in (semis carry pool totals). Level
 * totals are separated only by the configured tie-breaks; anything still level
 * is reported in `undecided` — never guessed.
 */
export function standings(teamIds: string[], ties: TieRecord[], carry?: Map<string, number>, tieBreaks: TieBreak[] = []) {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, points: 0, against: 0, bonus: 0, games: 0, total: carry?.get(id) ?? 0 }]),
  );
  const done = ties.filter((t) => t.result.complete);
  for (const t of done) {
    const h = rows.get(t.homeId), a = rows.get(t.awayId);
    const r = t.result;
    if (h) { h.played++; h.points += r.homePoints; h.against += r.awayPoints; h.bonus += r.homeBonus; h.games += r.homeGames; h.total += r.homePoints + r.homeBonus; if (r.winner === "home") h.won++; }
    if (a) { a.played++; a.points += r.awayPoints; a.against += r.homePoints; a.bonus += r.awayBonus; a.games += r.awayGames; a.total += r.awayPoints + r.awayBonus; if (r.winner === "away") a.won++; }
  }
  const h2h = (x: string, y: string) => {
    let s = 0;
    for (const t of done) {
      if (t.homeId === x && t.awayId === y) s += t.result.winner === "home" ? 1 : t.result.winner === "away" ? -1 : 0;
      if (t.homeId === y && t.awayId === x) s += t.result.winner === "away" ? 1 : t.result.winner === "home" ? -1 : 0;
    }
    return s;
  };
  const cmp = (x: StandingRow, y: StandingRow, group: number) => {
    if (y.total !== x.total) return y.total - x.total;
    for (const tb of tieBreaks) {
      const d = tb === "most_wins" ? y.won - x.won
        : tb === "games_won" ? y.games - x.games
        : tb === "points_diff" ? (y.points - y.against) - (x.points - x.against)
        : group === 2 ? -h2h(x.teamId, y.teamId) : 0;
      if (d) return d;
    }
    return 0;
  };
  const byTotal = [...rows.values()].sort((x, y) => y.total - x.total);
  const sorted: StandingRow[] = [];
  const undecided: string[][] = [];
  for (let i = 0; i < byTotal.length; ) {
    let j = i;
    while (j + 1 < byTotal.length && byTotal[j + 1].total === byTotal[i].total) j++;
    const grp = byTotal.slice(i, j + 1).sort((x, y) => cmp(x, y, j - i + 1));
    sorted.push(...grp);
    for (let k = 0; k < grp.length - 1; k++) {
      if (cmp(grp[k], grp[k + 1], grp.length) === 0) {
        const last = undecided[undecided.length - 1];
        if (last && last.includes(grp[k].teamId)) last.push(grp[k + 1].teamId);
        else undecided.push([grp[k].teamId, grp[k + 1].teamId]);
      }
    }
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

export type SlotTeam = { id: string; players: (string | null)[] };

/**
 * Places registered players into empty team slots by strength.
 * `ordered` is strongest first. Tier k (players k*T..k*T+T-1) fills slot #k+1,
 * snaking across teams so strength is spread evenly. Locked slots (admin
 * placements, key `teamId:index`) are never touched; players no longer in
 * `ordered` are removed from unlocked slots and reported in `removed`.
 */
export function autoSlotPlayers(ordered: string[], teams: SlotTeam[], locked: Set<string> = new Set()) {
  const keep = new Set(ordered);
  const removed: string[] = [];
  const next = teams.map((t) => ({
    ...t,
    players: t.players.map((p, i) => {
      if (p && !keep.has(p) && !locked.has(`${t.id}:${i}`)) { removed.push(p); return null; }
      return p;
    }),
  }));
  const placed = new Set(next.flatMap((t) => t.players.filter(Boolean) as string[]));
  const queue = ordered.filter((id) => !placed.has(id));
  const size = Math.max(0, ...next.map((t) => t.players.length));
  const T = next.length;
  for (let slot = 0; slot < size && queue.length; slot++) {
    const order = slot % 2 === 0 ? [...Array(T).keys()] : [...Array(T).keys()].reverse();
    for (const ti of order) {
      if (!queue.length) break;
      const t = next[ti];
      if (slot < t.players.length && !t.players[slot] && !locked.has(`${t.id}:${slot}`)) t.players[slot] = queue.shift()!;
    }
  }
  return { teams: next, unplaced: queue, removed };
}
