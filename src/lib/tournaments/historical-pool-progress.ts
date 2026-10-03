/**
 * Historical pool-table state and structured play-off display.
 * Pool rows remain immutable; every status here is derived from play-off fixtures.
 */
export interface PlayoffMatchLike {
  id?: string;
  stage_key?: string | null;
  round_number?: number | null;
  bracket_position?: number | null;
  status?: string | null;
  winner_member_id?: string | null;
  player_a_member_id?: string | null;
  partner_a_member_id?: string | null;
  player_b_member_id?: string | null;
  partner_b_member_id?: string | null;
}

export interface StructuredStageLike {
  id: string;
  name: string;
  order: number;
  mapping?: {
    source?: string;
    sourceStageId?: string;
    units?: Array<{ id: string; slots: Array<{ pool: number; position: number }> }>;
    matches?: Array<{ order: number; a: string; b: string }>;
  } | null;
}

export interface StructuredDivisionLike {
  stages: StructuredStageLike[];
}

export interface HistoricalPoolStatus {
  eliminated: boolean;
  label: string | null;
}

export interface PlayoffDisplayMatch extends PlayoffMatchLike {
  displayId: string;
  projected: boolean;
  /** Fixed feeder text for an empty slot, e.g. "Winner QF1". */
  feederA?: string | null;
  feederB?: string | null;
  /** Where this game's winner goes, e.g. "Semifinals 1". */
  feedsInto?: string | null;
}

/** Short stage prefix for feeder labels: Quarterfinals → QF, Semifinals → SF. */
export function stageShort(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith("quarter")) return "QF";
  if (n.startsWith("semi")) return "SF";
  if (n.startsWith("final")) return "Final";
  return name;
}

/**
 * Fixed knockout feeder paths. For a `stage_winners` stage, returns per next-stage game the source
 * game numbers (bracket positions) whose winners fill side A and side B. Never looks at results,
 * standings or pools — the bracket alone decides who meets whom.
 */
export function knockoutFeeders(stage: StructuredStageLike): Array<{ order: number; a: number | null; b: number | null }> {
  const m = stage.mapping;
  if (m?.source !== "stage_winners") return [];
  const pos = new Map((m.units ?? []).map((u) => [u.id, u.slots[0]?.position ?? null]));
  return [...(m.matches ?? [])].sort((x, y) => x.order - y.order).map((x) => ({ order: x.order, a: pos.get(x.a) ?? null, b: pos.get(x.b) ?? null }));
}

export interface PlayoffDisplayStage {
  id: string;
  name: string;
  matches: PlayoffDisplayMatch[];
  projected: boolean;
}

const DONE = new Set(["completed", "complete", "walkover", "forfeit"]);
const idsOn = (m: PlayoffMatchLike, side: "a" | "b") =>
  [side === "a" ? m.player_a_member_id : m.player_b_member_id, side === "a" ? m.partner_a_member_id : m.partner_b_member_id].filter(Boolean) as string[];
const decided = (m: PlayoffMatchLike) => DONE.has(String(m.status || "").toLowerCase()) && !!m.winner_member_id;
const orderMatches = (rows: PlayoffMatchLike[]) => [...rows].sort((a, b) => (Number(a.round_number) || 1) - (Number(b.round_number) || 1) || (Number(a.bracket_position) || 0) - (Number(b.bracket_position) || 0));
const winnerUnit = (m: PlayoffMatchLike): string[] => {
  const winner = m.winner_member_id;
  if (!winner) return [];
  return idsOn(m, "a").includes(winner) ? idsOn(m, "a") : idsOn(m, "b");
};

