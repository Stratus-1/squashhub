import { rrSeedOrder, stageRoundProjection } from "./round-robin-view";

interface Fixture {
  id: string; champ_id?: string; group_number?: number | null; pool_number?: number | null;
  stage?: string | null; round_number?: number | null; is_bye?: boolean | null;
  player_a_member_id?: string | null; player_b_member_id?: string | null;
}

/** A late allocation is a conflict, not permission to change its court or time. */
export function allocationAfterDeadline(date?: string | null, deadline?: string | null, completed = false): boolean {
  return !completed && !!date && !!deadline && date.slice(0, 10) > deadline.slice(0, 10);
}

/**
 * Deadline → round label for the two member-facing lists that never see the builder spec
 * (booking match picker, my-championships rows). Ladies B rounds have unique play-by dates,
 * so the deadline identifies the round; anything else keeps its saved legacy number.
 */
export function uitsigLadiesBRoundFromDeadline(champId?: string | null, group?: number | null, playBy?: string | null): number | null {
  if (champId !== "f954222a-0f0a-4d8c-ac7b-9c74042cc69e" || group !== 6 || !playBy) return null;
  const map: Record<string, number> = { "2026-10-22": 1, "2026-10-29": 2, "2026-11-05": 3 };
  return map[playBy.slice(0, 10)] ?? null;
}

/** Labels only: the existing four-player pool projection, never a fixture update. */
export function uitsigLadiesBRoundLabels(matches: Fixture[], champId: string, group: number, roundCount?: number): Map<string, number> {
  const labels = new Map<string, number>();
  if (champId !== "f954222a-0f0a-4d8c-ac7b-9c74042cc69e" || group !== 6 || roundCount !== 3) return labels;
  const own = matches.filter(m => m.champ_id === champId && m.group_number === group && (m.stage ?? "group") === "group");
  for (const pool of new Set(own.map(m => m.pool_number))) {
    const saved = own.filter(m => m.pool_number === pool).map(m => ({ id: m.id, round: m.round_number ?? null,
      a: m.player_a_member_id ?? null, b: m.player_b_member_id ?? null, isBye: !!m.is_bye }));
    const ids = [...new Set(saved.flatMap(m => [m.a, m.b]).filter((id): id is string => !!id))];
    const order = rrSeedOrder(saved, ids);
    for (const m of stageRoundProjection(order.map(id => ({ id, name: id })), saved, roundCount)) {
      if (m.round != null) labels.set(m.id, m.round);
    }
  }
  return labels;
}