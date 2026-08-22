/**
 * Self-scheduled KNOCKOUT tournaments.
 *
 * When the draw format is knockout AND the players arrange their own court,
 * date and time, almost every club-scheduling control is meaningless: there
 * are no courts to reserve, no time slots to fill, no pool break, no capacity
 * check and — crucially — no way to know who plays in Round 2 until Round 1
 * has actually been played.
 *
 * So the organiser configures ONE round at a time: the current round's
 * play-by deadline plus optional notes. Later rounds unlock only once the
 * current round is complete. From the semi-final onwards the organiser may
 * flip an individual round back to club-scheduled courts/times.
 *
 * Nothing here writes to the database directly — the per-round settings ride
 * along inside the existing `club_champs.round_play_by` jsonb.
 */
import type { RoundDeadline } from "./round-deadlines";
import { defaultRoundLabel, serializeRoundDeadlines } from "./round-deadlines";

export type RoundMatchRow = {
  round_number: number | null;
  status: string | null;
};

export type RoundProgress = {
  roundNumber: number;
  total: number;
  completed: number;
  /** Every match in this round has a result (or walkover). */
  complete: boolean;
};

const DONE = new Set(["completed", "complete", "walkover", "forfeit", "cancelled"]);

/**
 * True when the simplified single-round scheduling UI applies.
 * Every configured division must be a knockout — a mixed tournament (e.g. a
 * round robin division alongside a knockout) keeps the full controls because
 * the round robin still needs courts and times.
 */
export function isSelfScheduledKnockout(
  schedulingMode: "club" | "self" | string | null | undefined,
  divisionFormats: (string | null | undefined)[],
): boolean {
  if (schedulingMode !== "self") return false;
  const formats = divisionFormats.filter(Boolean) as string[];
  if (formats.length === 0) return false;
  return formats.every((f) => f === "knockout");
}

/** Group match rows into per-round progress, ordered by round number. */
export function roundProgress(rows: RoundMatchRow[]): RoundProgress[] {
  const byRound = new Map<number, { total: number; completed: number }>();
  for (const r of rows) {
    const rn = Number(r.round_number);
    if (!Number.isFinite(rn) || rn < 1) continue;
    const bucket = byRound.get(rn) || { total: 0, completed: 0 };
    bucket.total += 1;
    if (DONE.has(String(r.status || "").toLowerCase())) bucket.completed += 1;
    byRound.set(rn, bucket);
  }
  return Array.from(byRound.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, b]) => ({
      roundNumber,
      total: b.total,
      completed: b.completed,
      complete: b.total > 0 && b.completed >= b.total,
    }));
}

/**
 * The round the organiser may configure right now: the first round that is
 * not finished. When every generated round is finished the NEXT round becomes
 * configurable (it is about to be generated). With no matches yet it is
 * Round 1.
 */
export function currentRoundNumber(progress: RoundProgress[]): number {
  if (progress.length === 0) return 1;
  const pending = progress.find((p) => !p.complete);
  if (pending) return pending.roundNumber;
  return progress[progress.length - 1].roundNumber + 1;
}

/** Is the next round ready to be created (current round played out)? */
export function nextRoundReady(progress: RoundProgress[]): boolean {
  return progress.length > 0 && progress.every((p) => p.complete);
}

/**
 * Human stage name. `remainingRounds` counts this round and every round after
 * it, so 1 = Final, 2 = Semi-final, 3 = Quarter-final.
 */
export function roundStageLabel(roundNumber: number, remainingRounds?: number | null): string {
  if (remainingRounds === 1) return "Final";
  if (remainingRounds === 2) return "Semi-final";
  if (remainingRounds === 3) return "Quarter-final";
  return defaultRoundLabel(roundNumber - 1);
}

/** Semi-final or later — the point where a club-scheduled finals night is offered. */
export function isFinalsStage(remainingRounds?: number | null): boolean {
  return typeof remainingRounds === "number" && remainingRounds > 0 && remainingRounds <= 2;
}

/**
 * Total knockout rounds implied by an entrant count (largest division wins).
 * Used only to name stages — never to force the organiser to configure them.
 */
export function knockoutRoundCount(entrants: number): number {
  if (!Number.isFinite(entrants) || entrants < 2) return 0;
  return Math.ceil(Math.log2(entrants));
}

/**
 * Ensure a deadline row exists for `roundNumber` without disturbing anything
 * the organiser already saved for earlier rounds.
 */
export function ensureRound(list: RoundDeadline[], roundNumber: number, label?: string): RoundDeadline[] {
  const next = [...list];
  while (next.length < roundNumber) {
    next.push({ label: defaultRoundLabel(next.length), date: "" });
  }
  if (label && !next[roundNumber - 1].label.trim()) {
    next[roundNumber - 1] = { ...next[roundNumber - 1], label };
  }
  return next;
}

/** Patch a single round in-place (immutably), leaving all other rounds untouched. */
export function patchRound(
  list: RoundDeadline[],
  roundNumber: number,
  patch: Partial<RoundDeadline>,
): RoundDeadline[] {
  const base = ensureRound(list, roundNumber);
  return base.map((r, i) => (i === roundNumber - 1 ? { ...r, ...patch } : r));
}

/** The rounds already locked in (played or configured) — shown read-only. */
export function pastRounds(list: RoundDeadline[], currentRound: number): RoundDeadline[] {
  return (serializeRoundDeadlines(list) || []).slice(0, Math.max(0, currentRound - 1));
}

/** A round is club-scheduled only if explicitly flipped over by the organiser. */
export function roundIsClubScheduled(list: RoundDeadline[], roundNumber: number): boolean {
  return list[roundNumber - 1]?.mode === "club";
}
