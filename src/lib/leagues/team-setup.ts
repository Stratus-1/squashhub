/**
 * Phase 4 correction — Step 2 (Create League Teams) inherits Step 1.
 *
 * Step 1 (Create League) defines WHAT the league is: discipline
 * (Singles / Doubles / Hybrid), competition category (Men's / Ladies / Mixed /
 * Open), rubber composition, pairing policy and rules.
 * Step 2 defines WHO plays: teams, players and pairs.
 *
 * Therefore Step 2 must never re-ask a Step 1 question, and must never show
 * singles-only ladder-draft controls just because the generic team wizard is
 * reused. Discipline and category are two independent dimensions and are never
 * conflated here.
 */
import {
  type CompetitionCategory,
  type CompetitionDiscipline,
  isCompetitionCategory,
} from "./category";
import { resolveFormat, type LeagueFormatConfig } from "./format";

export interface InheritedLeagueConfig extends LeagueFormatConfig {
  /** True when the league already carries stored format rules (Step 1 saved). */
  rulesDefined: boolean;
}

/**
 * Resolve the league-level configuration a team wizard must inherit.
 * `association` is the league row (league_associations), `rules` its
 * league_rules row (may be absent for legacy leagues).
 */
export function inheritLeagueConfig(
  association: { discipline?: string | null; category?: string | null; require_mixed_pair?: boolean | null } | null | undefined,
  rules?: Record<string, any> | null,
): InheritedLeagueConfig {
  const cfg = resolveFormat(
    { discipline: association?.discipline ?? null, category: association?.category ?? null },
    { ...(rules ?? {}), require_mixed_pair: association?.require_mixed_pair ?? rules?.require_mixed_pair ?? null },
  );
  return { ...cfg, rulesDefined: !!rules && Object.keys(rules).length > 0 };
}

export type AllocationMode = "ladder" | "pairs" | "hybrid";

export interface TeamSetupQuestions {
  /** Ask only when the league itself has no stored competition category. */
  askCategory: boolean;
  /** Singles-only ladder draft controls. */
  askLadderStart: boolean;
  askRankedPoolSize: boolean;
  askDistribution: boolean;
  /** Rubbers-per-fixture is a Step 1 rule; only ask for legacy leagues. */
  askPlayersPerMatch: boolean;
  /** Step 2 owns match composition — how many singles rubbers per fixture. */
  askSinglesRubbers: boolean;
  /** Step 2 owns match composition — how many doubles rubbers per fixture. */
  askDoublesRubbers: boolean;
  /**
   * Deprecated duplicate of `askDoublesRubbers`. Doubles rubbers per fixture is
   * the single authoritative field; a team fields exactly that many pairs.
   */
  askPairsPerTeam: boolean;
  askReserves: boolean;
  allocationMode: AllocationMode;
}

/**
 * Which Step 2 questions to ask for a league.
 *
 * Doubles never gets the singles ladder controls unless the league rules
 * explicitly opt in (`rank_doubles_by_ladder`).
 */
export function teamSetupQuestions(
  cfg: InheritedLeagueConfig,
  rules?: { rank_doubles_by_ladder?: boolean | null } | null,
): TeamSetupQuestions {
  const rankDoubles = !!rules?.rank_doubles_by_ladder;
  const discipline: CompetitionDiscipline = cfg.discipline;

  const usesLadder =
    discipline === "singles" ||
    (discipline === "hybrid" && cfg.singlesRubbers > 0) ||
    (discipline === "doubles" && rankDoubles);

  const allocationMode: AllocationMode =
    discipline === "singles" ? "ladder" : discipline === "hybrid" ? "hybrid" : "pairs";

  const askDoublesRubbers = discipline === "doubles" || discipline === "hybrid";

  return {
    askCategory: !isCompetitionCategory(cfg.category),
    askLadderStart: usesLadder,
    askRankedPoolSize: usesLadder,
    askDistribution: usesLadder,
    askPlayersPerMatch: !cfg.rulesDefined && discipline === "singles",
    askSinglesRubbers: discipline === "hybrid",
    askDoublesRubbers,
    askPairsPerTeam: false,
    askReserves: true,
    allocationMode,
  };
}

/* ── Step 2 composition maths ────────────────────────────────────────────── */

