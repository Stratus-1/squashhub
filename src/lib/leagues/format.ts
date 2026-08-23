/**
 * Phase 4 — unified adaptive league format engine.
 *
 * One engine drives Singles, Doubles and Hybrid league setup, selection and
 * result aggregation. Singles behaviour is intentionally unchanged: a singles
 * league resolves to N singles rubbers and nothing else, so legacy fixtures,
 * results and standings totals keep working byte-for-byte.
 *
 * Vocabulary
 *  - fixture: one team-vs-team meeting.
 *  - rubber : one playable unit inside a fixture (singles or doubles).
 *  - pair   : two REAL players allocated to a team. A pair is never a member.
 */
import {
  type CompetitionCategory,
  type CompetitionDiscipline,
  isCompetitionDiscipline,
  validatePairComposition,
} from "./category";

export type RubberType = "singles" | "doubles";

/** Fixed = same pairs all season. Per-fixture = chosen/rotated each fixture. */
export type PairingPolicy = "fixed" | "per_fixture";

export interface LeagueFormatConfig {
  discipline: CompetitionDiscipline;
  category: CompetitionCategory | null;
  /** Number of singles rubbers per fixture (Singles/Hybrid). */
  singlesRubbers: number;
  /** Number of doubles rubbers per fixture (Doubles/Hybrid). */
  doublesRubbers: number;
  pairingPolicy: PairingPolicy;
  /** May one player appear in more than one rubber of the same fixture? */
  allowDualParticipation: boolean;
  /** Mixed only enforces mixed composition when the rules ask for it. */
  requireMixedPair: boolean;
}

export const DEFAULT_SINGLES_RUBBERS = 5;
export const DEFAULT_DOUBLES_RUBBERS = 3;

const clampCount = (v: unknown, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(20, Math.trunc(n)));
};

/**
 * Resolve stored league_rules columns (all nullable/legacy) into a complete,
 * discipline-appropriate format config. Nothing is hard-coded per discipline
 * beyond sane defaults — the caller can configure any composition.
 */
export function resolveFormat(
  league: { discipline?: string | null; category?: string | null; team_size?: number | null } | null | undefined,
  rules?: {
    singles_rubbers?: number | null;
    doubles_rubbers?: number | null;
    pairing_policy?: string | null;
    allow_dual_participation?: boolean | null;
    require_mixed_pair?: boolean | null;
    team_size?: number | null;
  } | null,
): LeagueFormatConfig {
  const discipline: CompetitionDiscipline = isCompetitionDiscipline(league?.discipline)
    ? (league!.discipline as CompetitionDiscipline)
    : "singles";

  const teamSize = clampCount(rules?.team_size ?? league?.team_size, DEFAULT_SINGLES_RUBBERS);

  let singles = 0;
  let doubles = 0;
  if (discipline === "singles") {
    singles = clampCount(rules?.singles_rubbers, teamSize || DEFAULT_SINGLES_RUBBERS);
  } else if (discipline === "doubles") {
    doubles = clampCount(rules?.doubles_rubbers, DEFAULT_DOUBLES_RUBBERS);
  } else {
    singles = clampCount(rules?.singles_rubbers, 3);
    doubles = clampCount(rules?.doubles_rubbers, 1);
  }

  const policy: PairingPolicy = rules?.pairing_policy === "per_fixture" ? "per_fixture" : "fixed";

  return {
    discipline,
    category: (league?.category as CompetitionCategory | null) ?? null,
    singlesRubbers: singles,
    doublesRubbers: doubles,
    pairingPolicy: policy,
    allowDualParticipation: !!rules?.allow_dual_participation,
    requireMixedPair: !!rules?.require_mixed_pair,
  };
}

export interface RubberSlot {
  position: number;
  type: RubberType;
  label: string;
}

/** The ordered rubber composition of one fixture: singles first, then doubles. */
export function rubberSlots(cfg: LeagueFormatConfig): RubberSlot[] {
  const slots: RubberSlot[] = [];
  let pos = 1;
  for (let i = 1; i <= cfg.singlesRubbers; i++) {
    slots.push({ position: pos, type: "singles", label: `Singles ${i}` });
    pos++;
  }
  for (let i = 1; i <= cfg.doublesRubbers; i++) {
    slots.push({ position: pos, type: "doubles", label: `Doubles ${i}` });
    pos++;
  }
  return slots;
}

export function totalRubbers(cfg: LeagueFormatConfig): number {
  return cfg.singlesRubbers + cfg.doublesRubbers;
}

/** Which setup questions the adaptive UI should ask for this discipline. */
export function formatQuestions(discipline: CompetitionDiscipline) {
  return {
    askSinglesRubbers: discipline === "singles" || discipline === "hybrid",
    askDoublesRubbers: discipline === "doubles" || discipline === "hybrid",
    askPairingPolicy: discipline === "doubles" || discipline === "hybrid",
    askDualParticipation: discipline === "hybrid",
    askPairs: discipline === "doubles" || discipline === "hybrid",
  };
}

/* ── Selection validation ────────────────────────────────────────────────── */

export interface SelectionEntry {
  position: number;
  type: RubberType;
  /** Member ids actually playing this rubber (1 for singles, 2 for doubles). */
  memberIds: Array<string | null | undefined>;
}

export interface SelectionProblem {
  position: number;
  message: string;
}

export interface ValidateSelectionInput {
  cfg: LeagueFormatConfig;
  entries: SelectionEntry[];
  /** member id -> gender, for category/pair-composition rules. */
  gendersByMember?: Record<string, string | null | undefined>;
}

