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
  /** Doubles / Hybrid: how many pairs each team fields. */
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

  return {
    askCategory: !isCompetitionCategory(cfg.category),
    askLadderStart: usesLadder,
    askRankedPoolSize: usesLadder,
    askDistribution: usesLadder,
    askPlayersPerMatch: !cfg.rulesDefined && discipline === "singles",
    askPairsPerTeam: discipline === "doubles" || discipline === "hybrid",
    askReserves: true,
    allocationMode,
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
