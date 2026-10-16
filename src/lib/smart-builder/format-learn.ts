/**
 * Format learning previews — pure, fictional, read-only examples for the
 * Tournament Structure format palette. Nothing here touches saved data,
 * fixtures or the engine; numbers are invented teaching examples that follow
 * the same rules as the real SquashHub engines:
 *  - Round robin standings: matches won → game difference → games for → points difference.
 *  - Swiss: 1 point per match win, Buchholz then seed tie-breaks (swiss-standings.ts);
 *    next-round pairings are flexible, by accumulated score, avoiding rematches.
 *  - Knockout / Monrad: seeded brackets via seededOrder (seeded-bracket.ts).
 */
import { swissTable, type SwissGame } from "@/lib/tournaments/swiss-standings";
import { seededOrder } from "@/lib/tournaments/seeded-bracket";

export type LearnFormat = "round_robin" | "swiss" | "knockout" | "monrad" | "cross_league";

export interface LearnGame { a: string; b: string; score: string; winner: string }
export interface LearnRound { key: string; label: string; note?: string; games: LearnGame[] }
export interface LearnStanding { name: string; played: number; won: number; lost: number; gf: number; ga: number; gd: number; pf: number; pa: number; pd: number; points: number }

export interface LearnExample {
  format: LearnFormat;
  title: string;
  tagline: string;
  whenToUse: string;
  howItWorks: string[];
  engineNote: string;
  rounds: LearnRound[];
  standings?: { title: string; note?: string; rows: LearnStanding[] }[];
  positions?: { place: number; name: string; path: string }[];
}

const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

/** Fictional best-of-3 result; higher seed wins unless `upset`. */
function game(a: string, b: string, upset = false): LearnGame {
  const winner = upset ? b : a;
  const loser = upset ? a : b;
  return { a, b, score: upset ? "1-2" : "2-1", winner };
}

function rrStandings(players: string[], games: LearnGame[]): LearnStanding[] {
  const rows = new Map(players.map((p) => [p, { name: p, played: 0, won: 0, lost: 0, gf: 0, ga: 0, gd: 0, pf: 0, pa: 0, pd: 0, points: 0 }]));
  for (const g of games) {
    if (!rows.has(g.a) || !rows.has(g.b)) continue; // per-league tables skip cross-league opponents
    const [ga, gb] = g.score.split("-").map(Number);
    const A = rows.get(g.a)!, B = rows.get(g.b)!;
    A.played++; B.played++;
    A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga;
    A.pf += ga * 11 + (ga > gb ? 0 : 2); B.pf += gb * 11 + 2; A.pa += gb * 11 + 2; B.pa += ga * 11;
    const W = rows.get(g.winner)!, L = rows.get(g.winner === g.a ? g.b : g.a)!;
    W.won++; W.points += 2; L.lost++;
  }
  const out = [...rows.values()];
  out.forEach((r) => { r.gd = r.gf - r.ga; r.pd = r.pf - r.pa; });
  out.sort((x, y) => y.won - x.won || y.gd - x.gd || y.gf - x.gf || y.pd - x.pd || x.name.localeCompare(y.name));
  return out;
}

/** Classic circle-method rotation: n players, n−1 rounds, everyone plays everyone once. */
function circleRounds(players: string[]): [string, string][][] {
  const n = players.length;
  const list = players.slice(1);
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    const left = [players[0], ...list.slice(0, n / 2 - 1)];
    const right = list.slice(n / 2 - 1).reverse();
    for (let i = 0; i < left.length; i++) pairs.push([left[i], right[i]]);
    rounds.push(pairs);
    list.unshift(list.pop()!);
  }
  return rounds;
}

function roundRobinExample(): LearnExample {
  const players = names("P", 6);
  const rounds: LearnRound[] = circleRounds(players).map((pairs, r) => ({
    key: `r${r + 1}`,
    label: `Round ${r + 1}`,
    games: pairs.map(([a, b], i) => game(a, b, (r + i) % 4 === 3)),
  }));
  const all = rounds.flatMap((r) => r.games);
  return {
    format: "round_robin",
    title: "Round robin",
    tagline: "Everyone plays everyone once — a full, fair ranking of the group.",
    whenToUse: "Small groups and leagues where a complete ranking matters and courts are available for every pairing.",
    howItWorks: [
      "With 6 players there are 5 rounds; each round every player has exactly one match.",
      "The rotation guarantees nobody repeats an opponent and nobody sits out.",
      "Standings rank by matches won, then game difference, games for, then points difference.",
    ],
    engineNote: "SquashHub orders round-robin tables by matches won → game difference → games for → points difference → head-to-head. This example follows the same order.",
    rounds,
    standings: [{ title: "Final standings (after all 5 rounds)", rows: rrStandings(players, all) }],
  };
}

