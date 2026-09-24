// Tournament integrity engine (pure, no imports) — shared by the ai-help edge
// function and the web app (re-exported from src/lib/tournaments/integrity.ts).
//
// It answers two questions from AUTHORITATIVE data only (saved settings,
// registered pairs, completed POOL results):
//   1. checkTournamentIntegrity(): what is inconsistent, and why?
//   2. planRepair(): which changes restore the one provably-correct state?
// Every change is labelled `deterministic` (safe to self-heal) or `judgement`
// (a human must decide: a started/scored game would change, or ties/conflicts
// mean more than one correct answer exists).

export type IMatch = {
  id: string;
  group_number: number | null;
  pool_number: number | null;
  round_number?: number | null;
  stage: string | null;
  bracket_position?: number | null;
  placeholder_a?: string | null;
  placeholder_b?: string | null;
  player_a_member_id: string | null;
  partner_a_member_id: string | null;
  player_b_member_id: string | null;
  partner_b_member_id: string | null;
  status: string | null;
  winner_member_id: string | null;
  score: string | null;
  game_scores: string | null;
  side_a_points: number | null;
  side_b_points: number | null;
  is_bye?: boolean | null;
  updated_at?: string | null;
};

export type IEntry = { club_member_id: string; partner_member_id: string | null; group_number: number | null };

export type ISettings = {
  scoring_mode?: string | null;
  league_formats?: Record<string, string> | null;
  league_match_types?: Record<string, string> | null;
  league_playoffs?: Record<string, boolean> | null;
  league_playoff_modes?: Record<string, string> | null;
  pool_sizes?: Record<string, number[]> | null;
  doubles_rotation?: boolean | null;
};

export type ISnapshot = { settings: ISettings; matches: IMatch[]; entries: IEntry[] };

export type Finding = {
  code: "I1_DUPLICATE_QUALIFIER" | "I2_MISSING_QUALIFIER" | "I4_PAIR_BROKEN" | "I6_WRONG_SLOT" | "I7_EXTRA_POOL_GAMES" | "I9_SLOT_UNFILLED" | "I10_LOCKED_WRONG" | "I11_PREMATURE_FILL" | "I12_AMBIGUOUS_STANDINGS" | "I13_UNSUPPORTED_FORMAT";
  division: number;
  message: string;
  match_ids: string[];
  repairable: boolean;
};

export type Change = {
  match_id: string;
  op: "set_sides" | "clear_sides" | "delete_unplayed";
  kind: "deterministic" | "judgement";
  reason: string;
  expect_updated_at: string | null;
  before: Pick<IMatch, "player_a_member_id" | "partner_a_member_id" | "player_b_member_id" | "partner_b_member_id">;
  after: Pick<IMatch, "player_a_member_id" | "partner_a_member_id" | "player_b_member_id" | "partner_b_member_id"> | null;
};

export type IntegrityReport = {
  findings: Finding[];
  changes: Change[];
  deterministic: Change[];
  judgement: Change[];
  pools_complete: Record<string, boolean>;
  consistent: boolean;
};

const teamKey = (a: string | null, b: string | null) => [a, b].filter(Boolean).sort().join("+");

export function isLocked(m: IMatch): boolean {
  if (m.status && m.status !== "scheduled") return true;
  if (m.score && String(m.score).trim()) return true;
  if (m.side_a_points != null || m.side_b_points != null) return true;
  if (m.winner_member_id) return true;
  if (m.game_scores) {
    try {
      const g = typeof m.game_scores === "string" ? JSON.parse(m.game_scores) : m.game_scores;
      if ((g?.sets?.length ?? 0) > 0) return true;
      if (g?.current && ((g.current.a ?? 0) > 0 || (g.current.b ?? 0) > 0)) return true;
    } catch { return true; }
  }
  return false;
}

type Row = { key: string; a: string; b: string | null; played: number; won: number; gw: number; gl: number; pf: number; pa: number };

