import type { StepAnswers } from "@/components/smart-builder/StepByStepBuilder";
import { newStageId, stageKindLabel, type StageKind } from "./stage-plan";
import { rowStages, structureUnits, writeRowStages } from "./structure-rows";

export type CanvasBlock = "division" | "subdivision" | "group" | "pool" | "swiss" | "round_robin" | "knockout" | "monrad" | "playoff";
export interface CanvasItem { id: string; type: "division" | "subdivision" | "stage" | "pool"; key: string; label: string; index?: number; pool?: number }
export interface CanvasLayout { version: 1; positions: Record<string, { x: number; y: number }> }
export const divisionNodeId = (key: string) => `unit:${key}`;
export const stageNodeId = (key: string, id: string) => `stage:${key}:${id}`;

/** Projection only: all semantic edges come from the existing ordered plans and hierarchy. */
export function canvasProjection(a: StepAnswers) {
  const items: CanvasItem[] = [], edges: { id: string; source: string; target: string }[] = [];
  const edge = (source: string, target: string) => edges.push({ id: `${source}->${target}`, source, target });
  for (const cat of a.categories.filter(Boolean)) {
    items.push({ id: divisionNodeId(cat), type: "division", key: cat, label: cat });
    for (const sub of a.subcats[cat] ?? []) {
      const key = `${cat}::${sub}`;
      items.push({ id: divisionNodeId(key), type: "subdivision", key, label: sub });
      edge(divisionNodeId(cat), divisionNodeId(key));
    }
  }
  for (const key of structureUnits(a)) {
    let source = divisionNodeId(key);
    rowStages(a, key).forEach((s, index) => {
      const id = stageNodeId(key, s.id);
      items.push({ id, type: "stage", key, label: `${index + 1}. ${stageKindLabel(s.kind)}`, index });
      edge(source, id); source = id;
      if (s.kind === "pools" || s.kind === "round_robin") for (let pool = 0; pool < (s.pools ?? 1); pool++) {
        const pid = `${id}:pool:${pool}`;
        items.push({ id: pid, type: "pool", key, label: s.poolNames?.[pool] ?? `Pool ${String.fromCharCode(65 + pool)}`, index, pool }); edge(id, pid);
      }
    });
  }
  return { items, edges };
}

export function addCanvasDivision(a: StepAnswers): StepAnswers {
  const categories = a.categories.filter((c) => c.trim());
  let name = `Division ${categories.length + 1}`;
  while (categories.includes(name)) name += " new";
  return { ...a, categories: [...categories, name], categoryTypes: { ...a.categoryTypes, [name]: "open" }, disc: { ...a.disc, [name]: "singles" }, unitEntries: { ...a.unitEntries, [name]: "8" } };
}

/** Only attach a new toolbox block. Existing edges cannot be reinterpreted or cross divisions. */
export function attachCanvasBlock(a: StepAnswers, source: CanvasItem, block: CanvasBlock): { answers: StepAnswers; selected: string } {
  if (block === "division") throw new Error("Main divisions are placed directly on the canvas.");
  if (block === "subdivision" || block === "group") {
    if (source.type !== "division") throw new Error("Connect a subdivision or group to a main division.");
    const subs = a.subcats[source.key] ?? [];
    let suffix = subs.length + 1; let name = `Group ${suffix}`; while (subs.includes(name)) name = `Group ${++suffix}`;
    const key = `${source.key}::${name}`;
    const next = writeRowStages({ ...a, subcats: { ...a.subcats, [source.key]: [...subs, name] }, disc: { ...a.disc, [key]: a.disc[source.key] ?? "singles" }, unitEntries: { ...a.unitEntries, [key]: "8" } }, key, rowStages(a, source.key).map((s) => ({ ...structuredClone(s), id: newStageId() })));
    return { answers: next, selected: divisionNodeId(key) };
  }
  if (block === "pool") {
    if (source.type !== "stage" || source.index == null) throw new Error("Connect a pool to a Round robin stage.");
    const stages = rowStages(a, source.key), s = stages[source.index];
    if (!s || !["pools", "round_robin"].includes(s.kind ?? "")) throw new Error("Pools belong to Round robin stages.");
    const count = (s.pools ?? 1) + 1;
    if (count > 26) throw new Error("A stage supports up to 26 pools.");
    if (s.rrTopology?.mode && s.rrTopology.mode !== "within" || s.rrTopology?.sizes) throw new Error("Review the custom group matrix before changing its pools.");
    const next = writeRowStages(a, source.key, stages.map((x, i) => i === source.index ? { ...x, kind: "pools", pools: count } : x));
    return { answers: next, selected: `${source.id}:pool:${count - 1}` };
  }
  if (source.type === "pool" || source.type === "division" && a.subcats[source.key]?.length) throw new Error("Connect a format to a subdivision, or the last stage in its path.");
  const stages = rowStages(a, source.key);
  if (source.type === "stage" && source.index !== stages.length - 1) throw new Error("Connect the next format from the last stage only.");
  const kind: StageKind = block === "playoff" ? "knockout" : block;
  const s = { id: newStageId(), kind, rounds: kind === "swiss" ? 3 : null, pools: kind === "round_robin" ? 1 : null, advance: { mode: "all_continue" as const } };
  if (source.type !== "stage" && stages[0]?.kind) throw new Error("This group already has a format. Connect a later stage from its last stage, or edit its settings.");
  const next = writeRowStages(a, source.key, source.type === "stage" ? [...stages, s] : [s, ...stages.slice(1)]);
  return { answers: next, selected: stageNodeId(source.key, s.id) };
}

export const visualStructurePilot = (clubId: string, flag: boolean, hostname: string, tournamentId?: string) =>
  clubId === "11111111-1111-1111-1111-111111111111" && flag && !tournamentId && (hostname === "localhost" || hostname.includes("preview") || hostname.endsWith("lovableproject.com") || hostname.endsWith("lovable.app"));