function swissExample(): LearnExample {
  const players = names("S", 8);
  // Round 1: top half vs bottom half (1v5, 2v6, 3v7, 4v8); higher seeds win.
  const r1 = [game("S1", "S5"), game("S2", "S6"), game("S3", "S7"), game("S4", "S8")];
  // Round 2: pair the 1-0 group together and the 0-1 group together, no rematches.
  const r2 = [game("S1", "S3"), game("S4", "S2", true), game("S5", "S7"), game("S6", "S8")];
  // Round 3: pair by accumulated points (2-0: S1,S4 · 1-1: S2,S3,S5,S6 · 0-2: S7,S8).
  const r3 = [game("S1", "S4"), game("S2", "S5"), game("S3", "S6", true), game("S7", "S8", true)];
  const rounds: LearnRound[] = [
    { key: "r1", label: "Round 1", note: "Seeded start: top half meets bottom half.", games: r1 },
    { key: "r2", label: "Round 2", note: "Winners meet winners, losers meet losers — no rematches.", games: r2 },
    { key: "r3", label: "Round 3", note: "Paired again by accumulated score.", games: r3 },
  ];
  const toSwiss = (gs: LearnGame[]): SwissGame[] => gs.map((g) => ({ a: g.a, b: g.b, winner: g.winner }));
  const cumulative = (upto: number) => rounds.slice(0, upto).flatMap((r) => toSwiss(r.games));
  const table = (upto: number) =>
    swissTable(players, cumulative(upto)).map((r) => ({ name: r.id, played: r.wins + r.losses, won: r.wins, lost: r.losses, gf: 0, ga: 0, gd: 0, pf: 0, pa: 0, pd: 0, points: r.points }));
  return {
    format: "swiss",
    title: "Swiss pairing",
    tagline: "A fixed number of rounds; after round 1, players meet opponents on the same score.",
    whenToUse: "Larger fields with limited rounds where everyone keeps playing and nobody is eliminated.",
    howItWorks: [
      "Round 1 is seeded: the top half plays the bottom half.",
      "After each round, players on equal points are paired together, avoiding rematches.",
      "A match win is 1 point. Ties break on Buchholz (opponents' points), then original seed.",
      "Unlike a bracket, the next round's pairings are NOT fixed — they depend on results.",
    ],
    engineNote: "This mirrors SquashHub's Swiss engine: flexible next-round pairings by accumulated results with rematch avoidance, and standings by points → Buchholz → seed.",
    rounds,
    standings: [
      { title: "Standings after Round 1", rows: table(1) },
      { title: "Standings after Round 2", rows: table(2) },
      { title: "Final standings after Round 3", note: "Points, then Buchholz, then seed.", rows: table(3) },
    ],
  };
}

function knockoutExample(): LearnExample {
  const players = names("K", 8);
  const order = seededOrder(8).map((s) => players[s - 1]);
  const qf: LearnGame[] = [];
  for (let i = 0; i < order.length; i += 2) qf.push(game(order[i], order[i + 1], i === 2));
  const sf = [game(qf[0].winner, qf[1].winner), game(qf[2].winner, qf[3].winner, true)];
  const final = [game(sf[0].winner, sf[1].winner)];
  const third = [game(sf[0].winner === sf[0].a ? sf[0].b : sf[0].a, sf[1].winner === sf[1].a ? sf[1].b : sf[1].a)];
  return {
    format: "knockout",
    title: "Knockout",
    tagline: "Single elimination: lose once and you are out of the title race.",
    whenToUse: "Finding a champion quickly, or as a playoff stage after pools or Swiss.",
    howItWorks: [
      "8 players make a seeded bracket: Quarterfinal → Semifinal → Final (7 matches).",
      "Seeds are spread (1 v 8, 4 v 5, 2 v 7, 3 v 6) so the best players meet late.",
      "Winners advance; losers are out. An optional 3rd-place match can rank the semifinal losers.",
    ],
    engineNote: "SquashHub spreads seeds with the same seeded bracket order used here. The bracket is fixed once drawn — unlike Swiss, pairings never depend on mid-event standings.",
    rounds: [
      { key: "qf", label: "Quarterfinals", games: qf },
      { key: "sf", label: "Semifinals", games: sf },
      { key: "f", label: "Final", games: final },
      { key: "3p", label: "3rd-place playoff (optional)", note: "Semifinal losers play for bronze.", games: third },
    ],
  };
}

