/**
 * Pure leapfrog engine for internal-league ladder impact.
 *
 * Rules (locked-in Phase 1):
 *  - Leapfrog: if a lower-ranked WINNER (numerically higher position) beats a
 *    higher-ranked LOSER, winner takes loser's slot and everyone between
 *    (loser..winner-1) shifts down by 1. If winner is already above the
 *    loser → no change.
 *  - Both players must be club members with a ladder_position.
 *  - Both players must be the team's ORIGINAL registered player at that
 *    position for this fixture (i.e. their club_member_id matches the lineup
 *    snapshot). Subs / external / unlinked → skip.
 *  - Forfeits skipped.
 *  - Draws / null winner skipped.
 *  - Rubbers applied in chronological order (caller pre-sorts).
 */

export type Rubber = {
  fixtureId: string;
  position: number;
  winnerSide: "home" | "away";
  homeMemberId: string | null; // resolved club_member_id of the player who actually played
  awayMemberId: string | null;
  homeOriginalMemberId: string | null; // who the lineup snapshot says SHOULD have played
  awayOriginalMemberId: string | null;
  isForfeit: boolean;
  // Display:
  homeName: string;
  awayName: string;
};

export type LadderSnapshot = Map<string, number>; // club_member_id -> ladder_position

export type SwapStep = {
  fixtureId: string;
  position: number;
  winnerMemberId: string;
  loserMemberId: string;
  winnerName: string;
  loserName: string;
  winnerOldPos: number;
  loserOldPos: number;
  winnerNewPos: number; // = loserOldPos
  shiftedDownMemberIds: string[]; // members whose rank dropped by 1
  reason: string;
};

export type SkipReason =
  | "forfeit"
  | "no_winner"
  | "missing_player_code"
  | "not_original_home"
  | "not_original_away"
  | "no_ladder_position"
  | "winner_already_higher";

export type SkippedRubber = {
  fixtureId: string;
  position: number;
  reason: SkipReason;
  detail?: string;
};

export type LadderImpactResult = {
  swaps: SwapStep[];
  skipped: SkippedRubber[];
  /** Final position per affected member, only for those whose rank changed. */
  finalChanges: Array<{
    memberId: string;
    name: string;
    oldPosition: number;
    newPosition: number;
  }>;
};

export function computeLadderImpact(
  rubbers: Rubber[],
  initialLadder: LadderSnapshot,
  memberNames: Map<string, string>,
): LadderImpactResult {
  // Working copy of the ladder.
  const ladder = new Map(initialLadder);
  // Snapshot of starting positions to compute final delta.
  const startPositions = new Map(initialLadder);

  const swaps: SwapStep[] = [];
  const skipped: SkippedRubber[] = [];

  for (const r of rubbers) {
    if (r.isForfeit) {
      skipped.push({ fixtureId: r.fixtureId, position: r.position, reason: "forfeit" });
      continue;
    }
    if (r.winnerSide !== "home" && r.winnerSide !== "away") {
      skipped.push({ fixtureId: r.fixtureId, position: r.position, reason: "no_winner" });
      continue;
    }
    if (!r.homeMemberId || !r.awayMemberId) {
      skipped.push({ fixtureId: r.fixtureId, position: r.position, reason: "missing_player_code" });
      continue;
    }
    // Original players only.
    if (!r.homeOriginalMemberId || r.homeMemberId !== r.homeOriginalMemberId) {
      skipped.push({
        fixtureId: r.fixtureId,
        position: r.position,
        reason: "not_original_home",
        detail: r.homeName,
      });
      continue;
    }
    if (!r.awayOriginalMemberId || r.awayMemberId !== r.awayOriginalMemberId) {
      skipped.push({
        fixtureId: r.fixtureId,
        position: r.position,
        reason: "not_original_away",
        detail: r.awayName,
      });
      continue;
    }

    const winnerId = r.winnerSide === "home" ? r.homeMemberId : r.awayMemberId;
    const loserId = r.winnerSide === "home" ? r.awayMemberId : r.homeMemberId;

    const winnerPos = ladder.get(winnerId);
    const loserPos = ladder.get(loserId);

    if (winnerPos == null || loserPos == null) {
      skipped.push({ fixtureId: r.fixtureId, position: r.position, reason: "no_ladder_position" });
      continue;
    }

    // Winner already higher (lower number) → no movement.
    if (winnerPos <= loserPos) {
      skipped.push({
        fixtureId: r.fixtureId,
        position: r.position,
        reason: "winner_already_higher",
        detail: `${memberNames.get(winnerId) ?? winnerId} is #${winnerPos}, beat #${loserPos}`,
      });
      continue;
    }

    // Leapfrog: every member with position in [loserPos, winnerPos-1] shifts +1;
    // winner takes loserPos.
    const shiftedDown: string[] = [];
    for (const [mid, pos] of ladder) {
      if (mid === winnerId) continue;
      if (pos >= loserPos && pos < winnerPos) {
        ladder.set(mid, pos + 1);
        shiftedDown.push(mid);
      }
    }
    ladder.set(winnerId, loserPos);

    swaps.push({
      fixtureId: r.fixtureId,
      position: r.position,
      winnerMemberId: winnerId,
      loserMemberId: loserId,
      winnerName: memberNames.get(winnerId) ?? r.homeName,
      loserName: memberNames.get(loserId) ?? r.awayName,
      winnerOldPos: winnerPos,
      loserOldPos: loserPos,
      winnerNewPos: loserPos,
      shiftedDownMemberIds: shiftedDown,
      reason: `Position ${r.position}: ${memberNames.get(winnerId) ?? r.homeName} (#${winnerPos}) beat ${memberNames.get(loserId) ?? r.awayName} (#${loserPos})`,
    });
  }

  const finalChanges: LadderImpactResult["finalChanges"] = [];
  for (const [mid, newPos] of ladder) {
    const oldPos = startPositions.get(mid);
    if (oldPos != null && oldPos !== newPos) {
      finalChanges.push({
        memberId: mid,
        name: memberNames.get(mid) ?? mid,
        oldPosition: oldPos,
        newPosition: newPos,
      });
    }
  }
  finalChanges.sort((a, b) => a.newPosition - b.newPosition);

  return { swaps, skipped, finalChanges };
}