/** Status beside a frozen historical pool row. */
export function historicalPoolStatuses(
  division: StructuredDivisionLike,
  matches: PlayoffMatchLike[],
  poolUnits: Array<{ memberId: string; partnerId?: string | null }>,
): Map<string, HistoricalPoolStatus> {
  const stages = [...division.stages].sort((a, b) => a.order - b.order);
  const playoffStages = stages.slice(1);
  const byStage = new Map(playoffStages.map((s) => [s.id, matches.filter((m) => m.stage_key === s.id)]));
  const firstRows = byStage.get(playoffStages[0]?.id) ?? [];
  const qualified = new Set(firstRows.flatMap((m) => [...idsOn(m, "a"), ...idsOn(m, "b")]));
  const eliminated = new Set<string>();
  if (firstRows.length) {
    poolUnits.forEach((u) => {
      if (!qualified.has(u.memberId) && !(u.partnerId && qualified.has(u.partnerId))) {
        eliminated.add(u.memberId);
        if (u.partnerId) eliminated.add(u.partnerId);
      }
    });
  }
  playoffStages.forEach((stage) => {
    (byStage.get(stage.id) ?? []).forEach((m) => {
      if (!decided(m)) return;
      const loser = idsOn(m, idsOn(m, "a").includes(String(m.winner_member_id)) ? "b" : "a");
      loser.forEach((id) => eliminated.add(id));
    });
  });

  const advanced = new Map<string, string>();
  for (let i = 0; i < playoffStages.length - 1; i++) {
    const rows = byStage.get(playoffStages[i].id) ?? [];
    const next = playoffStages[i + 1];
    if (!rows.length || !rows.every(decided)) continue;
    rows.flatMap(winnerUnit).forEach((id) => advanced.set(id, `Advanced to ${next.name}`));
  }

  const out = new Map<string, HistoricalPoolStatus>();
  poolUnits.forEach((u) => {
    const ids = [u.memberId, u.partnerId].filter(Boolean) as string[];
    const isOut = ids.some((id) => eliminated.has(id));
    const label = isOut ? "Eliminated" : ids.map((id) => advanced.get(id)).find(Boolean) ?? null;
    ids.forEach((id) => out.set(id, { eliminated: isOut, label }));
  });
  return out;
}

/**
 * Existing play-off stages plus the next stage projected through FIXED feeder paths. Slots whose
 * feeder game is undecided show "Winner QF1"-style labels; decided slots show the actual winner.
 */
export function playoffDisplayStages(division: StructuredDivisionLike, matches: PlayoffMatchLike[]): PlayoffDisplayStage[] {
  const stages = [...division.stages].sort((a, b) => a.order - b.order).slice(1);
  const result: PlayoffDisplayStage[] = [];
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const next = stages[i + 1];
    const feedsMap = new Map<number, string>();
    if (next) knockoutFeeders(next).forEach((f) => { [f.a, f.b].forEach((p) => p != null && feedsMap.set(p, `${next.name} ${f.order}`)); });
    const existing = orderMatches(matches.filter((m) => m.stage_key === stage.id));
    if (existing.length) {
      result.push({ id: stage.id, name: stage.name, projected: false, matches: existing.map((m, k) => ({ ...m, displayId: String(m.id ?? `${stage.id}-${k}`), projected: false, feedsInto: feedsMap.get(Number(m.bracket_position) || k + 1) ?? null })) });
      continue;
    }
    const mapping = stage.mapping;
    if (mapping?.source !== "stage_winners" || !mapping.sourceStageId) break;
    const srcStage = stages.find((s) => s.id === mapping.sourceStageId);
    const source = orderMatches(matches.filter((m) => m.stage_key === mapping.sourceStageId));
    if (!source.length) break;
    const byPos = new Map(source.map((m, k) => [Number(m.bracket_position) || k + 1, m]));
    const short = stageShort(srcStage?.name ?? "Game");
    const side = (p: number | null) => {
      const m = p == null ? undefined : byPos.get(p);
      const ids = m && decided(m) ? winnerUnit(m) : [];
      return { ids, label: p == null ? null : `Winner ${short}${p}` };
    };
    const projected = knockoutFeeders(stage).map((f) => {
      const a = side(f.a), b = side(f.b);
      return {
        displayId: `${stage.id}-${f.order}`, stage_key: stage.id, bracket_position: f.order,
        player_a_member_id: a.ids[0] ?? null, partner_a_member_id: a.ids[1] ?? null,
        player_b_member_id: b.ids[0] ?? null, partner_b_member_id: b.ids[1] ?? null,
        feederA: a.label, feederB: b.label, feedsInto: feedsMap.get(f.order) ?? null, projected: true,
      };
    });
    if (!projected.length) break;
    result.push({ id: stage.id, name: stage.name, projected: true, matches: projected });
    break;
  }
  return result;
}

/** Stage-aware wording for the compact mobile progress card. */
export function structuredProgressHeadline(division: StructuredDivisionLike, matches: PlayoffMatchLike[]): string {
  const stages = [...division.stages].sort((a, b) => a.order - b.order);
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const rows = matches.filter((m) => m.stage_key === stage.id);
    if (!rows.length) {
      const prior = stages[i - 1];
      return prior ? `${prior.name} complete — Ready for ${stage.name}.` : `${stage.name} has not started.`;
    }
    const complete = rows.every(decided);
    if (!complete) return `${stage.name} in progress — ${rows.filter(decided).length} of ${rows.length} results entered.`;
    if (i === stages.length - 1) return `${stage.name} complete — this draw is decided.`;
    const nextRows = matches.filter((m) => m.stage_key === stages[i + 1].id);
    if (!nextRows.length) return `${stage.name} complete — Ready for ${stages[i + 1].name}.`;
  }
  return "Competition in progress.";
}
