/**
 * Stage transition — how entrants move from a pool/group stage into the next stage.
 *
 * Three separate concepts, never inferred from each other and never from display names:
 *   1. QUALIFICATION — which finishing positions advance, from which source pools.
 *   2. MAPPING METHOD — cross-pool pairing, overall reseed, or explicit manual mapping.
 *   3. PAIRING RULE   — for cross-pool: winner vs runner-up, or same position vs same position.
 *
 * Everything is stored against STABLE IDS: the source stage's spec id and 0-based pool
 * indexes. Renaming "Pool A" to "Red" can never change a mapping.
 *
 * A qualifier slot (pool index + finishing position) resolves ONLY from its configured
 * source pool and position. Slots are shown before results are known; once the source
 * stage is complete the same slots resolve to actual participants.
 */
import { IntegrityError, bracketOrder, nextPow2, type GenerationMode, type PlannedStage, type PoolStanding, type QualifierMapping } from "./contract";

export type MappingMethod = "cross_pool" | "reseed" | "manual";
export type PairingRule = "winner_runner_up" | "same_position";

/** Stable identity of a qualifying place: source pool index (0-based) + finishing position (1-based). */
export interface QualifierSlot { poolIndex: number; position: number }

export interface StageTransition {
  /** Spec ids, not labels. */
  sourceStageId: string;
  destinationStageId: string;
  /** Finishing positions that qualify from each source pool (1-based). */
  positions: number[];
  /** Restrict to certain source pools (0-based indexes). null/undefined = every pool. */
  sourcePoolIndexes?: number[] | null;
  method: MappingMethod;
  /** cross_pool: which pools are crossed, by index, e.g. [[0,1],[2,3]] for A↔B and C↔D. */
  poolPairs?: Array<[number, number]>;
  /** cross_pool only. */
  pairing?: PairingRule;
  /** manual: destination matches in order, each holding two qualifier slots. */
  manualSlots?: Array<[QualifierSlot | null, QualifierSlot | null]>;
  /** reseed: how the single qualifier field is ranked before the bracket is built. */
  reseedBy?: "pool_position" | "seed";
  generation?: GenerationMode;
}

export const slotKey = (s: QualifierSlot) => `pool${s.poolIndex}#${s.position}`;
export const poolDisplay = (i: number, labels?: string[]) => labels?.[i]?.trim() || `Pool ${String.fromCharCode(65 + i)}`;
export const slotLabel = (s: QualifierSlot | null, labels?: string[]) =>
  s ? `${poolDisplay(s.poolIndex, labels)} #${s.position}` : "TBD";

/** Default crossing for an even pool count: 1↔2, 3↔4, … */
export function defaultPoolPairs(poolCount: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < poolCount; i += 2) out.push([i, i + 1]);
  return out;
}

/** Every alternative crossing of the pools, offered as owner choices (small pool counts only). */
export function possiblePoolPairings(poolCount: number): Array<Array<[number, number]>> {
  if (poolCount % 2 || poolCount > 8) return poolCount % 2 ? [] : [defaultPoolPairs(poolCount)];
  const build = (rest: number[]): Array<Array<[number, number]>> => {
    if (!rest.length) return [[]];
    const [first, ...others] = rest;
    return others.flatMap((o, i) =>
      build(others.filter((_, j) => j !== i)).map((tail) => [[first, o] as [number, number], ...tail]));
  };
  return build(Array.from({ length: poolCount }, (_, i) => i));
}

export const pairingLabel = (pairs: Array<[number, number]>, labels?: string[]) =>
  pairs.map(([a, b]) => `${poolDisplay(a, labels)} ↔ ${poolDisplay(b, labels)}`).join(" and ");

/** The transition a stage actually uses: the stored one, or a default derived from its qualification rule. */
export function effectiveTransition(stage: PlannedStage, prev: PlannedStage): StageTransition {
  const stored = stage.qualify?.transition;
  const poolCount = prev.kind === "pools" ? prev.pools ?? 1 : 1;
  const perPool = stage.qualify?.perPool ?? 0;
  if (stored) return { ...stored, sourceStageId: prev.id, destinationStageId: stage.id };
  const method: MappingMethod = stage.qualify?.mapping === "cross_pool" && poolCount > 1 ? "cross_pool" : "reseed";
  return {
    sourceStageId: prev.id,
    destinationStageId: stage.id,
    positions: Array.from({ length: perPool }, (_, i) => i + 1),
    method,
    poolPairs: method === "cross_pool" ? defaultPoolPairs(poolCount) : undefined,
    pairing: method === "cross_pool" ? "winner_runner_up" : undefined,
    reseedBy: method === "reseed" ? "pool_position" : undefined,
    generation: stage.generation,
  };
}

/** Legacy `mapping` value kept in step with the transition, so old readers stay correct. */
export const mappingOf = (t: StageTransition): QualifierMapping => (t.method === "cross_pool" ? "cross_pool" : "reseed");

export interface TransitionIssue { level: "error" | "warning"; code: string; message: string }

