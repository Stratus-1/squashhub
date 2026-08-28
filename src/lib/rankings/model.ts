// Ranking model — pure maths, no I/O.
//
// SOURCE OF TRUTH. A byte-identical copy lives at
// supabase/functions/_shared/ranking-model.ts (Deno can't import from src/).
// src/lib/rankings/model.sync.test.ts fails if the two files drift.
//
// A player earns points per rubber played. Points reflect WHERE they play
// (league level + string position), not just how often they win, so a strong
// player propping up a 5th-league side can't out-rank a 1st-league String 1.

export interface RankingSettings {
  win_points: number;
  loss_points: number;
  clean_sweep_bonus: number;
  close_loss_bonus: number;
  /** Each league level below the top multiplies by this (0.85 => 2nd league = 0.85). */
  league_step: number;
  /** Reserve teams are worth less than the equivalent main-team league. */
  reserve_factor: number;
  position_top_weight: number;
  /** Each string below #1 loses this much weight. */
  position_step: number;
  /** Only a player's best N rubbers count in a season. */
  best_n: number;
  /** Keyed by "seasons ago": {"0":1,"1":0.5,"2":0.25} */
  season_decay: Record<string, number>;
  /** How strongly opponent strength swings a result (0 = ignore opponent). */
  opponent_scale: number;
}

export const DEFAULT_RANKING_SETTINGS: RankingSettings = {
  win_points: 10,
  loss_points: 3,
  clean_sweep_bonus: 2,
  close_loss_bonus: 2,
  league_step: 0.85,
  reserve_factor: 0.7,
  position_top_weight: 1,
  position_step: 0.05,
  best_n: 12,
  season_decay: { "0": 1, "1": 0.5, "2": 0.25 },
  opponent_scale: 0.25,
};

export interface RubberInput {
  season_year: number;
  player_code: string;
  player_name?: string | null;
  category?: string | null;
  league_label?: string | null;
  team_code?: string | null;
  position?: number | null;
  won?: boolean | null;
  games_for?: number | null;
  games_against?: number | null;
  fixture_date: string;
  nsa_fixture_id?: number | null;
  opponent_code?: string | null;
}

export interface ScoredRubber extends RubberInput {
  base_points: number;
  league_weight: number;
  position_weight: number;
  opponent_factor: number;
  points: number;
}

const ORDINALS: Record<string, number> = {
  "1st": 1, first: 1, "1": 1,
  "2nd": 2, second: 2, "2": 2,
  "3rd": 3, third: 3, "3": 3,
  "4th": 4, fourth: 4, "4": 4,
  "5th": 5, fifth: 5, "5": 5,
  "6th": 6, sixth: 6, "6": 6,
  "7th": 7, seventh: 7, "7": 7,
  "8th": 8, eighth: 8, "8": 8,
};

export interface LeagueLevel {
  level: number;
  isReserve: boolean;
}

/** "2nd Reserve" -> { level: 2, isReserve: true }. Unknown labels fall back to level 3. */
export function parseLeagueLevel(label: string | null | undefined): LeagueLevel {
  const raw = (label ?? "").trim().toLowerCase();
  const isReserve = /\bres(erve)?\b/.test(raw);
  const cleaned = raw.replace(/\bres(erve)?\b/g, " ").trim();
  const token = cleaned.split(/\s+/).find((t) => ORDINALS[t] != null);
  const numeric = token ? ORDINALS[token] : Number(cleaned.match(/\d+/)?.[0] ?? NaN);
  const level = Number.isFinite(numeric) && numeric > 0 ? Math.min(numeric, 12) : 3;
  return { level, isReserve };
}

export function leagueWeight(label: string | null | undefined, s: RankingSettings): number {
  const { level, isReserve } = parseLeagueLevel(label);
  const base = Math.pow(s.league_step, level - 1);
  return round4(base * (isReserve ? s.reserve_factor : 1));
}

export function positionWeight(position: number | null | undefined, s: RankingSettings): number {
  const pos = position && position > 0 ? position : 1;
  return round4(Math.max(0.5, s.position_top_weight - (pos - 1) * s.position_step));
}

export function basePoints(r: RubberInput, s: RankingSettings): number {
  const gf = r.games_for ?? 0;
  const ga = r.games_against ?? 0;
  if (r.won) {
    return s.win_points + (ga === 0 ? s.clean_sweep_bonus : 0);
  }
  // Losses still reward turning up; taking it the distance earns a little more.
  const closeLoss = gf > 0 && gf >= ga - 1;
  return s.loss_points + (closeLoss ? s.close_loss_bonus : 0);
}

