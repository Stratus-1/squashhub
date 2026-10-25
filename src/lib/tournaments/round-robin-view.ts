/**
 * Read-only round-robin pool view model (Riverside pilot).
 * Builds BOTH the player-v-player matrix and the round-by-round order of play
 * from the same saved matches, so they can never disagree. Never writes data,
 * never invents dates/times/courts: only saved values or an explicit play-by.
 * Ranking order comes from the caller's existing standings (official rules);
 * this module does not recalculate standings.
 */
import { gameSetsOf } from "@/lib/tournaments/tie-breaks";
import { isVoidResult } from "@/lib/tournaments/forfeit";
import { roundRobin } from "@/lib/tournaments/contract";

export interface RRPlayer { id: string; name: string }
export interface RRMatchInput {
  id: string; round: number | null; a: string | null; b: string | null;
  winner?: string | null; score?: string | null; status?: string | null; isBye?: boolean;
  gameScores?: unknown;
  forfeitMemberId?: string | null;
  date?: string | null; time?: string | null; court?: string | null; playBy?: string | null;
}
export type RRStatus = "played" | "to_play" | "bye";
export interface RRCell { matchId: string; round: number | null; result: "W" | "L" | null; score: string | null; status: RRStatus; setSummary?: string | null; live?: boolean; slot?: string | null }
export interface RRRoundMatch { id: string; a: string | null; b: string | null; aName: string; bName: string; posA: number | null; posB: number | null; winner: string | null; score: string | null; status: RRStatus; when: string; date?: string | null; time?: string | null; court?: string | null; playBy?: string | null }
export interface RRRound { round: number | null; label: string; matches: RRRoundMatch[]; sittingOut: string[]; status: "complete" | "in_progress" | "not_started" }
export interface RRTotals { played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number; pointsKnown: boolean; gamesFor: number; gamesAgainst: number }
export interface RRPoolView { pointsScoring?: boolean; players: RRPlayer[]; matrix: Record<string, Record<string, RRCell | null>>; totals: Record<string, RRTotals>; rank: Record<string, number>; complete: boolean; rounds: RRRound[]; issues: string[] }

const isPlayed = (m: RRMatchInput) => m.status === "completed";

function savedGamePayload(m: RRMatchInput): unknown {
  let payload = m.gameScores;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  return Array.isArray(payload) ? { sets: payload } : payload;
}

/** Same recorded-set parser as official tie-breaks; current/live points are excluded. */
function savedGames(m: RRMatchInput) {
  return gameSetsOf({ game_scores: savedGamePayload(m), score: m.score });
}

/** Display only: use recorded completed sets, never infer scores from the winner. */
export function rrSetSummary(m: RRMatchInput, flip = false): string | null {
  const { sets } = savedGames(m);
  if (!sets?.length) return null;
  const a = sets.filter(s => s.a > s.b).length;
  const b = sets.filter(s => s.b > s.a).length;
  if (a + b === 0) return null;
  return flip ? `${b}–${a}` : `${a}–${b}`;
}

/** Score "15-18" from player A's side, as saved. Returns null when unparsable. */
export function parseScore(score?: string | null): [number, number] | null {
  const mm = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(score ?? "");
  return mm ? [Number(mm[1]), Number(mm[2])] : null;
}

/** Compact saved slot for a matrix cell: "14 Oct 18:20 C2"; null when nothing saved. */
export function rrSlot(m: Pick<RRMatchInput, "date" | "time" | "court">): string | null {
  if (!m.date) return null;
  const [, mo, da] = m.date.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  const court = m.court ? (m.court.match(/\d+/)?.[0] ? `C${m.court.match(/\d+/)![0]}` : m.court) : null;
  return [`${da} ${mon ?? ""}`.trim(), m.time?.slice(0, 5), court].filter(Boolean).join(" ");
}

/** Compact play-by fallback for a matrix cell: "by 19 Oct"; null when none saved. */
export function rrPlayBySlot(m: Pick<RRMatchInput, "date" | "playBy">): string | null {
  if (m.date || !m.playBy) return null;
  const [, mo, da] = m.playBy.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  return `by ${da} ${mon ?? ""}`.trim();
}