function monradExample(): LearnExample {
  const players = names("M", 8);
  const order = seededOrder(8).map((s) => players[s - 1]);
  const qf: LearnGame[] = [];
  for (let i = 0; i < order.length; i += 2) qf.push(game(order[i], order[i + 1], i === 2));
  const w = qf.map((g) => g.winner);
  const l = qf.map((g) => (g.winner === g.a ? g.b : g.a));
  const r2 = [game(w[0], w[1]), game(w[2], w[3], true), game(l[0], l[1], true), game(l[2], l[3])];
  const r2w = r2.map((g) => g.winner);
  const r2l = r2.map((g) => (g.winner === g.a ? g.b : g.a));
  const r3 = [game(r2w[0], r2w[1]), game(r2l[0], r2l[1], true), game(r2w[2], r2w[3], true), game(r2l[2], r2l[3])];
  const pos = (g: LearnGame) => [g.winner, g.winner === g.a ? g.b : g.a];
  const [p1, p2] = pos(r3[0]); const [p3, p4] = pos(r3[1]); const [p5, p6] = pos(r3[2]); const [p7, p8] = pos(r3[3]);
  const path = (p: string) => {
    const r1r = qf.find((g) => g.a === p || g.b === p)!;
    const r2r = r2.find((g) => g.a === p || g.b === p)!;
    const r3r = r3.find((g) => g.a === p || g.b === p)!;
    const m = (g: LearnGame) => (g.winner === p ? "W" : "L");
    return `${m(r1r)} → ${m(r2r)} → ${m(r3r)}`;
  };
  return {
    format: "monrad",
    title: "Monrad (positional draw)",
    tagline: "A knockout-like bracket where losers keep playing until every place 1–8 is decided.",
    whenToUse: "Club champs and events that want full placings, not just a winner — e.g. after a Swiss stage.",
    howItWorks: [
      "Round 1 is a seeded quarterfinal, like a knockout.",
      "Winners continue in the championship bracket; losers drop into positional brackets.",
      "Everyone plays all 3 rounds (12 matches), and every finishing place 1–8 is earned on court.",
      "Non-power-of-two fields get byes for the top seeds in round 1.",
    ],
    engineNote: "Matches SquashHub's Monrad planning maths: 8 players → 3 rounds, 12 matches, all places decided. Losers' paths below show how each final position is reached.",
    rounds: [
      { key: "r1", label: "Round 1 (quarterfinals)", games: qf },
      { key: "r2", label: "Round 2 (semifinals + 5–8 bracket)", note: "Losers move into the 5th–8th bracket.", games: r2 },
      { key: "r3", label: "Round 3 (finals for every place)", games: r3 },
    ],
    positions: [
      { place: 1, name: p1, path: path(p1) }, { place: 2, name: p2, path: path(p2) },
      { place: 3, name: p3, path: path(p3) }, { place: 4, name: p4, path: path(p4) },
      { place: 5, name: p5, path: path(p5) }, { place: 6, name: p6, path: path(p6) },
      { place: 7, name: p7, path: path(p7) }, { place: 8, name: p8, path: path(p8) },
    ],
  };
}

function crossLeagueExample(): LearnExample {
  const A = names("A", 4);
  const B = names("B", 4);
  // 4 rounds: each A player meets each B player exactly once (rotation).
  const rounds: LearnRound[] = A.map((_, r) => ({
    key: `r${r + 1}`,
    label: `Round ${r + 1}`,
    games: A.map((a, i) => game(a, B[(i + r) % 4], (r + i) % 3 === 2)),
  }));
  const all = rounds.flatMap((r) => r.games);
  const combined = rrStandings([...A, ...B], all);
  return {
    format: "cross_league",
    title: "Cross league",
    tagline: "Two leagues play against each other instead of within themselves.",
    whenToUse: "Parallel leagues (e.g. two clubs or two sections) that should meet across the divide — like a home-and-away interleague.",
    howItWorks: [
      "Each player in League A plays every player in League B exactly once (4 rounds here).",
      "The rotation pairs A1–A4 against B1–B4 so no cross pairing repeats.",
      "Standings can be kept separate per league or combined into one table — that choice is configurable in the setup.",
    ],
    engineNote: "SquashHub's cross-league mode plays between the linked leagues only. Whether you read one combined table or a table per league is a display choice; this example shows both.",
    rounds,
    standings: [
      { title: "League A standings", rows: combined.filter((r) => A.includes(r.name)) },
      { title: "League B standings", rows: combined.filter((r) => B.includes(r.name)) },
      { title: "Combined standings (optional view)", note: "Both leagues ranked together.", rows: combined },
    ],
  };
}

export const LEARN_EXAMPLES: Record<LearnFormat, LearnExample> = {
  round_robin: roundRobinExample(),
  swiss: swissExample(),
  knockout: knockoutExample(),
  monrad: monradExample(),
  cross_league: crossLeagueExample(),
};

export const LEARN_FORMAT_LABEL: Record<LearnFormat, string> = {
  round_robin: "Round robin",
  swiss: "Swiss pairing",
  knockout: "Knockout",
  monrad: "Monrad (positional draw)",
  cross_league: "Cross league",
};
