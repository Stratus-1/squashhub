/**
 * Protecting player-created bookings across draw regeneration.
 *
 * Regenerating a tournament draw deletes and re-inserts every match row.
 * Self-scheduled knockouts mean players — not the organiser — create the
 * real court booking for their own match, so a naive rebuild silently
 * destroys a booking the players already agreed on (and gives the match a
 * brand-new id, orphaning anything that pointed at it).
 *
 * These helpers let the rebuild:
 *  1. recognise which old matches are "protected" (player booking, or an
 *     already-played result), and
 *  2. carry that court/date/time/booking back onto the equivalent row in
 *     the new draw, matched on the participants rather than the row id.
 *
 * Anything that cannot be carried across is reported as an orphan so the
 * caller can abort the regeneration instead of losing it.
 */

export type ScheduleMatchRow = {
  id?: string | null;
  player_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_a_member_id?: string | null;
  partner_b_member_id?: string | null;
  group_number?: number | null;
  court_id?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  booking_id?: string | null;
  winner_member_id?: string | null;
  status?: string | null;
  is_bye?: boolean | null;
  [key: string]: any;
};

export type ProtectedSchedule = {
  /** Old match id — for logging/diagnostics only. */
  matchId: string | null;
  /** Participant fingerprint used to find the same fixture in the new draw. */
  key: string;
  groupNumber: number | null;
  courtId: number | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  bookingId: string | null;
  /** Already-played outcome, carried across so a rebuild never wipes a result. */
  status: string | null;
  score: string | null;
  gameScores: any;
  winnerMemberId: string | null;
  sideAPoints: number | null;
  sideBPoints: number | null;
  /** True when side A/B are swapped relative to the old row (scores must flip). */
  /** Why the row is protected — drives the abort message. */
  reason: "booking" | "result";
  /** Old row's side A member, used to detect an A/B flip in the new draw. */
  playerAMemberId: string | null;
};


const DECIDED = new Set(["completed", "forfeited", "walkover"]);

/** Sorted participant fingerprint — order of side A/B must not matter. */
export function participantsKey(m: ScheduleMatchRow): string {
  const ids = [
    m.player_a_member_id,
    m.partner_a_member_id,
    m.player_b_member_id,
    m.partner_b_member_id,
  ].filter(Boolean) as string[];
  return [...ids].sort().join("|");
}

/** Fixture-level key: a player pair can meet in more than one division. */
function fixtureKey(m: ScheduleMatchRow): string {
  return `${m.group_number ?? ""}::${participantsKey(m)}`;
}

/** Does this booking belong to a player-scheduled match (vs an organiser block)? */
export function isPlayerMatchBooking(externalId: string | null | undefined): boolean {
  return typeof externalId === "string" && externalId.includes(":match:");
}

/** A match nobody may silently discard when the draw is rebuilt. */
export function isProtectedMatch(m: ScheduleMatchRow): boolean {
  if (m.is_bye) return false;
  if (m.booking_id) return true;
  if (m.winner_member_id) return true;
  return DECIDED.has(String(m.status || ""));
}

export function collectProtectedSchedules(oldMatches: ScheduleMatchRow[]): ProtectedSchedule[] {
  return (oldMatches || []).filter(isProtectedMatch).map((m) => ({
    matchId: m.id ?? null,
    key: fixtureKey(m),
    groupNumber: m.group_number ?? null,
    courtId: m.court_id ?? null,
    scheduledDate: m.scheduled_date ?? null,
    scheduledTime: m.scheduled_time ?? null,
    bookingId: m.booking_id ?? null,
    status: m.status ?? null,
    score: m.score ?? null,
    gameScores: m.game_scores ?? null,
    winnerMemberId: m.winner_member_id ?? null,
    sideAPoints: m.side_a_points ?? null,
    sideBPoints: m.side_b_points ?? null,
    playerAMemberId: m.player_a_member_id ?? null,
    reason: m.booking_id ? "booking" : "result",
  }));
}