/** Saved schedule only: "Wed 14 Oct 18:20 · Court 2", "Play by 25 Nov", or "Not scheduled". */
export function rrWhen(m: Pick<RRMatchInput, "date" | "time" | "court" | "playBy">): string {
  const day = (d: string) => {
    const [y, mo, da] = d.split("-").map(Number);
    if (!y) return d;
    const dt = new Date(Date.UTC(y, mo - 1, da));
    return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()]} ${da} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]}`;
  };
  if (m.date) return [day(m.date) + (m.time ? ` ${m.time.slice(0, 5)}` : ""), m.court].filter(Boolean).join(" · ");
  if (m.playBy) return `Play by ${day(m.playBy)}`;
  return "Not scheduled";
}

/** Project legacy pool rounds into the configured stage, never changing saved fixtures or slots. */
export function stageRoundProjection(players: RRPlayer[], matches: RRMatchInput[], count?: number): RRMatchInput[] {
  if (!count || !Number.isInteger(count)) return matches;
  const ids = players.map(p => p.id);
  const expected = ids.length % 2 ? ids.length : ids.length - 1;
  if (count !== expected || matches.some(m => m.isBye || !m.a || !m.b || !ids.includes(m.a) || !ids.includes(m.b))) return matches;
  const pair = (a: string, b: string) => JSON.stringify([a, b].sort());
  const keys = matches.map(m => pair(m.a ?? "", m.b ?? ""));
  if (matches.length !== ids.length * (ids.length - 1) / 2 || new Set(keys).size !== keys.length) return matches;
  const saved = new Map<number, RRMatchInput[]>();
  for (const m of matches) {
    if (m.round == null) return matches;
    saved.set(m.round, [...(saved.get(m.round) ?? []), m]);
  }
  const balanced = saved.size === count && [...saved.values()].every(ms =>
    ms.length === Math.floor(ids.length / 2) && new Set(ms.flatMap(m => [m.a, m.b])).size === ms.length * 2);
  let groups: RRMatchInput[][];
  if (balanced) groups = [...saved.entries()].sort(([a], [b]) => a - b).map(([, ms]) => ms);
  else {
    // Four players have one unique partition into three complementary match pairs.
    // Larger conflicting schedules have multiple possible partitions: do not guess.
    if (ids.length !== 4) return matches;
    const lookup = new Map(matches.map(m => [pair(m.a ?? "", m.b ?? ""), m]));
    const planned = new Map<number, RRMatchInput[]>();
    for (const fixture of roundRobin(ids)) {
      const m = lookup.get(pair(fixture.a, fixture.b));
      if (!m) return matches;
      planned.set(fixture.round, [...(planned.get(fixture.round) ?? []), m]);
    }
    groups = [...planned.values()].sort((a, b) => Math.min(...a.map(m => m.round ?? Infinity)) - Math.min(...b.map(m => m.round ?? Infinity)));
  }
  const roundOf = new Map(groups.flatMap((ms, i) => ms.map(m => [m.id, i + 1] as const)));
  return matches.map(m => ({ ...m, round: roundOf.get(m.id) ?? m.round }));
}

export function buildRoundRobinView(input: { players: RRPlayer[]; matches: RRMatchInput[]; rankOrder?: string[]; seedOrder?: string[]; stageRoundCount?: number; pointsScoring?: boolean }): RRPoolView {
  const issues: string[] = [];
  // Rows stay in fixed draw order (seedOrder) so games never jump boxes; rank is shown separately.
  const order = input.seedOrder?.length ? input.seedOrder : input.rankOrder?.length ? input.rankOrder : input.players.map((p) => p.id);
  const players = [...input.players].sort((x, y) => {
    const ix = order.indexOf(x.id), iy = order.indexOf(y.id);
    return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy);
  });
  const ids = new Set(players.map((p) => p.id));
  const projectedMatches = stageRoundProjection(players, input.matches, input.stageRoundCount);
  const name = (id: string | null) => (id ? players.find((p) => p.id === id)?.name ?? "Unknown player" : "Bye");
  const pos = (id: string | null) => (id ? players.findIndex((p) => p.id === id) + 1 || null : null);
  const matrix: RRPoolView["matrix"] = {};
  const totals: RRPoolView["totals"] = {};
  for (const p of players) { matrix[p.id] = {}; totals[p.id] = { played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointsKnown: true, gamesFor: 0, gamesAgainst: 0 }; for (const q of players) matrix[p.id][q.id] = null; }

  for (const m of projectedMatches) {
    if (m.isBye || !m.a || !m.b) continue;
    if (isVoidResult({ score: m.score })) continue;
    if (!ids.has(m.a) || !ids.has(m.b)) { issues.push(`Match ${m.id} has a player outside this pool.`); continue; }
    if (matrix[m.a][m.b]) issues.push(`${name(m.a)} v ${name(m.b)} appears more than once; the first saved match is shown.`);
    if (matrix[m.a][m.b]) continue;
    const played = isPlayed(m);
    const sc = parseScore(m.score);
    const { sets, pointsKnown } = savedGames(m);
    const payload = savedGamePayload(m);
    const walkover = !!m.forfeitMemberId || (typeof payload === "object" && payload !== null && "walkover" in payload && payload.walkover === true) || /w\/o|walkover|no show/i.test(m.score ?? "");
    const rallyPoints = !walkover && pointsKnown && sets?.length ? sets.reduce((sum, s) => [sum[0] + s.a, sum[1] + s.b] as [number, number], [0, 0] as [number, number]) : null;
    const cell = (me: string, opp: string, flip: boolean): RRCell => ({
      matchId: m.id, round: m.round, status: played ? "played" : "to_play",
      result: played && m.winner ? (m.winner === me ? "W" : "L") : null,
      setSummary: played ? rrSetSummary(m, flip) : null,
      live: !played && m.status === "in_progress",
      slot: rrSlot(m) ?? rrPlayBySlot(m),
      score: sc ? (flip ? `${sc[1]}-${sc[0]}` : `${sc[0]}-${sc[1]}`) : m.score ?? null,
    });
    matrix[m.a][m.b] = cell(m.a, m.b, false);
    matrix[m.b][m.a] = cell(m.b, m.a, true);
    if (played && (m.winner || input.pointsScoring)) {
      for (const [me, flip] of [[m.a, false], [m.b, true]] as const) {
        const t = totals[me]; t.played++;
        if (m.winner === me) t.wins++; else if (m.winner) t.losses++;
        if (sets?.length && !walkover) for (const st of sets) { const mine = flip ? st.b : st.a, theirs = flip ? st.a : st.b; if (mine > theirs) t.gamesFor++; else if (theirs > mine) t.gamesAgainst++; }
        if (rallyPoints) { t.pointsFor += flip ? rallyPoints[1] : rallyPoints[0]; t.pointsAgainst += flip ? rallyPoints[0] : rallyPoints[1]; }
        else if (!walkover) t.pointsKnown = false;
      }
    }
  }

  const byRound = new Map<number | null, RRMatchInput[]>();
  for (const m of projectedMatches) { const k = m.round ?? null; const ms = byRound.get(k) ?? []; ms.push(m); byRound.set(k, ms); }
  const rounds: RRRound[] = [...byRound.entries()].sort(([a], [b]) => (a ?? 1e9) - (b ?? 1e9)).map(([round, ms]) => {
    const matches = ms.map<RRRoundMatch>((m) => ({
      id: m.id, a: m.a, b: m.isBye ? null : m.b, aName: name(m.a), bName: m.isBye ? "Bye" : name(m.b),
      posA: pos(m.a), posB: m.isBye ? null : pos(m.b), winner: m.winner ?? null, score: m.score ?? null,
      status: m.isBye ? "bye" : isPlayed(m) ? "played" : "to_play", when: rrWhen(m),
      date: m.date ?? null, time: m.time ?? null, court: m.court ?? null, playBy: m.playBy ?? null,
    }));
    const inRound = new Set(ms.flatMap((m) => [m.a, m.b]).filter(Boolean) as string[]);
    const live = matches.filter((m) => m.status !== "bye");
    const done = live.filter((m) => m.status === "played").length;
    return {
      round, label: round == null ? "Unassigned round" : `Round ${round}`, matches,
      sittingOut: round == null ? [] : players.filter((p) => !inRound.has(p.id)).map((p) => p.name),
      status: live.length && done === live.length ? "complete" : done ? "in_progress" : "not_started",
    };
  });
  let rankIds = players.map((p) => p.id);
  if (input.seedOrder?.length) {
    if (input.rankOrder?.length) rankIds = [...rankIds].sort((x, y) => { const ix = input.rankOrder!.indexOf(x), iy = input.rankOrder!.indexOf(y); return (ix < 0 ? 1e9 : ix) - (iy < 0 ? 1e9 : iy); });
    else rankIds = [...rankIds].sort((x, y) => { const a = totals[x], b = totals[y];
      return (b.wins - a.wins) || ((b.gamesFor - b.gamesAgainst) - (a.gamesFor - a.gamesAgainst)) || (b.gamesFor - a.gamesFor) || ((b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)) || (order.indexOf(x) - order.indexOf(y)); });
  }
  const rank = Object.fromEntries(rankIds.map((id, i) => [id, i + 1]));
  const live = input.matches.filter((m) => !m.isBye && m.a && m.b && !isVoidResult({ score: m.score }));
  const complete = live.length > 0 && live.every((m) => isPlayed(m));
  return { players, matrix, totals, rank, complete, rounds, issues, pointsScoring: input.pointsScoring };
}

/** Fixed draw order from Round 1 pairings (circle method: 1vN, 2vN-1 …), independent of results. */
export function rrSeedOrder(matches: { round: number | null; a: string | null; b: string | null; isBye?: boolean }[], fallback: string[]): string[] {
  const r1 = matches.filter((m) => (m.round ?? 1) === Math.min(...matches.map((x) => x.round ?? 1)));
  const tops = r1.map((m) => m.a).filter(Boolean) as string[];
  const bottoms = r1.filter((m) => !m.isBye).map((m) => m.b).filter(Boolean).reverse() as string[];
  const out: string[] = [];
  for (const id of [...tops, ...bottoms, ...fallback]) if (!out.includes(id)) out.push(id);
  return out;
}
