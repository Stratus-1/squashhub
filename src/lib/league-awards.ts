/**
 * League awards / prize-giving analytics.
 *
 * Pure functions that turn raw league_match_results rows into per-player
 * award tables for a league (e.g. "1st League") across all its rounds.
 */

export type AwardMatchRow = {
  fixture_id: string;
  position: number | null;
  home_player_code: string | null;
  away_player_code: string | null;
  home_player_name: string | null;
  away_player_name: string | null;
  home_games_won: number | null;
  away_games_won: number | null;
  winner: string | null;
  is_forfeit?: boolean | null;
  game_scores?: any;
};

export type AwardFixtureMeta = {
  id: string;
  round_id: string | null;
  fixture_date: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
};

export type AwardRoundMeta = {
  id: string;
  name: string;
  round_number: number;
  round_date: string | null;
};

export type PlayerAward = {
  key: string;
  name: string;
  code: string | null;
  teams: string[];
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  fiveSetters: number;
  fiveSetterWins: number;
  sweeps: number; // 3-0 wins
  whitewashed: number; // 0-3 losses
  comebacks: number; // won after losing first two games
  forfeits: number;
  bestStreak: number;
  positions: number[];
  perRound: Record<number, { played: number; won: number }>;
};

export type ImprovementRow = {
  player: PlayerAward;
  firstLabel: string;
  lastLabel: string;
  firstWinPct: number;
  lastWinPct: number;
  delta: number;
  firstPlayed: number;
  lastPlayed: number;
};

/** Strip the trailing "round N" so "1st League round 2" groups with round 1. */
export function leagueLabelFromRoundName(name: string): string {
  return (name || "")
    .replace(/\s*[-–]?\s*round\s*\d+\s*$/i, "")
    .replace(/\s*\(\s*round\s*\d+\s*\)\s*$/i, "")
    .trim() || name;
}

function playerKey(code: string | null, name: string | null): string | null {
  const c = (code || "").trim().toUpperCase();
  const n = (name || "").trim().toLowerCase();
  if (c) return `c:${c}`;
  if (n) return `n:${n}`;
  return null;
}

function emptyPlayer(key: string, name: string, code: string | null): PlayerAward {
  return {
    key,
    name: name || code || "Unknown",
    code: code || null,
    teams: [],
    played: 0,
    won: 0,
    lost: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    fiveSetters: 0,
    fiveSetterWins: 0,
    sweeps: 0,
    whitewashed: 0,
    comebacks: 0,
    forfeits: 0,
    bestStreak: 0,
    positions: [],
    perRound: {},
  };
}

function parseGames(raw: any): { home: number; away: number }[] {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((g: any) => ({ home: Number(g?.home ?? 0) || 0, away: Number(g?.away ?? 0) || 0 }))
    .filter((g) => g.home > 0 || g.away > 0);
}

export function computePlayerAwards(
  matches: AwardMatchRow[],
  fixtures: Map<string, AwardFixtureMeta>,
  rounds: Map<string, AwardRoundMeta>,
): PlayerAward[] {
  const players = new Map<string, PlayerAward>();
  // chronological order for streaks
  const ordered = [...matches].sort((a, b) => {
    const fa = fixtures.get(a.fixture_id)?.fixture_date || "";
    const fb = fixtures.get(b.fixture_id)?.fixture_date || "";
    if (fa !== fb) return fa < fb ? -1 : 1;
    return (a.position ?? 0) - (b.position ?? 0);
  });
  const streaks = new Map<string, { current: number; best: number }>();

  for (const m of ordered) {
    const hg = Number(m.home_games_won ?? 0) || 0;
    const ag = Number(m.away_games_won ?? 0) || 0;
    if (!m.winner && hg === 0 && ag === 0) continue; // unplayed

    const fx = fixtures.get(m.fixture_id);
    const round = fx?.round_id ? rounds.get(fx.round_id) : undefined;
    const games = parseGames(m.game_scores);
    const totalGames = Math.max(games.length, hg + ag);

    for (const side of ["home", "away"] as const) {
      const code = side === "home" ? m.home_player_code : m.away_player_code;
      const name = side === "home" ? m.home_player_name : m.away_player_name;
      const key = playerKey(code, name);
      if (!key) continue;
      let p = players.get(key);
      if (!p) {
        p = emptyPlayer(key, (name || "").trim() || (code || "").trim(), (code || "").trim() || null);
        players.set(key, p);
      }
      if (!p.name && name) p.name = name;

      const team = side === "home" ? fx?.home_team_code : fx?.away_team_code;
      if (team && !p.teams.includes(team)) p.teams.push(team);

      const mine = side === "home" ? hg : ag;
      const theirs = side === "home" ? ag : hg;
      const isWin = m.winner ? m.winner === side : mine > theirs;

      p.played += 1;
      if (isWin) p.won += 1;
      else p.lost += 1;
      p.gamesWon += mine;
      p.gamesLost += theirs;
      if (m.is_forfeit) p.forfeits += 1;
      if (totalGames >= 5) {
        p.fiveSetters += 1;
        if (isWin) p.fiveSetterWins += 1;
      }
      if (isWin && mine >= 3 && theirs === 0) p.sweeps += 1;
      if (!isWin && mine === 0 && theirs >= 3) p.whitewashed += 1;
      if (m.position != null && !p.positions.includes(m.position)) p.positions.push(m.position);

      for (const g of games) {
        p.pointsFor += side === "home" ? g.home : g.away;
        p.pointsAgainst += side === "home" ? g.away : g.home;
      }

      // comeback: lost first two games, still won
      if (isWin && games.length >= 4) {
        const lostFirstTwo = games.slice(0, 2).every((g) => (side === "home" ? g.home < g.away : g.away < g.home));
        if (lostFirstTwo) p.comebacks += 1;
      }

      if (round) {
        const rn = round.round_number;
        const bucket = (p.perRound[rn] ||= { played: 0, won: 0 });
        bucket.played += 1;
        if (isWin) bucket.won += 1;
      }

      const st = streaks.get(key) || { current: 0, best: 0 };
      st.current = isWin ? st.current + 1 : 0;
      st.best = Math.max(st.best, st.current);
      streaks.set(key, st);
      p.bestStreak = st.best;
    }
  }

  return [...players.values()];
}

