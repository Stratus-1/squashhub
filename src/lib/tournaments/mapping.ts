/**
 * Explicit matchup mapping — the layer BETWEEN stages that says exactly who plays whom.
 * Four separate concepts, never folded into one "cross-pool" label:
 *   1. stage format        (the stage kind — "mapped" here)
 *   2. qualification source (`source`: entry seeding into pools, or finishing positions of an earlier pool stage)
 *   3. team/pair formation  (`units`: each side = 1 slot for singles, 2 slots for doubles, any pools/positions)
 *   4. matchup mapping      (`matches`: unit v unit, per round, in playing order)
 * A slot is a stable (pool index, position) identity — never a display name. Shared by the builder,
 * Review and the engine, so what Review shows is exactly what the engine generates.
 */
import { IntegrityError, roundRobin, snakePools } from "./contract";

export interface SlotRef { pool: number; position: number } // pool 0-based, position 1-based
export interface MappedUnit { id: string; slots: SlotRef[] }
export interface MappedMatch { round: number; order: number; a: string; b: string; tie?: string }
export type MappingSource = "seed_pools" | "stage_standings";
export interface StageMapping {
  source: MappingSource;
  /** stage_standings: the earlier pool stage whose finishing positions are used. */
  sourceStageId?: string | null;
  pools: number;
  poolSize: number;
  discipline: "singles" | "doubles";
  units: MappedUnit[];
  matches: MappedMatch[];
  /** true = generated from rotation + in-tie pairing; false = edited by the admin. */
  derived: boolean;
}

export const poolLetter = (i: number) => String.fromCharCode(65 + i);
export const slotKey = (s: SlotRef) => `${poolLetter(s.pool)}${s.position}`;
export const unitKey = (slots: SlotRef[]) => slots.map(slotKey).join("+");
const poolName = (i: number, names?: (string | null | undefined)[]) => names?.[i] || `Pool ${poolLetter(i)}`;

/** One in-tie game: positions of the home pool v positions of the away pool. */
export interface TieGame { positions: number[]; opponent: number[] }

/**
 * Derive a mapping from pool rotation (each pool meets every other pool `legs` times, circle method)
 * and the in-tie games. Only used as a PROPOSAL — the admin can edit every unit and matchup.
 */
export function deriveMapping(opts: { pools: number; poolSize: number; legs?: 1 | 2; discipline: "singles" | "doubles"; games: TieGame[]; source?: MappingSource; sourceStageId?: string | null }): StageMapping {
  const units = new Map<string, MappedUnit>();
  const unit = (pool: number, positions: number[]) => {
    const slots = positions.map((position) => ({ pool, position }));
    const id = unitKey(slots);
    if (!units.has(id)) units.set(id, { id, slots });
    return id;
  };
  const once = roundRobin(Array.from({ length: opts.pools }, (_, i) => String(i)));
  const per = Math.max(0, ...once.map((m) => m.round));
  const rot = opts.legs === 2 ? [...once, ...once.map((m) => ({ round: m.round + per, a: m.b, b: m.a }))] : once;
  const matches: MappedMatch[] = [];
  const orderIn = new Map<number, number>();
  for (const t of rot) {
    const pa = Number(t.a), pb = Number(t.b);
    for (const g of opts.games) {
      const o = (orderIn.get(t.round) ?? 0) + 1; orderIn.set(t.round, o);
      matches.push({ round: t.round, order: o, a: unit(pa, g.positions), b: unit(pb, g.opponent), tie: `${poolLetter(pa)}v${poolLetter(pb)}` });
    }
  }
  return { source: opts.source ?? "seed_pools", sourceStageId: opts.sourceStageId ?? null, pools: opts.pools, poolSize: opts.poolSize, discipline: opts.discipline, units: [...units.values()], matches, derived: true };
}

/* ───── editable text form: "R1: A1 v B1" / "R2: A1+B1 v C3+D3" ───── */

export function formatMapping(m: StageMapping): string {
  return [...m.matches].sort((x, y) => x.round - y.round || x.order - y.order).map((x) => `R${x.round}: ${x.a} v ${x.b}`).join("\n");
}