/**
 * Beating a stronger player is worth more. Uses the PREVIOUS ranking snapshot
 * so a run is stable (no order dependence within a recompute).
 */
export function opponentFactor(
  playerPrevScore: number | null | undefined,
  opponentPrevScore: number | null | undefined,
  s: RankingSettings,
): number {
  if (playerPrevScore == null || opponentPrevScore == null) return 1;
  const denom = Math.max(playerPrevScore, opponentPrevScore, 1);
  const gap = (opponentPrevScore - playerPrevScore) / denom;
  return round4(clamp(1 + s.opponent_scale * gap, 0.75, 1.25));
}

export function scoreRubber(
  r: RubberInput,
  s: RankingSettings,
  prevScores?: Record<string, number>,
): ScoredRubber {
  const base = basePoints(r, s);
  const lw = leagueWeight(r.league_label, s);
  const pw = positionWeight(r.position, s);
  const of = prevScores
    ? opponentFactor(
        prevScores[r.player_code],
        r.opponent_code ? prevScores[r.opponent_code] : undefined,
        s,
      )
    : 1;
  return {
    ...r,
    base_points: round4(base),
    league_weight: lw,
    position_weight: pw,
    opponent_factor: of,
    points: round4(base * lw * pw * of),
  };
}

export interface PlayerRanking {
  player_code: string;
  player_name: string | null;
  category: string | null;
  club_label: string | null;
  score: number;
  rubbers_counted: number;
  season_breakdown: Record<string, { score: number; counted: number; played: number }>;
}

export function seasonDecay(settings: RankingSettings, seasonsAgo: number): number {
  const v = settings.season_decay[String(seasonsAgo)];
  return typeof v === "number" ? v : 0;
}

/** Sum a season's best-N rubbers. */
export function seasonScore(points: number[], s: RankingSettings): { score: number; counted: number } {
  const sorted = [...points].sort((a, b) => b - a).slice(0, Math.max(1, s.best_n));
  return { score: round4(sorted.reduce((a, b) => a + b, 0)), counted: sorted.length };
}

/**
 * Build one ranking table. `currentSeason` anchors the decay window; rubbers
 * from seasons with zero decay weight are ignored entirely.
 */
export function buildRanking(
  rubbers: ScoredRubber[],
  s: RankingSettings,
  currentSeason: number,
): PlayerRanking[] {
  const byPlayer = new Map<string, ScoredRubber[]>();
  for (const r of rubbers) {
    if (seasonDecay(s, currentSeason - r.season_year) <= 0) continue;
    const list = byPlayer.get(r.player_code) ?? [];
    list.push(r);
    byPlayer.set(r.player_code, list);
  }

  const rows: PlayerRanking[] = [];
  for (const [code, list] of byPlayer) {
    const bySeason = new Map<number, ScoredRubber[]>();
    for (const r of list) {
      const arr = bySeason.get(r.season_year) ?? [];
      arr.push(r);
      bySeason.set(r.season_year, arr);
    }

    let total = 0;
    let counted = 0;
    const breakdown: PlayerRanking["season_breakdown"] = {};
    for (const [year, arr] of bySeason) {
      const decay = seasonDecay(s, currentSeason - year);
      const { score, counted: n } = seasonScore(arr.map((r) => r.points), s);
      const weighted = round4(score * decay);
      breakdown[String(year)] = { score: weighted, counted: n, played: arr.length };
      total += weighted;
      counted += n;
    }

    const latest = [...list].sort((a, b) => (a.fixture_date < b.fixture_date ? 1 : -1))[0];
    rows.push({
      player_code: code,
      player_name: latest?.player_name ?? null,
      category: latest?.category ?? null,
      club_label: latest?.team_code ?? null,
      score: round4(total),
      rubbers_counted: counted,
      season_breakdown: breakdown,
    });
  }

  return rows.sort((a, b) => b.score - a.score || a.player_code.localeCompare(b.player_code));
}

export interface RankedPlayer extends PlayerRanking {
  rank: number;
  previous_rank: number | null;
}

export function assignRanks(
  rows: PlayerRanking[],
  previousRanks?: Record<string, number>,
): RankedPlayer[] {
  return rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    previous_rank: previousRanks?.[row.player_code] ?? null,
  }));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
