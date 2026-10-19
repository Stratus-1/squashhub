import { swissRound, IntegrityError } from "./contract";
import { slotTemplate } from "./swiss-positional";

export const opponentKey = (a: string, b: string) => JSON.stringify([a, b].sort());
/** First round where no-repeat repair applies; rounds before it keep the fixed template. Applies to every club. */
export const SWISS_NO_REPEAT_FROM_ROUND = 3;

export interface SwissSlotPair { a: number; b: number }
export interface SwissHistoryGame { a: string | null; b: string | null; round: number }
export interface StrictSwissPlan { pairs: SwissSlotPair[]; bye: number | null; ready: boolean; issue?: string }

/** Even halves: keep their strongest quarter apart through rounds three and four. */
export function preferredSwissTemplate(n: number, round: number) {
  const original = slotTemplate(n, round);
  if (n % 4 !== 0 || round < 3) return original;
  const half = n / 2, gap = half / 2;
  if (round > 4) return { ...original, pairs: [0, half].flatMap(offset =>
    slotTemplate(half, round).pairs.map(p => ({ ...p, a: p.a + offset, b: p.b + offset }))) };
  const pairs = [0, half].flatMap(offset => Array.from({ length: gap }, (_, i) => ({
    round, a: offset + i + 1, b: offset + gap + (i + round - 3) % gap + 1,
  })));
  return { ...original, pairs };
}

/** Resolve unsaved slots only. An incomplete field cannot be confirmed before legal completion is known. */
export function strictSwissPlan(input: {
  occupants: Array<string | null>; round: number; preferred?: SwissSlotPair[]; bye?: number | null;
  history: SwissHistoryGame[]; locked?: Array<{ a: string; b: string | null }>;
}): StrictSwissPlan {
  const { occupants, round, history } = input;
  const raw = preferredSwissTemplate(occupants.length, round);
  const wide = occupants.length % 4 === 0 && round >= 3 && round <= 4;
  const preferred = occupants.length % 4 === 0 && round >= 3 ? raw.pairs : input.preferred ?? raw.pairs;
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
  if (ids.length % 4 === 0 && round >= 3) {
    const half = ids.length / 2, quarter = half / 2;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const differentHalf = Math.floor(i / half) !== Math.floor(j / half);
      const sameQuarter = wide && Math.floor(i / quarter) === Math.floor(j / quarter);
      if (differentHalf || sameQuarter) {
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