/** Pool standings from COMPLETED POOL games only — playoff rows never count. */
export function poolStandings(snapshot: ISnapshot, division: number, pool: number, pairOf: Map<string, string | null>) {
  const bells = snapshot.settings.scoring_mode === "time_capped_points";
  const games = snapshot.matches.filter((m) => m.stage === "group" && (m.group_number ?? 1) === division && m.pool_number === pool && !m.is_bye);
  const rows = new Map<string, Row>();
  const touch = (p: string | null) => {
    if (!p) return null;
    const partner = pairOf.get(p) ?? null;
    const k = teamKey(p, partner);
    if (!rows.has(k)) {
      const [a, b] = [p, partner].filter(Boolean).sort() as string[];
      rows.set(k, { key: k, a, b: b ?? null, played: 0, won: 0, gw: 0, gl: 0, pf: 0, pa: 0 });
    }
    return rows.get(k)!;
  };
  for (const m of games) {
    const A = touch(m.player_a_member_id), B = touch(m.player_b_member_id);
    if (!A || !B || m.status !== "completed") continue;
    A.played++; B.played++;
    const aWon = m.winner_member_id && (m.winner_member_id === m.player_a_member_id || m.winner_member_id === m.partner_a_member_id);
    if (m.winner_member_id) { if (aWon) A.won++; else B.won++; }
    if (bells) {
      const a = Number(m.side_a_points) || 0, b = Number(m.side_b_points) || 0;
      A.pf += a; A.pa += b; B.pf += b; B.pa += a;
    } else if (m.game_scores) {
      try {
        const sets = (JSON.parse(m.game_scores)?.sets ?? []) as { a?: number; b?: number }[];
        for (const s of sets) {
          const a = s.a || 0, b = s.b || 0;
          A.pf += a; A.pa += b; B.pf += b; B.pa += a;
          if (a > b) { A.gw++; B.gl++; } else if (b > a) { B.gw++; A.gl++; }
        }
      } catch { /* ignore */ }
    }
  }
  const cmp = (x: Row, y: Row) => bells
    ? (y.pf - x.pf) || ((y.pf - y.pa) - (x.pf - x.pa))
    : (y.gw - x.gw) || ((y.gw - y.gl) - (x.gw - x.gl)) || (y.won - x.won) || ((y.pf - y.pa) - (x.pf - x.pa));
  const sorted = [...rows.values()].sort(cmp);
  const complete = games.length > 0 && games.every((m) => m.status === "completed");
  const tiedPositions = new Set<number>();
  for (let i = 1; i < sorted.length; i++) if (cmp(sorted[i - 1], sorted[i]) === 0) { tiedPositions.add(i - 1); tiedPositions.add(i); }
  return { sorted, complete, tiedPositions, games };
}

