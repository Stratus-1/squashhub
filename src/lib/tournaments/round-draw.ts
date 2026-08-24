/**
 * Manual draw control for EVERY knockout round — not just the first.
 *
 * The first-round visual draw (setup wizard) is untouched. This module adds the
 * same controlled DRAW stage between "the feeder round is decided" and "the
 * next round's fixtures exist", plus the safety rules for re-drawing a round
 * that has been generated but not played:
 *
 *  - only the legitimate qualifiers of the completed feeder round may appear;
 *  - a completed fixture is never modified, deleted or re-paired;
 *  - a round that has begun (any result) can never be redrawn;
 *  - a round whose fixtures hold court bookings must be unscheduled first, so
 *    a redraw can never orphan a booking.
 *
 * Pure logic: no React, no network.
 */
import type { KnockoutMatchLike } from "./knockout";
import { winnerOf } from "./knockout";
import type { SectionProgression } from "./knockout-progression";
import { winnersAsEntrants, type DrawEntrant } from "./draw-board";

/* ------------------------------------------------------------------ *
 * Contextual labels
 * ------------------------------------------------------------------ */

/**
 * "Prepare Final" / "Prepare Semi-finals" / "Prepare Quarter-finals" /
 * "Prepare Round 3" — derived from the real remaining bracket, never from a
 * hard-coded stage assumption.
 */
export function prepareActionLabel(stageLabel?: string | null, roundNumber?: number | null): string {
  const label = String(stageLabel || "").trim();
  if (/^final$/i.test(label)) return "Prepare Final";
  if (/^semi/i.test(label)) return "Prepare Semi-finals";
  if (/^quarter/i.test(label)) return "Prepare Quarter-finals";
  if (label) return `Prepare ${label}`;
  return roundNumber ? `Prepare Round ${roundNumber}` : "Prepare next round";
}

/** Dialog title for the round being prepared. */
export function prepareDrawTitle(stageLabel?: string | null, roundNumber?: number | null): string {
  const stage = String(stageLabel || "").trim() || (roundNumber ? `Round ${roundNumber}` : "Next round");
  return `${stage} — confirm the draw`;
}

/* ------------------------------------------------------------------ *
 * Qualifiers
 * ------------------------------------------------------------------ */

/** Ids that legitimately came through the completed feeder round. */
export function qualifierIds(roundMatches: KnockoutMatchLike[]): string[] {
  const out: string[] = [];
  for (const m of [...roundMatches].sort(
    (a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0),
  )) {
    const w = winnerOf(m);
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

/**
 * Board population for the next round: ONLY the qualifiers, seeded by bracket
 * position. An eliminated player has no entrant row at all, so the draw board
 * cannot offer them and `validateDrawBoard` rejects them if one is injected.
 */
export function qualifierEntrants(
  section: Pick<SectionProgression, "currentRoundComplete" | "currentRoundMatches">,
  nameOf: (id: string) => string,
): DrawEntrant[] {
  if (!section.currentRoundComplete) return [];
  return winnersAsEntrants(section.currentRoundMatches as KnockoutMatchLike[], nameOf);
}

/** Guard used before persisting: nobody outside the qualifier set may appear. */
export function illegalEntrants(placedIds: (string | null)[], allowed: string[]): string[] {
  const ok = new Set(allowed);
  return Array.from(new Set(placedIds.filter(Boolean) as string[])).filter((id) => !ok.has(id));
}

/* ------------------------------------------------------------------ *
 * Redraw safety
 * ------------------------------------------------------------------ */

const RESULT_STATUS = new Set(["completed", "complete", "walkover", "forfeit", "in_progress", "live"]);

/** Has this fixture been played (or started)? Byes never count as played. */
export function hasResult(m: KnockoutMatchLike): boolean {
  if (m.is_bye) return false;
  const status = String(m.status || "").toLowerCase();
  if (RESULT_STATUS.has(status)) return true;
  if (m.winner_member_id) return true;
  return (Number(m.side_a_points) || 0) > 0 || (Number(m.side_b_points) || 0) > 0;
}

export type RoundRedrawState = {
  roundNumber: number;
  /** Fixtures that would be replaced by a redraw. */
  replaceIds: string[];
  played: number;
  bookedIds: string[];
  scheduledIds: string[];
  canRedraw: boolean;
  /** Why a redraw is refused. */
  reason: string | null;
  /** Redraw is allowed but the admin should know something. */
  warning: string | null;
};

/**
 * May this already-generated round be reviewed / redrawn?
 * Yes only while it is entirely unplayed and holds no court bookings.
 */
export function roundRedrawState(roundMatches: KnockoutMatchLike[]): RoundRedrawState {
  const rows = roundMatches || [];
  const roundNumber = rows.length ? Number(rows[0].round_number) || 0 : 0;
  const played = rows.filter(hasResult).length;
  const bookedIds = rows.filter((m: any) => !!m.booking_id).map((m) => m.id!).filter(Boolean);
  const scheduledIds = rows
    .filter((m: any) => !m.booking_id && (m.scheduled_date || m.court_id))
    .map((m) => m.id!)
    .filter(Boolean);
  const replaceIds = rows.map((m) => m.id!).filter(Boolean);

  let reason: string | null = null;
  if (rows.length === 0) reason = "This round has not been generated yet.";
  else if (played > 0)
    reason = `${played} match${played === 1 ? " has" : "es have"} already been played — this round can no longer be redrawn.`;
  else if (bookedIds.length > 0)
    reason = `${bookedIds.length} fixture${bookedIds.length === 1 ? " is" : "s are"} court-booked. Unschedule them first so no booking is left behind.`;

  const warning =
    reason === null && scheduledIds.length > 0
      ? `${scheduledIds.length} fixture${scheduledIds.length === 1 ? "" : "s"} already ${
          scheduledIds.length === 1 ? "has a date" : "have dates"
        } — redrawing clears those dates and you will need to set them again.`
      : null;

  return {
    roundNumber,
    replaceIds,
    played,
    bookedIds,
    scheduledIds,
    canRedraw: reason === null,
    reason,
    warning,
  };
}

/** Convenience: the redraw state of the round a section is currently playing. */
export function currentRoundRedrawState(section: SectionProgression): RoundRedrawState {
  return roundRedrawState(section.currentRoundMatches as KnockoutMatchLike[]);
}