const SLOT = /^([A-Z])(\d+)$/;
export function parseMapping(text: string, base: Omit<StageMapping, "units" | "matches" | "derived">): { mapping: StageMapping | null; errors: string[] } {
  const errors: string[] = [];
  const units = new Map<string, MappedUnit>();
  const matches: MappedMatch[] = [];
  const orderIn = new Map<number, number>();
  const side = (raw: string, line: number): string | null => {
    const toks = raw.trim().toUpperCase().split("+").map((t) => t.trim());
    const slots: SlotRef[] = [];
    for (const t of toks) {
      const m = SLOT.exec(t);
      if (!m) { errors.push(`Line ${line}: "${t}" is not a pool position (use e.g. A1).`); return null; }
      slots.push({ pool: m[1].charCodeAt(0) - 65, position: Number(m[2]) });
    }
    const id = unitKey(slots);
    if (!units.has(id)) units.set(id, { id, slots });
    return id;
  };
  text.split(/\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^R(?:OUND)?\s*(\d+)\s*[:.-]\s*(.+?)\s+(?:v|vs)\s+(.+)$/i.exec(line);
    if (!m) { errors.push(`Line ${i + 1}: write it as "R1: A1 v B1".`); return; }
    const a = side(m[2], i + 1), b = side(m[3], i + 1);
    if (!a || !b) return;
    const round = Number(m[1]);
    const o = (orderIn.get(round) ?? 0) + 1; orderIn.set(round, o);
    matches.push({ round, order: o, a, b });
  });
  if (errors.length) return { mapping: null, errors };
  return { mapping: { ...base, units: [...units.values()], matches, derived: false }, errors: [] };
}

/* ───── validation (same rules for builder and engine) ───── */

export function mappingIssues(m: StageMapping | null | undefined, label = "Stage"): string[] {
  if (!m) return [`${label}: who plays whom is not defined.`];
  const out: string[] = [];
  const need = m.discipline === "doubles" ? 2 : 1;
  if (m.pools < 1 || m.poolSize < 1) out.push(`${label}: pool count and pool size must be set.`);
  if (m.source === "stage_standings" && !m.sourceStageId) out.push(`${label}: choose which earlier stage's finishing positions are used.`);
  if (!m.matches.length) out.push(`${label}: no matchups yet.`);
  const byId = new Map(m.units.map((u) => [u.id, u]));
  for (const u of m.units) {
    if (u.slots.length !== need) out.push(`${label}: ${u.id} — ${m.discipline} sides need ${need} position${need > 1 ? "s" : ""}.`);
    for (const s of u.slots) {
      if (s.pool < 0 || s.pool >= m.pools) out.push(`${label}: ${slotKey(s)} — there is no pool ${poolLetter(s.pool)} (only ${m.pools}).`);
      if (s.position < 1 || s.position > m.poolSize) out.push(`${label}: ${slotKey(s)} — pools have ${m.poolSize} positions.`);
    }
    if (new Set(u.slots.map(slotKey)).size !== u.slots.length) out.push(`${label}: ${u.id} uses the same position twice.`);
  }
  // A position can belong to only ONE pair: pairs are fixed teams for the whole stage.
  if (need === 2) {
    const owner = new Map<string, string>();
    for (const u of m.units) for (const s of u.slots) {
      const k = slotKey(s), prev = owner.get(k);
      if (prev && prev !== u.id) out.push(`${label}: ${k} is in two pairs (${prev} and ${u.id}).`);
      owner.set(k, u.id);
    }
  }
  const perRound = new Map<number, Set<string>>();
  const met = new Set<string>();
  for (const x of m.matches) {
    const a = byId.get(x.a), b = byId.get(x.b);
    if (!a || !b) { out.push(`Round ${x.round}: unknown side.`); continue; }
    if (x.round < 1) out.push(`${label}: rounds start at 1.`);
    const aSlots = a.slots.map(slotKey), bSlots = b.slots.map(slotKey);
    if (aSlots.some((s) => bSlots.includes(s))) out.push(`${label} round ${x.round}: ${x.a} can't play ${x.b} (same player on both sides).`);
    const seen = perRound.get(x.round) ?? new Set<string>(); perRound.set(x.round, seen);
    for (const s of [...aSlots, ...bSlots]) {
      if (seen.has(s)) out.push(`${label} round ${x.round}: ${s} is in two games.`);
      seen.add(s);
    }
    const k = [x.a, x.b].sort().join("|") + `#${x.round}`;
    if (met.has(k)) out.push(`${label} round ${x.round}: ${x.a} v ${x.b} is listed twice.`);
    met.add(k);
  }
  return [...new Set(out)];
}