/**
 * Validate one team's selection for a fixture:
 *  - a doubles rubber needs two distinct real players
 *  - duplicate participation is rejected unless the rules allow it
 *  - pair composition honours the competition category (Open is unrestricted,
 *    Mixed only when `requireMixedPair`).
 */
export function validateSelection({
  cfg,
  entries,
  gendersByMember = {},
}: ValidateSelectionInput): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  const seen = new Map<string, number>();

  for (const entry of entries) {
    const ids = entry.memberIds.filter((v): v is string => !!v);

    if (entry.type === "doubles") {
      if (ids.length < 2) {
        problems.push({ position: entry.position, message: "A doubles rubber needs two players." });
      } else if (ids[0] === ids[1]) {
        problems.push({ position: entry.position, message: "A pair must be two different players." });
      } else {
        const composition = validatePairComposition(
          ids.map((id) => gendersByMember[id]),
          cfg.category,
          { requireMixedPair: cfg.requireMixedPair },
        );
        if (!composition.valid) {
          problems.push({ position: entry.position, message: composition.reason! });
        }
      }
    }

    if (!cfg.allowDualParticipation) {
      for (const id of ids) {
        const first = seen.get(id);
        if (first !== undefined && first !== entry.position) {
          problems.push({
            position: entry.position,
            message: "This player is already selected in another rubber of this fixture.",
          });
        } else {
          seen.set(id, entry.position);
        }
      }
    }
  }

  return problems;
}

/* ── Pair rotation ───────────────────────────────────────────────────────── */

export interface TeamPair {
  id: string;
  player_one_member_id: string;
  player_two_member_id: string;
  pair_order?: number | null;
  is_active?: boolean | null;
}

/**
 * Pairs to use for a given round.
 *  - fixed        : always the same ordered pairs.
 *  - per_fixture  : rotate the pool by round so pairings vary across the season.
 */
export function pairsForRound(
  pairs: TeamPair[],
  cfg: LeagueFormatConfig,
  roundNumber: number,
): TeamPair[] {
  const pool = pairs.filter((p) => p.is_active !== false);
  const ordered = [...pool].sort((a, b) => (a.pair_order ?? 0) - (b.pair_order ?? 0));
  const need = cfg.doublesRubbers;
  if (!ordered.length || need <= 0) return [];
  if (cfg.pairingPolicy === "fixed") return ordered.slice(0, need);
  const offset = ((roundNumber - 1) % ordered.length + ordered.length) % ordered.length;
  return Array.from({ length: Math.min(need, ordered.length) }, (_, i) => ordered[(offset + i) % ordered.length]);
}

/* ── Result aggregation ──────────────────────────────────────────────────── */

export interface RubberResult {
  position: number;
  rubber_type?: string | null;
  home_games_won?: number | null;
  away_games_won?: number | null;
  winner?: string | null;
  is_forfeit?: boolean | null;
}

export interface FixtureTotals {
  rubbers: number;
  homeRubbersWon: number;
  awayRubbersWon: number;
  homeGames: number;
  awayGames: number;
  singles: number;
  doubles: number;
}

/**
 * Aggregate constituent rubbers into fixture totals. Singles-only fixtures
 * produce exactly the same numbers as before Phase 4.
 */
export function aggregateRubbers(rows: RubberResult[]): FixtureTotals {
  const totals: FixtureTotals = {
    rubbers: 0,
    homeRubbersWon: 0,
    awayRubbersWon: 0,
    homeGames: 0,
    awayGames: 0,
    singles: 0,
    doubles: 0,
  };
  for (const r of rows) {
    totals.rubbers += 1;
    if (r.rubber_type === "doubles") totals.doubles += 1;
    else totals.singles += 1;
    totals.homeGames += r.home_games_won ?? 0;
    totals.awayGames += r.away_games_won ?? 0;
    if (r.winner === "home") totals.homeRubbersWon += 1;
    else if (r.winner === "away") totals.awayRubbersWon += 1;
  }
  return totals;
}

/* ── Historical immutability ─────────────────────────────────────────────── */

export interface RecordedRubberParticipants {
  home_player_member_id?: string | null;
  home_player2_member_id?: string | null;
  away_player_member_id?: string | null;
  away_player2_member_id?: string | null;
  home_player_name?: string | null;
  home_player2_name?: string | null;
  away_player_name?: string | null;
  away_player2_name?: string | null;
  participants_locked_at?: string | null;
}

/** Mirrors the DB trigger: once locked, recorded participants never change. */
export function applyParticipantSnapshot<T extends RecordedRubberParticipants>(
  existing: T | null | undefined,
  incoming: T,
): T {
  if (existing?.participants_locked_at) {
    return {
      ...incoming,
      home_player_member_id: existing.home_player_member_id ?? null,
      home_player2_member_id: existing.home_player2_member_id ?? null,
      away_player_member_id: existing.away_player_member_id ?? null,
      away_player2_member_id: existing.away_player2_member_id ?? null,
      home_player_name: existing.home_player_name ?? null,
      home_player2_name: existing.home_player2_name ?? null,
      away_player_name: existing.away_player_name ?? null,
      away_player2_name: existing.away_player2_name ?? null,
      participants_locked_at: existing.participants_locked_at,
    };
  }
  return incoming;
}

export function pairDisplayName(
  one?: string | null,
  two?: string | null,
  fallback = "TBC",
): string {
  const names = [one, two].map((n) => (n || "").trim()).filter(Boolean);
  if (!names.length) return fallback;
  return names.join(" & ");
}
