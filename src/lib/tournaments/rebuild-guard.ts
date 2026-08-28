/**
 * Guard for "Rebuild Schedule" on an already-running tournament.
 *
 * Rebuilding deletes and re-inserts every fixture. Played results and player
 * bookings are carried across (see `preserve-schedules`), but a rebuild while
 * a round is in progress is still a heavy, surprising action — an admin who
 * only meant to tweak a date can reshuffle a live draw. This helper describes
 * the blast radius so the UI can demand an explicit confirmation first.
 */

export type RebuildImpactRow = {
  status?: string | null;
  is_bye?: boolean | null;
  winner_member_id?: string | null;
  score?: string | null;
  booking_id?: string | null;
};

export type RebuildImpact = {
  /** Real (non-bye) fixtures that already carry a result. */
  played: number;
  /** Fixtures currently being marked. */
  inProgress: number;
  /** Fixtures with a court booking attached. */
  booked: number;
  /** Real fixtures still waiting to be played. */
  pending: number;
  /** True when the admin must explicitly confirm before the rebuild runs. */
  requiresConfirmation: boolean;
  /** Plain-English summary of what is at stake. */
  summary: string;
};

const DECIDED = new Set(["completed", "forfeited", "walkover"]);

const isPlayed = (m: RebuildImpactRow) =>
  !m.is_bye && (!!m.winner_member_id || !!m.score || DECIDED.has(String(m.status || "")));

export function describeRebuildImpact(rows: RebuildImpactRow[] | null | undefined): RebuildImpact {
  const list = (rows || []).filter((m) => !m.is_bye);
  const played = list.filter(isPlayed).length;
  const inProgress = list.filter((m) => String(m.status || "") === "in_progress").length;
  const booked = list.filter((m) => !!m.booking_id).length;
  const pending = list.length - played;

  const parts: string[] = [];
  if (played > 0) parts.push(`${played} played result${played === 1 ? "" : "s"}`);
  if (inProgress > 0) parts.push(`${inProgress} match${inProgress === 1 ? "" : "es"} being marked right now`);
  if (booked > 0) parts.push(`${booked} court booking${booked === 1 ? "" : "s"}`);

  const summary =
    parts.length === 0
      ? "Nothing has been played yet, so rebuilding is safe."
      : `This tournament already has ${parts.join(", ")}. Rebuilding recreates every fixture: results and player bookings are carried across, but ${pending} unplayed fixture${pending === 1 ? "" : "s"} can be reshuffled and dates may need to be set again.`;

  return {
    played,
    inProgress,
    booked,
    pending,
    requiresConfirmation: played > 0 || inProgress > 0 || booked > 0,
    summary,
  };
}