export function winPct(p: { played: number; won: number }): number {
  return p.played ? (p.won / p.played) * 100 : 0;
}

/** Ranking used for "who is No 1,2,3,4 in the league". */
export function rankPlayers(players: PlayerAward[]): PlayerAward[] {
  return [...players].sort((a, b) => {
    if (b.won !== a.won) return b.won - a.won;
    const wa = winPct(a);
    const wb = winPct(b);
    if (wb !== wa) return wb - wa;
    const ga = a.gamesWon - a.gamesLost;
    const gb = b.gamesWon - b.gamesLost;
    if (gb !== ga) return gb - ga;
    const pa = a.pointsFor - a.pointsAgainst;
    const pb = b.pointsFor - b.pointsAgainst;
    if (pb !== pa) return pb - pa;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Improvement between the first and the last round of the league
 * (min matches per round required so one-off results don't win it).
 */
export function computeImprovement(
  players: PlayerAward[],
  roundNumbers: number[],
  labels: Record<number, string>,
  minPerRound = 2,
): ImprovementRow[] {
  if (roundNumbers.length < 2) return [];
  const first = roundNumbers[0];
  const last = roundNumbers[roundNumbers.length - 1];
  const rows: ImprovementRow[] = [];
  for (const p of players) {
    const a = p.perRound[first];
    const b = p.perRound[last];
    if (!a || !b || a.played < minPerRound || b.played < minPerRound) continue;
    const firstWinPct = (a.won / a.played) * 100;
    const lastWinPct = (b.won / b.played) * 100;
    rows.push({
      player: p,
      firstLabel: labels[first] || `Round ${first}`,
      lastLabel: labels[last] || `Round ${last}`,
      firstWinPct,
      lastWinPct,
      delta: lastWinPct - firstWinPct,
      firstPlayed: a.played,
      lastPlayed: b.played,
    });
  }
  return rows.sort((x, y) => y.delta - x.delta);
}

export type TeamStanding = {
  code: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  gamesFor: number;
  gamesAgainst: number;
  points: number;
};

export function computeTeamStandings(
  fixtureResults: {
    fixture_id: string;
    home_total_games: number | null;
    away_total_games: number | null;
    home_total_points: number | null;
    away_total_points: number | null;
    winner: string | null;
  }[],
  fixtures: Map<string, AwardFixtureMeta>,
  teamNames: Map<string, string>,
): TeamStanding[] {
  const teams = new Map<string, TeamStanding>();
  const get = (code: string) => {
    let t = teams.get(code);
    if (!t) {
      t = {
        code,
        name: teamNames.get(code.toUpperCase()) || code,
        played: 0,
        won: 0,
        lost: 0,
        drawn: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        points: 0,
      };
      teams.set(code, t);
    }
    return t;
  };

  for (const r of fixtureResults) {
    const fx = fixtures.get(r.fixture_id);
    if (!fx?.home_team_code || !fx?.away_team_code) continue;
    const h = get(fx.home_team_code);
    const a = get(fx.away_team_code);
    h.played += 1;
    a.played += 1;
    h.gamesFor += Number(r.home_total_games ?? 0) || 0;
    h.gamesAgainst += Number(r.away_total_games ?? 0) || 0;
    a.gamesFor += Number(r.away_total_games ?? 0) || 0;
    a.gamesAgainst += Number(r.home_total_games ?? 0) || 0;
    h.points += Number(r.home_total_points ?? 0) || 0;
    a.points += Number(r.away_total_points ?? 0) || 0;
    if (r.winner === "home") {
      h.won += 1;
      a.lost += 1;
    } else if (r.winner === "away") {
      a.won += 1;
      h.lost += 1;
    } else {
      h.drawn += 1;
      a.drawn += 1;
    }
  }

  return [...teams.values()].sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    const dx = x.gamesFor - x.gamesAgainst;
    const dy = y.gamesFor - y.gamesAgainst;
    if (dy !== dx) return dy - dx;
    return x.name.localeCompare(y.name);
  });
}

/* ------------------------------------------------------------------ */
/* Position awards — best performer at No 1, 2, 3, 4, 5 ...            */
/* ------------------------------------------------------------------ */

export type PositionAward = {
  position: number;
  players: PlayerAward[];
};

/**
 * Best player per playing position (string 1, 2, 3 ...).
 * Only matches actually played at that position count towards the stats.
 */
export function computePositionAwards(
  matches: AwardMatchRow[],
  fixtures: Map<string, AwardFixtureMeta>,
  rounds: Map<string, AwardRoundMeta>,
  minPlayed = 1,
): PositionAward[] {
  const positions = [...new Set(matches.map((m) => m.position).filter((p): p is number => p != null))].sort(
    (a, b) => a - b,
  );
  return positions.map((position) => {
    const subset = matches.filter((m) => m.position === position);
    const players = computePlayerAwards(subset, fixtures, rounds).filter((p) => p.played >= minPlayed);
    return { position, players: rankPlayers(players) };
  });
}

/* ------------------------------------------------------------------ */
/* Team consistency — who played most often as a settled team          */
/* ------------------------------------------------------------------ */

export type TeamConsistency = {
  code: string;
  name: string;
  fixtures: number;
  /** Fixtures where every slot was filled by a regular squad member. */
  fullStrength: number;
  /** % of all slots across the season filled by regular squad members. */
  regularPct: number;
  /** Distinct players used over the season (lower = more settled). */
  playersUsed: number;
  /** Typical team size (slots per fixture). */
  teamSize: number;
  /** The regular squad names, most-used first. */
  core: string[];
};

export function computeTeamConsistency(
  matches: AwardMatchRow[],
  fixtures: Map<string, AwardFixtureMeta>,
  teamNames: Map<string, string>,
): TeamConsistency[] {
  // team code -> fixture id -> player names/keys used
  const byTeam = new Map<string, Map<string, string[]>>();
  const labelFor = new Map<string, string>();

  for (const m of matches) {
    const hg = Number(m.home_games_won ?? 0) || 0;
    const ag = Number(m.away_games_won ?? 0) || 0;
    if (!m.winner && hg === 0 && ag === 0) continue; // unplayed
    const fx = fixtures.get(m.fixture_id);
    if (!fx) continue;

    for (const side of ["home", "away"] as const) {
      const team = side === "home" ? fx.home_team_code : fx.away_team_code;
      if (!team) continue;
      const code = String(team).toUpperCase();
      const pcode = side === "home" ? m.home_player_code : m.away_player_code;
      const pname = side === "home" ? m.home_player_name : m.away_player_name;
      const key = playerKey(pcode, pname);
      if (!key) continue;
      if (!labelFor.has(key)) labelFor.set(key, (pname || "").trim() || (pcode || "").trim() || "Unknown");
      let fxMap = byTeam.get(code);
      if (!fxMap) byTeam.set(code, (fxMap = new Map()));
      const list = fxMap.get(m.fixture_id) || [];
      if (!list.includes(key)) list.push(key);
      fxMap.set(m.fixture_id, list);
    }
  }

  const out: TeamConsistency[] = [];
  for (const [code, fxMap] of byTeam) {
    const lineups = [...fxMap.values()].filter((l) => l.length > 0);
    if (!lineups.length) continue;
    const counts = new Map<string, number>();
    for (const l of lineups) for (const k of l) counts.set(k, (counts.get(k) || 0) + 1);
    const teamSize = Math.max(...lineups.map((l) => l.length));
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const coreKeys = new Set(ordered.slice(0, teamSize).map(([k]) => k));

    let slots = 0;
    let regularSlots = 0;
    let fullStrength = 0;
    for (const l of lineups) {
      slots += l.length;
      const reg = l.filter((k) => coreKeys.has(k)).length;
      regularSlots += reg;
      if (l.length === teamSize && reg === teamSize) fullStrength += 1;
    }

    out.push({
      code,
      name: teamNames.get(code) || code,
      fixtures: lineups.length,
      fullStrength,
      regularPct: slots ? (regularSlots / slots) * 100 : 0,
      playersUsed: counts.size,
      teamSize,
      core: [...coreKeys].map((k) => labelFor.get(k) || k),
    });
  }

  return out.sort((a, b) => {
    if (b.fullStrength !== a.fullStrength) return b.fullStrength - a.fullStrength;
    if (b.regularPct !== a.regularPct) return b.regularPct - a.regularPct;
    return a.playersUsed - b.playersUsed;
  });
}
