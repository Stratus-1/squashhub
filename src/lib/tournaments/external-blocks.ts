/**
 * Per-tournament External Booking Blocks (e.g. GoBook "Club Championships").
 *
 * Pure logic only — no reads/writes. GoBook owns which reserved blocks exist;
 * SquashHub owns which match uses each slot and the player names shown.
 * Name alone is never proof of ownership: court + date range + admin
 * confirmation are also required. Missing confirmed blocks are FLAGGED,
 * never cancelled, and allocated matches are never cleared automatically.
 */

export interface ExternalBlockConfig {
  /** Exact provider booker/client display name, e.g. "Club Championships". */
  blockName: string;
  courtIds: number[];
  dateFrom: string; // YYYY-MM-DD inclusive
  dateTo: string;   // YYYY-MM-DD inclusive
  /** Admin create-block workflow; disabled by default. */
  allowCreate?: boolean;
}

export interface ProviderBooking {
  externalId: string; // "gobook:<id>"
  bookerName: string | null;
  courtId: number;
  date: string;
  start: string; // HH:MM
  end: string;
}

export interface BlockMapping {
  externalId: string;
  tournamentId: string;
  courtId: number;
  date: string;
  start: string;
  end: string;
  confirmedAt: string | null;
  missingSince: string | null;
}

export interface Allocation {
  matchId: string;
  courtId: number;
  date: string;
  start: string;
  end: string;
  /** SquashHub-owned display names; never replaced by provider names. */
  playerNames: string;
}

const norm = (s: string | null | undefined) =>
  String(s ?? "").replace(/^\s*\d+\s*;\s*/, "").trim().toLowerCase().replace(/\s+/g, " ");

export type Classification = "candidate" | "name_outside_scope" | "unrelated";

/** Does a provider booking qualify as a candidate block for this tournament? */
export function classifyBooking(b: ProviderBooking, cfg: ExternalBlockConfig | null): Classification {
  if (!cfg || !cfg.blockName.trim()) return "unrelated";
  if (norm(b.bookerName) !== norm(cfg.blockName)) return "unrelated";
  const inScope = cfg.courtIds.includes(b.courtId) && b.date >= cfg.dateFrom && b.date <= cfg.dateTo;
  return inScope ? "candidate" : "name_outside_scope";
}

export interface ReconcileResult {
  /** Existing mappings, with missingSince updated. Never removed. */
  mappings: BlockMapping[];
  /** New candidates awaiting admin confirmation. */
  pendingConfirmation: ProviderBooking[];
  /** Name matched but court/date outside the tournament — review only. */
  ambiguous: ProviderBooking[];
  /** Confirmed blocks GoBook no longer lists. */
  missing: BlockMapping[];
  /** Matches sitting on a missing block or outside any confirmed block. */
  conflicts: { matchId: string; reason: string }[];
  /** External ids the generic sync must NOT cancel. */
  protectedExternalIds: string[];
}

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => a.start < b.end && a.end > b.start;
const covers = (blk: { start: string; end: string }, x: { start: string; end: string }) => blk.start <= x.start && blk.end >= x.end;

/**
 * Reconcile one fresh, valid provider register for the given dates.
 * Idempotent: running twice with the same input yields the same output.
 */