/* ───── human-readable Review ───── */

export function mappingSummary(m: StageMapping, opts?: { poolNames?: (string | null | undefined)[]; sourceName?: string | null; roundDates?: string[]; nextStage?: string | null }): string[] {
  const names = opts?.poolNames;
  const lines: string[] = [];
  const usedPools = [...new Set(m.units.flatMap((u) => u.slots.map((s) => s.pool)))].sort((a, b) => a - b);
  lines.push(m.source === "seed_pools"
    ? `Who takes part: pool positions from entry seeding — ${usedPools.map((p) => `${poolName(p, names)} (${poolLetter(p)}1–${poolLetter(p)}${m.poolSize})`).join(", ")}`
    : `Who takes part: finishing positions in ${opts?.sourceName ?? "the earlier stage"} — ${usedPools.map((p) => `${poolName(p, names)} ${poolLetter(p)}1–${poolLetter(p)}${m.poolSize}`).join(", ")}`);
  if (m.discipline === "doubles") lines.push(`Pairs: ${m.units.map((u, i) => `Pair ${i + 1} = ${u.slots.map(slotKey).join(" + ")}`).join(" · ")}`);
  const rounds = [...new Set(m.matches.map((x) => x.round))].sort((a, b) => a - b);
  for (const r of rounds) {
    const ms = m.matches.filter((x) => x.round === r).sort((a, b) => a.order - b.order);
    const date = opts?.roundDates?.[r - 1];
    lines.push(`Round ${r}${date ? ` (${date})` : ""}: ${ms.map((x) => `${x.a} v ${x.b}`).join(", ")}`);
  }
  lines.push(`Then: ${opts?.nextStage ?? "no later stage"}`);
  return lines;
}

/* ───── engine resolution ───── */

export interface Seeded { id: string; rank: number | null }

/** Entry seeding into pools; position = order inside the pool (1 = strongest). */
export function seedPools(entrants: Seeded[], pools: number, method: "snake" | "banded" | "random" | null): string[][] {
  if (method === "banded") {
    const ranked = [...entrants].sort((a, b) => ((a.rank ?? 1e9) - (b.rank ?? 1e9)));
    const size = Math.ceil(ranked.length / pools);
    return Array.from({ length: pools }, (_, i) => ranked.slice(i * size, (i + 1) * size).map((e) => e.id));
  }
  const { pools: out, unranked } = snakePools(entrants, pools);
  unranked.forEach((u, i) => out[i % pools].push(u));
  return out.map((p) => p.map((e) => e.id));
}

/** Turn units into real players/pairs. `positions[pool][position-1]` = entrant id. Missing position → blocks. */
export function resolveMapping(m: StageMapping, positions: string[][]): Array<MappedMatch & { aId: string; bId: string }> {
  const who = (u: MappedUnit) => u.slots.map((s) => {
    const id = positions[s.pool]?.[s.position - 1];
    if (!id) throw new IntegrityError("mapping_slot_empty", `${slotKey(s)} has no player (pool ${poolLetter(s.pool)} has ${positions[s.pool]?.length ?? 0}).`);
    return id;
  }).join("+");
  const byId = new Map(m.units.map((u) => [u.id, who(u)]));
  return m.matches.map((x) => ({ ...x, aId: byId.get(x.a)!, bId: byId.get(x.b)! }));
}
