/**
 * Divisions first, then stages per division.
 * Every stage belongs to exactly one division. Copy/apply always creates NEW stage and section IDs and
 * re-points stage references inside the copy; pools are addressed by index inside their own stage and get
 * division-specific IDs at persist time (`${divisionId}:${stageId}:poolN`), so copies never share pools.
 * Live state (entrants, results, fixtures) is never part of the draft structure, so it is never copied.
 */
import { newId, type Division, type TournamentDefinition } from "./definition";

export const stagesIn = (d: Division) => d.sections.flatMap((s) => s.stages);
export const isBlank = (d: Division) => stagesIn(d).length === 0;

/** Deep copy of a division's structure with fresh section/stage IDs and remapped internal references. */
export function cloneStructure(src: Division): Division["sections"] {
  const idMap = new Map<string, string>();
  for (const st of stagesIn(src)) idMap.set(st.id, newId("stage"));
  const copy: Division["sections"] = JSON.parse(JSON.stringify(src.sections));
  for (const sec of copy) {
    sec.id = newId("sec");
    for (const st of sec.stages) {
      st.id = idMap.get(st.id)!;
      const from = st.input?.fromStageId;
      st.input = { ...st.input, fromStageId: from ? idMap.get(from) ?? null : null };
      // Live participant counts are per division — keep the planned number but never participant identities.
      delete (st.input as Record<string, unknown>).entrantIds;
    }
  }
  return copy;
}

export function addDivision(def: TournamentDefinition, name: string, from?: { copyFromId: string }): string {
  const id = newId("div");
  const src = from ? def.divisions.find((d) => d.id === from.copyFromId) : undefined;
  def.divisions.push({
    id, name: name.trim() || `Division ${def.divisions.length + 1}`,
    eligibility: src?.eligibility ?? "open", entry: src?.entry ?? "individual",
    leagueUse: src?.leagueUse ?? null, poolLabels: src?.poolLabels ? [...src.poolLabels] : undefined,
    sections: src ? cloneStructure(src) : [{ id: newId("sec"), name: "Main", stages: [] }],
  } as Division);
  return id;
}

export function removeDivision(def: TournamentDefinition, id: string, startedDivisionIds = new Set<string>()) {
  if (def.divisions.length <= 1 || startedDivisionIds.has(id)) return false;
  def.divisions = def.divisions.filter((d) => d.id !== id);
  return true;
}

export interface ApplyPlanItem { id: string; name: string; status: "blank" | "configured" | "locked" }
/** What applying would do to each destination — shown to the owner before anything changes. */
export function applyPlan(def: TournamentDefinition, srcId: string, targetIds: string[], startedDivisionIds = new Set<string>()): ApplyPlanItem[] {
  return targetIds.filter((t) => t !== srcId).map((t) => {
    const d = def.divisions.find((x) => x.id === t)!;
    return { id: t, name: d.name, status: startedDivisionIds.has(t) ? "locked" : isBlank(d) ? "blank" : "configured" };
  });
}

/**
 * Copy the source structure into the targets. Blank targets are filled; configured targets are only
 * replaced when `replaceConfigured` is explicitly true; divisions with games are never touched.
 * Replacing (not appending) makes a repeated click idempotent — it never produces duplicate stages.
 */
export function applyStructure(def: TournamentDefinition, srcId: string, targetIds: string[], opts: { replaceConfigured?: boolean; startedDivisionIds?: Set<string> } = {}) {
  const src = def.divisions.find((d) => d.id === srcId);
  if (!src) return { applied: [] as string[], skipped: [] as ApplyPlanItem[] };
  const plan = applyPlan(def, srcId, targetIds, opts.startedDivisionIds);
  const applied: string[] = [], skipped: ApplyPlanItem[] = [];
  for (const p of plan) {
    if (p.status === "locked" || (p.status === "configured" && !opts.replaceConfigured)) { skipped.push(p); continue; }
    const d = def.divisions.find((x) => x.id === p.id)!;
    d.entry = src.entry;
    d.sections = cloneStructure(src);
    applied.push(p.id);
  }
  return { applied, skipped };
}

/** Structural integrity: every stage id unique across the tournament and every reference stays inside its division. */
export function ownershipIssues(def: TournamentDefinition): string[] {
  const out: string[] = [];
  const seen = new Map<string, string>();
  for (const d of def.divisions) {
    const own = new Set(stagesIn(d).map((s) => s.id));
    for (const s of stagesIn(d)) {
      if (seen.has(s.id)) out.push(`Stage ${s.id} is shared by ${seen.get(s.id)} and ${d.name}.`);
      seen.set(s.id, d.name);
      const f = s.input?.fromStageId;
      if (f && !own.has(f)) out.push(`${d.name} · ${s.name} refers to a stage in another division.`);
    }
  }
  if (new Set(def.divisions.map((d) => d.id)).size !== def.divisions.length) out.push("Duplicate division.");
  return out;
}
