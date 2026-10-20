import { swissRound, IntegrityError } from "./contract";
import { slotTemplate } from "./swiss-positional";

export const opponentKey = (a: string, b: string) => JSON.stringify([a, b].sort());
/** First round where no-repeat repair applies; rounds before it keep the fixed template. Applies to every club. */
export const SWISS_NO_REPEAT_FROM_ROUND = 3;
/** Field-aware start: uneven halves (e.g. 18 = 10 + 8) split and play within themselves from round two. */
export function swissStrictFromRound(n: number): number {
  const h = swissHalves(n);
  return h && h[0] !== h[1] ? 2 : SWISS_NO_REPEAT_FROM_ROUND;
}

export interface SwissSlotPair { a: number; b: number }
export interface SwissHistoryGame { a: string | null; b: string | null; round: number }
export interface StrictSwissPlan { pairs: SwissSlotPair[]; bye: number | null; ready: boolean; issue?: string }

/**
 * Halves used from round three. Equal even halves stay equal; when an even field splits into two
 * odd halves (e.g. 18 = 9 + 9) the top half takes one extra player (10 top, 8 bottom).
 * Odd fields (with a bye) return null and keep the existing rules.
 */
export function swissHalves(n: number): [number, number] | null {
  if (n < 4 || n % 2 !== 0) return null;
  const half = n / 2;
  return half % 2 === 0 ? [half, half] : [half + 1, half - 1];
}

/** Gap per round inside a half of `size`: R3 = half-1, R4 = half, R5 = half-2 (e.g. 12 → 1v6, 1v7, 1v5). */
export function swissRoundGap(size: number, round: number): number | null {
  const g = size / 2;
  const gap = round === 3 ? g - 1 : round === 4 ? g : round === 5 ? g - 2 : null;
  return gap != null && gap >= 1 ? gap : null;
}

/** Positional pairs for one half: closest to the round gap, never repeating an earlier round's positions (R2 = 1vN mirror). */
function halfRoundPairs(size: number, round: number): Array<[number, number]> {
  const used = new Set(Array.from({ length: size / 2 }, (_, i) => `${i + 1}-${size - i}`));
  let result: Array<[number, number]> = [];
  for (let r = 3; r <= round; r++) {
    const gap = swissRoundGap(size, r) ?? 1;
    const bt = (free: number[]): Array<[number, number]> | null => {
      if (!free.length) return [];
      const i = free[0];
      const options = free.slice(1).sort((x, y) => Math.abs(x - i - gap) - Math.abs(y - i - gap) || x - y);
      for (const j of options) {
        if (used.has(`${i}-${j}`)) continue;
        const rest = bt(free.filter((x) => x !== i && x !== j));
        if (rest) return [[i, j], ...rest];
      }
      return null;
    };
    result = bt(Array.from({ length: size }, (_, i) => i + 1)) ?? [];
    result.forEach(([x, y]) => used.add(`${x}-${y}`));
  }
  return result;
}

function gapPairs(size: number, _gap: number, offset: number, round: number) {
  return halfRoundPairs(size, round).map(([a, b]) => ({ round, a: offset + a, b: offset + b }));
}

/**
 * Approved fixed models keyed "field:half size" (only these field sizes; others keep the gap rules):
 * R3 groups of 6 folded, R4 sliding by two, R5 neighbours (adjusted so no position pair repeats).
 */
export const SWISS_HALF_MODELS: Record<string, Record<number, Array<[number, number]>>> = {
  "24:12": {
    3: [[1, 6], [2, 5], [3, 4], [7, 12], [8, 11], [9, 10]],
    4: [[1, 3], [2, 4], [5, 7], [6, 8], [9, 11], [10, 12]],
    5: [[1, 2], [3, 5], [4, 6], [7, 8], [9, 12], [10, 11]],
  },
  // 18-player field = top 10 + bottom 8.
  "18:10": {
    3: [[1, 5], [2, 6], [3, 7], [4, 8], [9, 10]],
    4: [[1, 3], [2, 4], [5, 7], [6, 9], [8, 10]],
    5: [[1, 2], [3, 4], [5, 8], [6, 10], [7, 9]],
  },
  // 16-player field = halves of 8 (same pattern as the 18-player bottom 8).
  "16:8": {
    3: [[1, 4], [2, 3], [5, 8], [6, 7]],
    4: [[1, 3], [2, 4], [5, 7], [6, 8]],
    5: [[1, 2], [3, 4], [5, 6], [7, 8]],
  },
  "18:8": {
    3: [[1, 4], [2, 3], [5, 8], [6, 7]],
    4: [[1, 3], [2, 4], [5, 7], [6, 8]],
    5: [[1, 2], [3, 4], [5, 6], [7, 8]],
  },
};