export interface TeamComposition {
  /** Singles rubbers per fixture (Singles / Hybrid). */
  singlesRubbers: number;
  /** Doubles rubbers per fixture — also the number of pairs a team fields. */
  doublesRubbers: number;
  /** May one player fill both a singles and a doubles slot in one fixture? */
  allowDualParticipation: boolean;
}

export interface TeamRequirements {
  singlesRubbers: number;
  doublesRubbers: number;
  /** Distinct players needed to start a fixture for ONE team. */
  startingPlayersPerTeam: number;
  reservesPerTeam: number;
  /** starting + reserves, for ONE team. */
  playersRequiredPerTeam: number;
  numTeams: number;
  /** numTeams x playersRequiredPerTeam. Reserves are ALWAYS per team. */
  totalPlayersRequired: number;
  availablePlayers: number;
  shortfall: number;
  sufficient: boolean;
}

/**
 * How many distinct players one team needs to start a fixture.
 * Doubles slots always need two real players each. When the league allows dual
 * participation, singles players may double up, so the minimum is the larger of
 * the two demands rather than their sum.
 */
export function startingPlayersPerTeam(cfg: TeamComposition): number {
  const singles = Math.max(0, cfg.singlesRubbers);
  const doublesPlayers = Math.max(0, cfg.doublesRubbers) * 2;
  return cfg.allowDualParticipation ? Math.max(singles, doublesPlayers) : singles + doublesPlayers;
}

/** Full Step 2 requirement maths — reserves are per team, never global. */
export function computeTeamRequirements(input: {
  composition: TeamComposition;
  numTeams: number;
  reservesPerTeam: number;
  availablePlayers: number;
}): TeamRequirements {
  const numTeams = Math.max(0, Math.trunc(input.numTeams));
  const reservesPerTeam = Math.max(0, Math.trunc(input.reservesPerTeam));
  const starting = startingPlayersPerTeam(input.composition);
  const perTeam = starting + reservesPerTeam;
  const total = numTeams * perTeam;
  const available = Math.max(0, input.availablePlayers);
  return {
    singlesRubbers: Math.max(0, input.composition.singlesRubbers),
    doublesRubbers: Math.max(0, input.composition.doublesRubbers),
    startingPlayersPerTeam: starting,
    reservesPerTeam,
    playersRequiredPerTeam: perTeam,
    numTeams,
    totalPlayersRequired: total,
    availablePlayers: available,
    shortfall: Math.max(0, total - available),
    sufficient: total <= available,
  };
}

/** How many players a team needs, given the inherited composition. */
export function playersPerTeam(cfg: InheritedLeagueConfig, pairsPerTeam: number): number {
  return cfg.singlesRubbers + Math.max(0, pairsPerTeam) * 2;
}


export interface AllocatablePlayer {
  id: string;
  name?: string | null;
  ladder_position?: number | null;
}

export interface PairAllocation {
  teams: Array<{
    index: number;
    singles: AllocatablePlayer[];
    pairs: Array<[AllocatablePlayer, AllocatablePlayer]>;
  }>;
  reserves: AllocatablePlayer[];
  unallocated: AllocatablePlayer[];
}

/**
 * Allocate real roster players into teams — singles slots first, then pairs.
 * A pair is always two real members; pairs are never modelled as players.
 */
export function buildTeamAllocation(
  players: AllocatablePlayer[],
  opts: { numTeams: number; singlesPerTeam: number; pairsPerTeam: number; reserves?: number },
): PairAllocation {
  const numTeams = Math.max(0, opts.numTeams);
  const singlesPerTeam = Math.max(0, opts.singlesPerTeam);
  const pairsPerTeam = Math.max(0, opts.pairsPerTeam);
  const pool = [...players];
  const teams: PairAllocation["teams"] = Array.from({ length: numTeams }, (_, index) => ({
    index,
    singles: [],
    pairs: [],
  }));

  for (let i = 0; i < singlesPerTeam; i++) {
    for (const team of teams) {
      const p = pool.shift();
      if (!p) break;
      team.singles.push(p);
    }
  }
  for (let i = 0; i < pairsPerTeam; i++) {
    for (const team of teams) {
      if (pool.length < 2) break;
      const a = pool.shift()!;
      const b = pool.shift()!;
      team.pairs.push([a, b]);
    }
  }

  const reserveCount = Math.max(0, opts.reserves ?? 0);
  const reserves = pool.splice(0, reserveCount);
  return { teams, reserves, unallocated: pool };
}