export function reconcileBlocks(input: {
  tournamentId: string;
  cfg: ExternalBlockConfig | null;
  dates: string[];
  provider: ProviderBooking[];
  mappings: BlockMapping[];
  allocations: Allocation[];
  now: string;
}): ReconcileResult {
  const { tournamentId, cfg, provider, now } = input;
  const dates = new Set(input.dates);
  const seen = new Set(provider.map((p) => p.externalId));
  const mappedIds = new Set(input.mappings.map((m) => m.externalId));

  const mappings = input.mappings.map((m) => {
    if (m.tournamentId !== tournamentId || !dates.has(m.date)) return { ...m };
    if (seen.has(m.externalId)) {
      const p = provider.find((x) => x.externalId === m.externalId)!;
      // Provider owns block geometry; keep mapping identity.
      return { ...m, courtId: p.courtId, date: p.date, start: p.start, end: p.end, missingSince: null };
    }
    return { ...m, missingSince: m.missingSince ?? now };
  });

  const pendingConfirmation: ProviderBooking[] = [];
  const ambiguous: ProviderBooking[] = [];
  for (const p of provider) {
    if (mappedIds.has(p.externalId)) continue;
    const c = classifyBooking(p, cfg);
    if (c === "candidate") pendingConfirmation.push(p);
    else if (c === "name_outside_scope") ambiguous.push(p);
  }

  const mine = mappings.filter((m) => m.tournamentId === tournamentId);
  const missing = mine.filter((m) => m.missingSince && m.confirmedAt);
  const live = mine.filter((m) => m.confirmedAt && !m.missingSince);

  const conflicts: { matchId: string; reason: string }[] = [];
  for (const a of input.allocations) {
    if (!dates.has(a.date)) continue;
    const onLive = live.some((m) => m.courtId === a.courtId && m.date === a.date && covers(m, a));
    if (onLive) continue;
    const onMissing = missing.find((m) => m.courtId === a.courtId && m.date === a.date && overlaps(m, a));
    conflicts.push({
      matchId: a.matchId,
      reason: onMissing ? "Reserved block no longer in GoBook — allocation kept, admin to resolve" : "Not inside a confirmed reserved block",
    });
  }

  return {
    mappings,
    pendingConfirmation,
    ambiguous,
    missing,
    conflicts,
    protectedExternalIds: mine.filter((m) => m.confirmedAt).map((m) => m.externalId),
  };
}

/** Display label for a slot: SquashHub match names win over provider booker names. */
export function slotLabel(externalBookerName: string | null, allocation: Allocation | null): string {
  return allocation ? allocation.playerNames : externalBookerName ?? "Reserved";
}

export interface CreateBlockRequest {
  tournamentId: string;
  courtIds: number[];
  date: string;
  start: string;
  end: string;
}

export interface CreateBlockItem {
  idempotencyKey: string;
  courtId: number;
  date: string;
  start: string;
  end: string;
  status: "ready" | "clash";
  reason?: string;
}

/**
 * Admin create-block preview: one provider booking per court, stable key so
 * retries never duplicate. Refuses when the feature is off. Pure — callers
 * perform writes only after explicit confirmation and an enabled flag.
 */
export function planCreateBlocks(
  req: CreateBlockRequest,
  cfg: ExternalBlockConfig | null,
  existing: ProviderBooking[],
): { allowed: boolean; reason?: string; items: CreateBlockItem[] } {
  if (!cfg?.allowCreate) return { allowed: false, reason: "Creating reserved blocks is switched off", items: [] };
  if (!(req.start < req.end)) return { allowed: false, reason: "End time must be after start time", items: [] };
  if (req.date < cfg.dateFrom || req.date > cfg.dateTo) return { allowed: false, reason: "Date is outside this tournament", items: [] };
  const items = req.courtIds.map((courtId): CreateBlockItem => {
    const key = `xblk:${req.tournamentId}:${courtId}:${req.date}:${req.start}`;
    if (!cfg.courtIds.includes(courtId)) return { idempotencyKey: key, courtId, date: req.date, start: req.start, end: req.end, status: "clash", reason: "Court not in this tournament" };
    const clash = existing.find((b) => b.courtId === courtId && b.date === req.date && overlaps(b, req));
    return clash
      ? { idempotencyKey: key, courtId, date: req.date, start: req.start, end: req.end, status: "clash", reason: `Already booked ${clash.start}–${clash.end}${clash.bookerName ? ` (${clash.bookerName})` : ""}` }
      : { idempotencyKey: key, courtId, date: req.date, start: req.start, end: req.end, status: "ready" };
  });
  return { allowed: true, items };
}