export function transitionIssues(t: StageTransition, poolCount: number): TransitionIssue[] {
  const out: TransitionIssue[] = [];
  const e = (code: string, message: string) => out.push({ level: "error", code, message });
  if (!t.positions.length) e("positions", "No qualifying positions are set.");
  if (new Set(t.positions).size !== t.positions.length) e("positions_dup", "A qualifying position is listed twice.");
  if (t.positions.some((p) => p < 1)) e("positions_range", "Qualifying positions start at 1.");
  const pools = t.sourcePoolIndexes?.length ? t.sourcePoolIndexes : Array.from({ length: poolCount }, (_, i) => i);
  if (pools.some((p) => p < 0 || p >= poolCount)) e("pool_range", "A source pool does not exist.");
  if (t.method === "cross_pool") {
    const pairs = t.poolPairs ?? [];
    if (!pairs.length) e("pairs_missing", "Choose which pools are crossed.");
    const seen = new Set<number>();
    for (const [a, b] of pairs) {
      if (a === b) e("pair_self", "A pool cannot be crossed with itself.");
      for (const x of [a, b]) {
        if (!pools.includes(x)) e("pair_range", "A crossed pool is not a source pool.");
        if (seen.has(x)) e("pair_dup", `${poolDisplay(x)} is crossed more than once.`);
        seen.add(x);
      }
    }
    if (seen.size !== pools.length) e("pair_cover", "Every source pool must be crossed exactly once.");
    if (!t.pairing) e("pairing_rule", "Choose how positions meet.");
  }
  if (t.method === "manual") {
    const slots = t.manualSlots ?? [];
    if (!slots.length) e("manual_missing", "Map the qualifier slots into the next stage.");
    const used = new Set<string>();
    for (const [a, b] of slots) for (const s of [a, b]) {
      if (!s) continue;
      if (used.has(slotKey(s))) e("manual_dup", `${slotLabel(s)} is used in two matches.`);
      used.add(slotKey(s));
      if (!pools.includes(s.poolIndex) || !t.positions.includes(s.position)) e("manual_source", `${slotLabel(s)} is not a qualifying place.`);
    }
  }
  return out;
}

/** Every qualifying place, in a stable order: position first, then pool. */
export function qualifierSlots(t: StageTransition, poolCount: number): QualifierSlot[] {
  const pools = t.sourcePoolIndexes?.length ? [...t.sourcePoolIndexes].sort((a, b) => a - b) : Array.from({ length: poolCount }, (_, i) => i);
  const positions = [...t.positions].sort((a, b) => a - b);
  return positions.flatMap((position) => pools.map((poolIndex) => ({ poolIndex, position })));
}

export interface SlotPairing { slot: number; a: QualifierSlot | null; b: QualifierSlot | null }

/**
 * The destination stage's first-round pairings, expressed in qualifier SLOTS.
 * Pure structure — no results needed, so the owner can check the mapping up front.
 */
export function planTransition(t: StageTransition, poolCount: number): SlotPairing[] {
  const errs = transitionIssues(t, poolCount).filter((i) => i.level === "error");
  if (errs.length) throw new IntegrityError("transition", errs.map((e) => e.message).join("; "));
  if (t.method === "manual") return (t.manualSlots ?? []).map(([a, b], i) => ({ slot: i + 1, a, b }));
  if (t.method === "cross_pool") {
    const positions = [...t.positions].sort((x, y) => x - y);
    const out: SlotPairing[] = [];
    for (const [x, y] of t.poolPairs ?? []) {
      if (positions.length === 1 || t.pairing === "same_position") {
        for (const p of positions) out.push({ slot: out.length + 1, a: { poolIndex: x, position: p }, b: { poolIndex: y, position: p } });
      } else {
        for (let k = 0; k < Math.floor(positions.length / 2); k++) {
          const hi = positions[k], lo = positions[positions.length - 1 - k];
          out.push({ slot: out.length + 1, a: { poolIndex: x, position: hi }, b: { poolIndex: y, position: lo } });
          out.push({ slot: out.length + 1, a: { poolIndex: y, position: hi }, b: { poolIndex: x, position: lo } });
        }
      }
    }
    return out.map((m, i) => ({ ...m, slot: i + 1 }));
  }
  // reseed: one qualifier field, seeded 1..n, placed in the engine's canonical bracket order.
  const seeds = qualifierSlots(t, poolCount);
  const draw = nextPow2(seeds.length);
  const order = bracketOrder(draw).map((s) => seeds[s - 1] ?? null);
  const out: SlotPairing[] = [];
  for (let i = 0; i < draw; i += 2) out.push({ slot: i / 2 + 1, a: order[i], b: order[i + 1] });
  return out;
}

/** Resolve one slot against completed standings. A slot only ever reads its own pool + position. */
export function resolveSlot(slot: QualifierSlot | null, standings: PoolStanding[], divisionId: string): string | null {
  if (!slot) return null;
  const hit = standings.find((s) => s.divisionId === divisionId && s.pool === slot.poolIndex + 1 && s.position === slot.position);
  return hit?.id ?? null;
}

export interface ResolvedPairing extends SlotPairing { aId: string | null; bId: string | null }

/** Slot pairings plus the actual participants, once the source stage is complete. */
export function resolveTransition(pairings: SlotPairing[], standings: PoolStanding[], divisionId: string): ResolvedPairing[] {
  const foreign = standings.filter((s) => s.divisionId !== divisionId);
  if (foreign.length) throw new IntegrityError("division_mix", "Standings from another division were supplied.");
  const out = pairings.map((p) => ({ ...p, aId: resolveSlot(p.a, standings, divisionId), bId: resolveSlot(p.b, standings, divisionId) }));
  const seen = new Set<string>();
  for (const p of out) for (const id of [p.aId, p.bId]) {
    if (!id) continue;
    if (seen.has(id)) throw new IntegrityError("double_slot", `${id} would occupy two places in the next stage.`);
    seen.add(id);
  }
  return out;
}

/** Human-readable mapping, used by the preview before and after results. */
export const describePairing = (p: SlotPairing, labels?: string[]) => `${slotLabel(p.a, labels)} vs ${slotLabel(p.b, labels)}`;