export function checkTournamentIntegrity(snapshot: ISnapshot): IntegrityReport {
  const findings: Finding[] = [];
  const changes: Change[] = [];
  const pools_complete: Record<string, boolean> = {};
  const s = snapshot.settings;
  const divisions = [...new Set(snapshot.matches.map((m) => m.group_number ?? 1))];

  for (const div of divisions) {
    const dk = String(div);
    const isDoubles = (s.league_match_types?.[dk] ?? "") === "doubles" || snapshot.entries.some((e) => (e.group_number ?? 1) === div && !!e.partner_member_id);
    const pairOf = new Map<string, string | null>();
    for (const e of snapshot.entries.filter((x) => (x.group_number ?? 1) === div)) {
      pairOf.set(e.club_member_id, e.partner_member_id);
      if (e.partner_member_id) pairOf.set(e.partner_member_id, e.club_member_id);
    }
    const playoffs = snapshot.matches.filter((m) => (m.group_number ?? 1) === div && m.stage === "playoff_final");

    // I4 — fixed pairs must stay intact everywhere (unless rotation is configured).
    if (isDoubles && !s.doubles_rotation) {
      for (const m of snapshot.matches.filter((x) => (x.group_number ?? 1) === div)) {
        for (const side of ["a", "b"] as const) {
          const p = m[`player_${side}_member_id`], q = m[`partner_${side}_member_id`];
          if (!p) continue;
          const reg = pairOf.get(p);
          if (reg !== undefined && reg !== q) {
            const locked = isLocked(m);
            findings.push({ code: "I4_PAIR_BROKEN", division: div, match_ids: [m.id], repairable: !locked,
              message: `A game has a player with a partner who isn't their registered partner${locked ? " (game already started/scored)" : ""}.` });
            if (m.stage === "playoff_final") continue; // playoff sides are rebuilt below
            changes.push({ match_id: m.id, op: "set_sides", kind: locked ? "judgement" : "deterministic",
              reason: "Restore the registered doubles pair", expect_updated_at: m.updated_at ?? null,
              before: sides(m), after: { ...sides(m), [`partner_${side}_member_id`]: reg } as any });
          }
        }
      }
    }

    // I7 — extra pool games beyond a single round robin.
    const fmt = s.league_formats?.[dk] ?? "";
    const sizes = s.pool_sizes?.[dk] ?? [];
    if (fmt === "single_round_robin" && sizes.length) {
      sizes.forEach((n, i) => {
        const pool = i + 1;
        const games = snapshot.matches.filter((m) => m.stage === "group" && (m.group_number ?? 1) === div && m.pool_number === pool && !m.is_bye);
        const expected = (n * (n - 1)) / 2;
        if (games.length > expected) {
          const seen = new Set<string>();
          const extras: IMatch[] = [];
          for (const g of [...games].sort((x, y) => (x.round_number ?? 0) - (y.round_number ?? 0))) {
            const k = [teamKey(g.player_a_member_id, g.partner_a_member_id), teamKey(g.player_b_member_id, g.partner_b_member_id)].sort().join("|");
            if (seen.has(k)) extras.push(g); else seen.add(k);
          }
          if (extras.length) {
            findings.push({ code: "I7_EXTRA_POOL_GAMES", division: div, match_ids: extras.map((e) => e.id), repairable: extras.every((e) => !isLocked(e)),
              message: `Pool ${pool} has ${extras.length} repeat game(s) beyond its single round robin.` });
            for (const e of extras) changes.push({ match_id: e.id, op: "delete_unplayed", kind: isLocked(e) ? "judgement" : "deterministic",
              reason: "Repeat pool game beyond the configured round robin", expect_updated_at: e.updated_at ?? null, before: sides(e), after: null });
          }
        }
      });
    }

    if (!playoffs.length) continue;
    const mode = s.league_playoff_modes?.[dk];
    const poolCount = sizes.length || new Set(snapshot.matches.filter((m) => m.stage === "group" && (m.group_number ?? 1) === div).map((m) => m.pool_number)).size;

    // I1 — duplicate teams across playoff slots (any mode).
    const seenTeam = new Map<string, string>();
    for (const m of playoffs) for (const side of ["a", "b"] as const) {
      const p = m[`player_${side}_member_id`]; if (!p) continue;
      const k = teamKey(p, isDoubles ? (pairOf.get(p) ?? m[`partner_${side}_member_id`]) : null);
      if (seenTeam.has(k)) findings.push({ code: "I1_DUPLICATE_QUALIFIER", division: div, match_ids: [seenTeam.get(k)!, m.id], repairable: true,
        message: "The same team appears in more than one playoff game." });
      else seenTeam.set(k, m.id);
    }

    if (mode !== "position" || poolCount !== 2) {
      if (findings.some((f) => f.division === div && f.code === "I1_DUPLICATE_QUALIFIER"))
        findings.push({ code: "I13_UNSUPPORTED_FORMAT", division: div, match_ids: [], repairable: false,
          message: "Automatic playoff repair currently supports two-pool position playoffs only; this format needs a person." });
      continue;
    }

    const P1 = poolStandings(snapshot, div, 1, pairOf), P2 = poolStandings(snapshot, div, 2, pairOf);
    const complete = P1.complete && P2.complete;
    pools_complete[dk] = complete;

    for (const m of playoffs.sort((x, y) => (x.bracket_position ?? 0) - (y.bracket_position ?? 0))) {
      const pos = (m.bracket_position ?? 0) - 1000;
      if (pos < 1) continue;
      if (!complete) {
        // Lifecycle rule: slots stay TBD until every pool game is finished.
        if ((m.player_a_member_id || m.player_b_member_id) && !isLocked(m)) {
          findings.push({ code: "I11_PREMATURE_FILL", division: div, match_ids: [m.id], repairable: true,
            message: `The ${ordinal(pos)} playoff slot was filled before pool play finished.` });
          changes.push({ match_id: m.id, op: "clear_sides", kind: "deterministic", reason: "Pool play not finished — slot must stay TBD",
            expect_updated_at: m.updated_at ?? null, before: sides(m), after: { player_a_member_id: null, partner_a_member_id: null, player_b_member_id: null, partner_b_member_id: null } });
        }
        continue;
      }
      const ta = P1.sorted[pos - 1], tb = P2.sorted[pos - 1];
      if (!ta || !tb) continue;
      const ambiguous = P1.tiedPositions.has(pos - 1) || P2.tiedPositions.has(pos - 1);
      const want = { player_a_member_id: ta.a, partner_a_member_id: ta.b, player_b_member_id: tb.a, partner_b_member_id: tb.b };
      const haveA = teamKey(m.player_a_member_id, m.partner_a_member_id), haveB = teamKey(m.player_b_member_id, m.partner_b_member_id);
      if (haveA === ta.key && haveB === tb.key) continue;
      const locked = isLocked(m);
      if (!m.player_a_member_id && !m.player_b_member_id) {
        findings.push({ code: "I9_SLOT_UNFILLED", division: div, match_ids: [m.id], repairable: true, message: `The ${ordinal(pos)} playoff slot is still empty although pool play is finished.` });
      } else if (locked) {
        findings.push({ code: "I10_LOCKED_WRONG", division: div, match_ids: [m.id], repairable: false, message: `The ${ordinal(pos)} playoff game has the wrong teams but has already started or been scored.` });
      } else {
        findings.push({ code: "I6_WRONG_SLOT", division: div, match_ids: [m.id], repairable: !ambiguous, message: `The ${ordinal(pos)} playoff game doesn't match Pool A #${pos} vs Pool B #${pos}.` });
      }
      if (ambiguous) findings.push({ code: "I12_AMBIGUOUS_STANDINGS", division: div, match_ids: [m.id], repairable: false,
        message: `Teams are exactly tied around position ${pos}; a person must decide the tie-break.` });
      changes.push({ match_id: m.id, op: "set_sides", kind: locked || ambiguous ? "judgement" : "deterministic",
        reason: `Pool A #${pos} vs Pool B #${pos} from final pool standings`, expect_updated_at: m.updated_at ?? null, before: sides(m), after: want });
    }

    // I2 — every qualifier appears once (after pools complete).
    if (complete) {
      const slots = playoffs.filter((m) => (m.bracket_position ?? 0) > 1000).length;
      const qualifying = [...P1.sorted.slice(0, slots), ...P2.sorted.slice(0, slots)].map((r) => r.key);
      const present = new Set(playoffs.flatMap((m) => [teamKey(m.player_a_member_id, m.partner_a_member_id), teamKey(m.player_b_member_id, m.partner_b_member_id)]));
      const missing = qualifying.filter((k) => !present.has(k));
      if (missing.length) findings.push({ code: "I2_MISSING_QUALIFIER", division: div, match_ids: [], repairable: true,
        message: `${missing.length} qualifying team(s) are missing from the playoffs.` });
    }
  }

  const deterministic = changes.filter((c) => c.kind === "deterministic");
  const judgement = changes.filter((c) => c.kind === "judgement");
  return { findings, changes, deterministic, judgement, pools_complete, consistent: findings.length === 0 };
}

function sides(m: IMatch) {
  return { player_a_member_id: m.player_a_member_id, partner_a_member_id: m.partner_a_member_id, player_b_member_id: m.player_b_member_id, partner_b_member_id: m.partner_b_member_id };
}

function ordinal(pos: number) {
  const a = pos * 2 - 1, b = pos * 2;
  const suf = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
  return `${a}${suf(a)}/${b}${suf(b)}`;
}

/** Apply a change list to a snapshot in memory (used for post-repair verification in tests). */
export function applyChanges(snapshot: ISnapshot, changes: Change[]): ISnapshot {
  const byId = new Map(changes.map((c) => [c.match_id, c]));
  const matches = snapshot.matches.flatMap((m) => {
    const c = byId.get(m.id);
    if (!c) return [m];
    if (c.op === "delete_unplayed") return [];
    return [{ ...m, ...(c.after ?? {}) }];
  });
  return { ...snapshot, matches };
}