/** Halves play within themselves from round three, with a different position gap each round. */
export function preferredSwissTemplate(n: number, round: number) {
  const original = slotTemplate(n, round);
  const halves = swissHalves(n);
  if (!halves || round < swissStrictFromRound(n)) return original;
  if (round === 2) {
    const mirror = (offset: number, size: number) => Array.from({ length: size / 2 }, (_, i) => ({ round, a: offset + i + 1, b: offset + size - i }));
    return { ...original, bye: null, pairs: [...mirror(0, halves[0]), ...mirror(halves[0], halves[1])] };
  }
  const segments: Array<[number, number]> = [[0, halves[0]], [halves[0], halves[1]]];
  const pairs = segments.flatMap(([offset, size]) => {
    const model = SWISS_HALF_MODELS[`${n}:${size}`]?.[round];
    if (model) return model.map(([a, b]) => ({ round, a: offset + a, b: offset + b }));
    const gap = swissRoundGap(size, round);
    return gap ? gapPairs(size, gap, offset, round)
      : slotTemplate(size, round).pairs.map(p => ({ ...p, a: p.a + offset, b: p.b + offset }));
  });
  return { ...original, bye: null, pairs };
}

/** Resolve unsaved slots only. An incomplete field cannot be confirmed before legal completion is known. */
export function strictSwissPlan(input: {
  occupants: Array<string | null>; round: number; preferred?: SwissSlotPair[]; bye?: number | null;
  history: SwissHistoryGame[]; locked?: Array<{ a: string; b: string | null }>; usePreferredTemplate?: boolean;
}): StrictSwissPlan {
  const { occupants, round, history } = input;
  const raw = preferredSwissTemplate(occupants.length, round);
  const halves = swissHalves(occupants.length);
  
  const preferred = input.usePreferredTemplate ? input.preferred ?? raw.pairs : halves && round >= swissStrictFromRound(occupants.length) ? raw.pairs : input.preferred ?? raw.pairs;
  const bye = input.bye === undefined ? raw.bye : input.bye;
  if (occupants.some((id) => !id)) return { pairs: preferred, bye, ready: false };
  const ids = occupants.filter((id): id is string => !!id);
  if (new Set(ids).size !== ids.length) throw new IntegrityError("swiss_field", "Each player must occupy exactly one Swiss position.");
  const position = new Map(ids.map((id, i) => [id, i + 1]));
  const used = new Set<string>();
  const lockedPairs: SwissSlotPair[] = [];
  let lockedBye: number | null = null;
  for (const game of input.locked ?? []) {
    const a = position.get(game.a), b = game.b ? position.get(game.b) : null;
    if (!a || (game.b && !b) || used.has(game.a) || (game.b && used.has(game.b)) || game.a === game.b)
      throw new IntegrityError("swiss_locked", "Confirmed Swiss games conflict with the remaining field.");
    used.add(game.a);
    if (game.b && b) { used.add(game.b); lockedPairs.push({ a: Math.min(a, b), b: Math.max(a, b) }); }
    else lockedBye = a;
  }
  const played = new Set(history.filter((g) => g.round < round && g.a && g.b).map((g) => opponentKey(String(g.a), String(g.b))));
  const remaining = ids.filter((id) => !used.has(id));
  const byeCandidates = lockedBye != null || remaining.length % 2 === 0 ? [null] :
    [bye, ...ids.map((_, i) => ids.length - i)].filter((s, i, all): s is number => s != null && all.indexOf(s) === i && remaining.includes(ids[s - 1]));
  const preferences = new Map<string, string>();
  preferred.forEach((p) => { const a = ids[p.a - 1], b = ids[p.b - 1]; preferences.set(a, b); preferences.set(b, a); });
  // The established strict solver uses its historical key format. Keep IDs opaque outside this adapter.
  const legacyPlayed = new Set(history.filter((g) => g.round < round && g.a && g.b)
    .map((g) => String(g.a) < String(g.b) ? `${g.a}|${g.b}` : `${g.b}|${g.a}`));
  // Restrict new games, never rewrite locked historical games. Uneven halves retain their existing rules.
  if (halves && round >= swissStrictFromRound(occupants.length)) {
    const top = halves[0];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const differentHalf = (i < top) !== (j < top);
      if (differentHalf) {
        const a = ids[i], b = ids[j];
        legacyPlayed.add(a < b ? `${a}|${b}` : `${b}|${a}`);
      }
    }
  }
  for (const candidate of byeCandidates) {
    const field = remaining.filter((id) => candidate == null || id !== ids[candidate - 1]);
    try {
      const solved = swissRound(field.map((id) => ({ id, points: 0, seed: position.get(id) ?? 0 })), legacyPlayed, preferences);
      const pairs = solved.flatMap(([x, y]) => {
        if (!y || played.has(opponentKey(x, y))) throw new IntegrityError("swiss_repeat", "No legal opponent pairing.");
        const a = position.get(x), b = position.get(y);
        return a && b ? [{ a: Math.min(a, b), b: Math.max(a, b) }] : [];
      });
      return { pairs: [...lockedPairs, ...pairs].sort((x, y) => x.a - y.a), bye: lockedBye ?? candidate, ready: true };
    } catch (error) { if (!(error instanceof IntegrityError) || error.code !== "swiss_repeat") throw error; }
  }
  return { pairs: lockedPairs, bye: lockedBye, ready: false, issue: `Round ${round}: no pairing without repeat opponents exists while confirmed games remain fixed.` };
}