/** Does this protected row carry a real, played outcome? */
export function hasPlayedResult(p: ProtectedSchedule): boolean {
  return !!(p.winnerMemberId || p.score || DECIDED.has(String(p.status || "")));
}

const flipScore = (s: string | null): string | null =>
  s
    ? s
        .split(",")
        .map((g) => {
          const m = g.trim().match(/^(\d+)\s*-\s*(\d+)$/);
          return m ? `${m[2]}-${m[1]}` : g.trim();
        })
        .join(", ")
    : s;

const flipGameScores = (raw: any): any => {
  try {
    const parsed = typeof raw === "string" && raw.trim() ? JSON.parse(raw) : raw;
    const sets = Array.isArray(parsed?.sets) ? parsed.sets : null;
    if (!sets) return raw;
    const flipped = { ...parsed, sets: sets.map((s: any) => ({ ...s, a: s?.b, b: s?.a })) };
    return typeof raw === "string" ? JSON.stringify(flipped) : flipped;
  } catch {
    return raw;
  }
};

/**
 * Fields to copy onto the equivalent row in the new draw so an already-played
 * match keeps its result. Flips side A/B when the new row reversed the pair.
 */
export function resultCarryOver(p: ProtectedSchedule, match: ScheduleMatchRow): Record<string, any> {
  if (!hasPlayedResult(p)) return {};
  const flipped = !!p.playerAMemberId && !!match.player_a_member_id && p.playerAMemberId !== match.player_a_member_id;
  return {
    status: p.status,
    score: flipped ? flipScore(p.score) : p.score,
    game_scores: flipped ? flipGameScores(p.gameScores) : p.gameScores,
    winner_member_id: p.winnerMemberId,
    side_a_points: flipped ? p.sideBPoints : p.sideAPoints,
    side_b_points: flipped ? p.sideAPoints : p.sideBPoints,
  };
}


export type ReconcileResult = {
  /** Protected schedules that found their fixture again in the new draw. */
  matched: Array<{ protectedSchedule: ProtectedSchedule; match: ScheduleMatchRow }>;
  /** Protected schedules whose fixture no longer exists — regeneration must abort. */
  orphans: ProtectedSchedule[];
};

/**
 * Pair each protected schedule with its equivalent row in the new draw.
 * Purely computational — the caller performs the writes.
 */
export function reconcileProtectedSchedules(
  protectedSchedules: ProtectedSchedule[],
  newMatches: ScheduleMatchRow[],
): ReconcileResult {
  const byKey = new Map<string, ScheduleMatchRow[]>();
  for (const m of newMatches || []) {
    if (m.is_bye) continue;
    const k = fixtureKey(m);
    const list = byKey.get(k);
    if (list) list.push(m);
    else byKey.set(k, [m]);
  }

  const matched: ReconcileResult["matched"] = [];
  const orphans: ProtectedSchedule[] = [];
  for (const p of protectedSchedules) {
    const candidate = byKey.get(p.key)?.shift();
    if (candidate) matched.push({ protectedSchedule: p, match: candidate });
    else orphans.push(p);
  }
  return { matched, orphans };
}

/** Human-readable abort message when protected fixtures would be lost. */
export function orphanedScheduleMessage(orphans: ProtectedSchedule[]): string {
  const bookings = orphans.filter((o) => o.reason === "booking").length;
  const results = orphans.length - bookings;
  const parts: string[] = [];
  if (bookings > 0) parts.push(`${bookings} match${bookings === 1 ? "" : "es"} with a court booking players already made`);
  if (results > 0) parts.push(`${results} match${results === 1 ? "" : "es"} that already has a result`);
  return (
    `Draw regeneration blocked: ${parts.join(" and ")} ${orphans.length === 1 ? "is" : "are"} not in the new draw. ` +
    `Cancel or re-enter those matches first, or keep the current draw — SquashHub will not delete an existing player booking or result.`
  );
}
