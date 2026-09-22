/**
 * Stage sequencing for multi-division tournaments.
 *
 * Some events run their divisions as consecutive STAGES rather than side by
 * side. Durbanville's "Diamond League" is the reference case: a singles
 * round-robin is played first, and only once it is finished do the same six
 * players pair up (6+5, 4+3, 2+1) for a doubles round-robin.
 *
 * Two organiser-owned settings drive that, both keyed by `group_number`
 * (the division number) as a string, persisted on `tournaments`:
 *   - `division_follows`         → which division this one waits for
 *   - `division_pairing_method`  → how pairs are formed from the order it inherits
 *
 * Nothing here talks to the database: it is pure so the rules can be tested
 * and reused by the setup UI, the draw engine and the schedule preview alike.
 */

/** How a doubles division turns a finishing order into pairs. */
export type PairingMethod = "adjacent" | "balanced" | "manual";

export const PAIRING_METHODS: PairingMethod[] = ["adjacent", "balanced", "manual"];

export const PAIRING_METHOD_LABELS: Record<PairingMethod, string> = {
  adjacent: "Adjacent — neighbours pair up (6+5, 4+3, 2+1)",
  balanced: "Balanced — strongest with weakest (1+6, 2+5, 3+4)",
  manual: "Manual — the organiser builds the pairs",
};

export function isPairingMethod(v: unknown): v is PairingMethod {
  return typeof v === "string" && (PAIRING_METHODS as string[]).includes(v);
}

/** Read one division's pairing method, defaulting to Durbanville's way. */
export function pairingMethodFor(
  map: Record<string, unknown> | null | undefined,
  groupNumber: number,
): PairingMethod {
  const raw = map?.[String(groupNumber)];
  return isPairingMethod(raw) ? raw : "adjacent";
}

/**
 * Which division (if any) this one waits for. Returns null when it runs
 * alongside the others, which stays the default for every existing event.
 */
export function followsDivision(
  map: Record<string, unknown> | null | undefined,
  groupNumber: number,
): number | null {
  const raw = Number(map?.[String(groupNumber)]);
  if (!Number.isFinite(raw) || raw <= 0 || raw === groupNumber) return null;
  return Math.trunc(raw);
}

/**
 * Guard against a division waiting for itself through a chain
 * (1 follows 2, 2 follows 1). Returns true when adding `follows` to
 * `groupNumber` would create a loop.
 */
export function wouldCycle(
  map: Record<string, unknown> | null | undefined,
  groupNumber: number,
  follows: number,
): boolean {
  let cursor: number | null = follows;
  const seen = new Set<number>([groupNumber]);
  while (cursor != null) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = followsDivision(map, cursor);
  }
  return false;
}

export type DivisionStageState = {
  /** Can this division be drawn / played yet? */
  unlocked: boolean;
  /** The division it is waiting for, when locked. */
  waitingFor: number | null;
  /** Plain-English reason shown to the organiser when locked. */
  reason: string | null;
};

/**
 * Is a division ready to run? A division that follows another stays locked
 * until that stage is complete — never hidden, so the organiser can see why.
 */
export function divisionStageState(opts: {
  groupNumber: number;
  follows: Record<string, unknown> | null | undefined;
  /** group_number -> is that division finished? */
  completeByDivision: Record<number, boolean>;
  /** Optional pretty names, e.g. { 1: "Singles" }. */
  labels?: Record<number, string>;
}): DivisionStageState {
  const { groupNumber, follows, completeByDivision, labels } = opts;
  const waitingFor = followsDivision(follows, groupNumber);
  if (waitingFor == null) return { unlocked: true, waitingFor: null, reason: null };
  if (completeByDivision[waitingFor]) return { unlocked: true, waitingFor, reason: null };
  const name = labels?.[waitingFor] || `Stage ${waitingFor}`;
  return {
    unlocked: false,
    waitingFor,
    reason: `${name} must finish first — its results decide this stage.`,
  };
}

/** Divisions in the order they are played: a stage never precedes the one it follows. */
export function stageOrder(
  groupNumbers: number[],
  follows: Record<string, unknown> | null | undefined,
): number[] {
  const out: number[] = [];
  const placed = new Set<number>();
  const pending = [...groupNumbers].sort((a, b) => a - b);
  let guard = pending.length * pending.length + 1;
  while (pending.length > 0 && guard-- > 0) {
    const next = pending.findIndex((gn) => {
      const dep = followsDivision(follows, gn);
      return dep == null || placed.has(dep) || !groupNumbers.includes(dep);
    });
    const idx = next >= 0 ? next : 0; // broken chain: fall back to numeric order
    const [gn] = pending.splice(idx, 1);
    out.push(gn);
    placed.add(gn);
  }
  return out;
}

export type Pair = { a: string; b: string };

export type PairFromOrderResult = {
  pairs: Pair[];
  /** Anyone left without a partner (odd number of players). */
  unpaired: string[];
};

/**
 * Turn a finishing order into doubles pairs.
 *
 * `order` is strongest first — position 1 at index 0.
 *  - adjacent: neighbours pair up, working from the BOTTOM so the weakest two
 *    play together (6+5, 4+3, 2+1) exactly as Durbanville run it.
 *  - balanced: strongest with weakest (1+6, 2+5, 3+4).
 *  - manual:   nothing is decided here; the organiser builds the pairs.
 *
 * An odd player out is reported rather than silently dropped.
 */
export function pairFromOrder(order: string[], method: PairingMethod): PairFromOrderResult {
  const ids = order.filter((id): id is string => !!id);
  if (method === "manual") return { pairs: [], unpaired: ids };

  const pairs: Pair[] = [];
  const unpaired: string[] = [];

  if (method === "balanced") {
    let lo = 0;
    let hi = ids.length - 1;
    while (lo < hi) {
      pairs.push({ a: ids[lo], b: ids[hi] });
      lo++;
      hi--;
    }
    if (lo === hi) unpaired.push(ids[lo]);
    return { pairs, unpaired };
  }

  // adjacent — from the bottom of the order upwards
  let i = ids.length - 1;
  while (i - 1 >= 0) {
    pairs.push({ a: ids[i - 1], b: ids[i] });
    i -= 2;
  }
  if (i === 0) unpaired.push(ids[0]);
  return { pairs, unpaired };
}

/** Storage key for a per-pool minutes override. */
export function poolDurationKey(groupNumber: number, pool: number): string {
  return `${groupNumber}:${pool}`;
}

/**
 * Minutes for one pool's games: the pool override first, then the division
 * value, then the tournament default. Returns null when nothing is set.
 */
export function poolMinutes(opts: {
  poolDurations?: Record<string, unknown> | null;
  groupDurations?: Record<string, unknown> | null;
  groupNumber?: number | null;
  pool?: number | null;
  fallbackMinutes?: number | null;
}): number | null {
  const { poolDurations, groupDurations, groupNumber, pool, fallbackMinutes } = opts;
  const positive = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (groupNumber != null && pool != null) {
    const fromPool = positive(poolDurations?.[poolDurationKey(groupNumber, pool)]);
    if (fromPool) return fromPool;
  }
  if (groupNumber != null) {
    const fromGroup = positive(groupDurations?.[String(groupNumber)]);
    if (fromGroup) return fromGroup;
  }
  return positive(fallbackMinutes);
}
