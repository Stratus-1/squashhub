/**
 * Competition hierarchy: TOURNAMENT → DIVISION → STAGE → POOL (optional) → ROUND → FIXTURE.
 *
 * - A division is a separate competitive category/title with its own format.
 * - A pool is a grouping container INSIDE one division's stage. Never a division.
 * - Teams are participants, never pools.
 * - Names are display labels only; every rule keys on stable ids + kinds.
 */
import { IntegrityError, type StageKind } from "./contract";

export type EntityKind = "tournament" | "division" | "stage" | "pool" | "round" | "fixture" | "team";

export interface HPool { id: string; kind: "pool"; label: string; format: StageKind; scoring: string; qualifyPerPool: number | null }
export interface HStage { id: string; kind: "stage"; stageKind: StageKind; label: string; pools: HPool[]; allowMixedPoolFormats?: boolean }
export interface HDivision { id: string; kind: "division"; label: string; stages: HStage[] }
export interface HTournament { id: string; kind: "tournament"; label: string; divisions: HDivision[] }

export interface HFixture {
  tournamentId: string; divisionId: string; stageId: string; roundId: string;
  poolId: string | null; stageKind: StageKind; a: string | null; b: string | null;
}

export type LeagueUse = "division_allocation" | "pool_seeding" | "team_allocation" | "ignore" | "manual";

export const poolDefaultLabel = (i: number) => `Pool ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
export const divisionDefaultLabel = (cat: string) =>
  ({ men: "Men's", ladies: "Ladies", mixed: "Mixed", open: "Open", juniors: "Juniors" } as Record<string, string>)[cat] ?? cat;

/** Rename changes the label only; id/kind are untouchable. */
export function rename<T extends { id: string; kind: string; label: string }>(e: T, label: string): T {
  return { ...e, label: label.trim() || e.label };
}

/** Structural checks on the hierarchy. Returns error messages; empty = OK. */
export function hierarchyIssues(t: HTournament): string[] {
  const out: string[] = [];
  const ids = new Map<string, EntityKind>();
  const reg = (id: string, k: EntityKind) => {
    const prev = ids.get(id);
    if (prev && prev !== k) out.push(`Id ${id} is used as both a ${prev} and a ${k}.`);
    else if (prev) out.push(`Duplicate ${k} id ${id}.`);
    ids.set(id, k);
  };
  for (const d of t.divisions) {
    if (d.kind !== "division") out.push(`${d.label} is not a division.`);
    reg(d.id, "division");
    for (const s of d.stages) {
      reg(s.id, "stage");
      if (s.stageKind === "knockout" || s.stageKind === "placement") {
        if (s.pools.length) out.push(`${d.label} · ${s.label}: a knockout/playoff stage has no pools.`);
      }
      for (const p of s.pools) { if (p.kind !== "pool") out.push(`${p.label} is not a pool.`); reg(p.id, "pool"); }
      if (!s.allowMixedPoolFormats && s.pools.length > 1) {
        const [f] = s.pools;
        const odd = s.pools.find((p) => p.format !== f.format || p.scoring !== f.scoring || p.qualifyPerPool !== f.qualifyPerPool);
        if (odd) out.push(`${d.label} · ${s.label}: ${odd.label} differs from ${f.label}. Pools in one stage share format, scoring and qualification unless advanced mixed pools is switched on.`);
      }
    }
  }
  return out;
}

/** Every fixture carries full identity; pool only in pool stages; playoff fixtures never inherit a pool. */
export function assertFixtureIdentity(t: HTournament, fixtures: HFixture[]) {
  const div = new Map(t.divisions.map((d) => [d.id, d]));
  for (const f of fixtures) {
    if (f.tournamentId !== t.id) throw new IntegrityError("wrong_tournament", "Fixture belongs to another tournament.");
    if (!f.roundId) throw new IntegrityError("no_round", "Fixture has no round.");
    const d = div.get(f.divisionId);
    if (!d) throw new IntegrityError("no_division", `Fixture division ${f.divisionId} is not a division of this tournament.`);
    const s = d.stages.find((x) => x.id === f.stageId);
    if (!s) throw new IntegrityError("foreign_stage", `Stage ${f.stageId} is not in division ${d.label}.`);
    if (f.stageKind !== s.stageKind) throw new IntegrityError("stage_kind", `${s.label} is ${s.stageKind}; fixture claims ${f.stageKind}.`);
    if (s.pools.length === 0) {
      if (f.poolId) throw new IntegrityError("pool_on_playoff", `${s.label} fixtures belong to the division stage, not to pool ${f.poolId}.`);
    } else {
      const pool = s.pools.find((p) => p.id === f.poolId);
      if (!pool) throw new IntegrityError("foreign_pool", `Pool ${f.poolId} is not in ${d.label} · ${s.label}.`);
      if (pool.format !== s.stageKind && !s.allowMixedPoolFormats && !(s.stageKind === "pools" && pool.format === "round_robin"))
        throw new IntegrityError("pool_format", `${pool.label} format does not match its stage.`);
    }
  }
}

export interface LeagueMember { id: string; leagueId: string; leagueRank: number; teamId?: string | null }

/**
 * Applies the chosen league use. Division allocation and pool seeding are separate outputs:
 * - division_allocation → { divisions } only (no seeding changes)
 * - pool_seeding → { seeds } only (everyone stays in one division)
 * - team_allocation → { teams } grouping preserved as units
 */
export function applyLeagueUse(use: LeagueUse | null | undefined, members: LeagueMember[], leagueToDivision: Record<string, string> = {}) {
  if (use == null) throw new IntegrityError("league_use_undecided", "Choose how league membership is used (or ignore it).");
  if (use === "division_allocation") {
    const divisions: Record<string, string[]> = {};
    const unallocated: string[] = [];
    for (const m of members) {
      const d = leagueToDivision[m.leagueId];
      if (d) (divisions[d] ??= []).push(m.id); else unallocated.push(m.id);
    }
    return { use, divisions, unallocated, seeds: null, teams: null };
  }
  if (use === "pool_seeding") {
    const order = [...members].sort((a, b) => a.leagueId.localeCompare(b.leagueId) || a.leagueRank - b.leagueRank);
    return { use, divisions: null, unallocated: [], seeds: order.map((m, i) => ({ id: m.id, rank: i + 1 })), teams: null };
  }
  if (use === "team_allocation") {
    const teams: Record<string, string[]> = {};
    for (const m of members) if (m.teamId) (teams[m.teamId] ??= []).push(m.id);
    return { use, divisions: null, unallocated: members.filter((m) => !m.teamId).map((m) => m.id), seeds: null, teams };
  }
  return { use, divisions: null, unallocated: members.map((m) => m.id), seeds: null, teams: null };
}

/** Copy a division's structure onto another with fresh ids — explicit owner action only. */
export function applyStructureTo(src: HDivision, target: { id: string; label: string }): HDivision {
  return {
    id: target.id, kind: "division", label: target.label,
    stages: src.stages.map((s) => ({ ...s, id: `${target.id}:${s.id}`, pools: s.pools.map((p) => ({ ...p, id: `${target.id}:${p.id}` })) })),
  };
}
