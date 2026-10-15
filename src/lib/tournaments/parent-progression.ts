import { unitKeyOf } from "@/lib/smart-builder/step-draw";

export interface ParentDivision {
  divisionId: string; groupNumber?: number; label: string;
  stages: Array<{ id: string; name: string; kind?: string; order: number }>;
  deferredStages?: Array<{ stageKey: string; name: string; plannedDate?: string | null }>;
}
export interface ParentProgressionGroup {
  label: string; groups: number[];
  stages: Array<{ id: string; name: string; deferred: boolean; plannedDate?: string | null }>;
  qualification: string;
}

/** Local preview only; this is not a capability or an authorization decision. */
export function parentProgressionPreview(clubId: string | undefined, hostname: string) {
  return clubId === "d8397b8a-60d3-4c4b-afee-25dab218bf19" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("id-preview--") || hostname.startsWith("preview--"));
}

/** Saved parent membership AND shared playoff intent are required; labels alone never group divisions. */
export function parentProgressionGroups(spec: { divisions?: ParentDivision[] } | null, lifecycle: any): ParentProgressionGroup[] {
  const answers = lifecycle?.answers;
  const plan = lifecycle?.format_plan;
  if (!answers?.subcats || answers.playoffSync !== true) return [];
  const result: ParentProgressionGroup[] = [];
  for (const [parent, children] of Object.entries(answers.subcats)) {
    if (!Array.isArray(children) || children.length < 2) continue;
    const divisions = children.map((child) => (spec?.divisions ?? []).find((d) => unitKeyOf(d.label) === `${parent}::${child}`));
    if (divisions.some((d) => !d?.groupNumber)) continue;
    const saved = divisions.filter((d): d is ParentDivision => !!d);
    const playoff = plan?.playoffOverrides?.[parent] ?? plan?.playoff;
    if (playoff?.choice !== "playoffs") continue;
    const stages = new Map<string, ParentProgressionGroup["stages"][number]>();
    for (const d of saved) {
      for (const s of [...d.stages].sort((a, b) => a.order - b.order).slice(1)) {
        if (!stages.has(s.id)) stages.set(s.id, { id: s.id, name: s.name, deferred: false });
      }
      for (const s of d.deferredStages ?? []) {
        if (!stages.has(s.stageKey)) stages.set(s.stageKey, { id: s.stageKey, name: s.name, deferred: true, plannedDate: s.plannedDate });
      }
    }
    result.push({ label: parent, groups: saved.map((d) => Number(d.groupNumber)), stages: [...stages.values()],
      qualification: playoff.qualification === "top_pools"
        ? "Top pool finishers · qualifier count not configured"
        : "Qualification not configured",
    });
  }
  return result;
}

export interface ParentFixture {
  id: string; group_number: number; stage?: string | null; stage_key?: string | null;
  round_number?: number | null; bracket_position?: number | null;
  status?: string | null; is_bye?: boolean | null;
  scheduled_date?: string | null; scheduled_time?: string | null; play_by?: string | null;
}

/** A saved fixture belongs to exactly one lane; never duplicate it across the child and shared bracket. */
export function parentFixtureLanes<T extends ParentFixture>(parent: ParentProgressionGroup, input: T[]) {
  const seen = new Set<string>();
  const stages = new Set(parent.stages.map((s) => s.id));
  const rows = input.filter((m) => {
    if (!parent.groups.includes(Number(m.group_number)) || seen.has(m.id)) return false;
    seen.add(m.id); return true;
  });
  const isPlayoff = (m: T) => !!m.stage_key && stages.has(m.stage_key) || !!m.stage && m.stage !== "group";
  const ordered = (xs: T[]) => [...xs].sort((a, b) =>
    (a.round_number ?? 0) - (b.round_number ?? 0) ||
    (a.scheduled_date ?? a.play_by ?? "9999").localeCompare(b.scheduled_date ?? b.play_by ?? "9999") ||
    (a.scheduled_time ?? "99").localeCompare(b.scheduled_time ?? "99") ||
    (a.bracket_position ?? 0) - (b.bracket_position ?? 0) || a.id.localeCompare(b.id));
  return { children: new Map(parent.groups.map((g) => [g, ordered(rows.filter((m) => Number(m.group_number) === g && !isPlayoff(m)))])), playoffs: ordered(rows.filter(isPlayoff)) };
}