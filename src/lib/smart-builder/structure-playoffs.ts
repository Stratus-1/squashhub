/**
 * Planned play-offs ticked per category on the Tournament structure page
 * (`league_planned_playoff_rounds`, keyed by structure row id) drive the
 * play-off stages on Stages & scheduling. Only dates/times/courts are edited there.
 */
export type PlayoffStageLike = { id: string; name: string; unit: string; phase?: string; [k: string]: unknown };

const ORDER = [
  { code: "qf", name: "Quarterfinal" },
  { code: "sf", name: "Semifinal" },
  { code: "final", name: "Final" },
] as const;

export const playoffCode = (name: string): "qf" | "sf" | "final" | null => {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  if (n.startsWith("quarterfinal")) return "qf";
  if (n.startsWith("semifinal")) return "sf";
  if (n === "final" || n === "finals") return "final";
  return null;
};

/** unit key -> ticked play-off rounds; null when the structure page set none. */
export function plannedPlayoffsByUnit(raw: Record<string, any> | undefined): Record<string, string[]> | null {
  const rounds = raw?.league_planned_playoff_rounds as Record<string, string[]> | undefined;
  const keys: string[] = raw?._unit_keys ?? [];
  if (!rounds || !keys.length || !Object.keys(rounds).length) return null;
  const out: Record<string, string[]> = {};
  keys.forEach((key, i) => { out[key] = (rounds[String(i + 1)] ?? []).filter((c) => ORDER.some((o) => o.code === c)); });
  // Nothing actually ticked: let organisers add play-off stages here by hand
  // instead of the sync silently removing every stage they add.
  if (!Object.values(out).some((r) => r.length > 0)) return null;
  return out;
}

/**
 * Returns the stage list with play-off stages matching the structure: a round all
 * categories play stays shared (unit ""), a round only some play is scoped to each
 * of those categories, unticked rounds are removed. Dates/times/courts are kept.
 */
export function syncPlayoffStages<T extends PlayoffStageLike>(stages: T[], planned: Record<string, string[]>, make: (name: string, unit: string) => T): T[] {
  const units = Object.keys(planned);
  const others = stages.filter((s) => s.phase !== "playoff" || !playoffCode(s.name));
  const result: T[] = [];
  for (const { code, name } of ORDER) {
    const need = units.filter((u) => planned[u].includes(code));
    const existing = stages.filter((s) => s.phase === "playoff" && playoffCode(s.name) === code);
    if (!need.length) continue;
    const shared = existing.find((s) => !s.unit);
    const template = shared ?? existing[0];
    if (need.length === units.length && units.length > 1) {
      result.push(shared ? shared : template ? { ...template, unit: "" } : make(name, ""));
      continue;
    }
    let reused = false;
    for (const u of need) {
      const own = existing.find((s) => s.unit === u);
      if (own) { result.push(own); continue; }
      if (!template) { result.push(make(name, u)); continue; }
      const canReuse = !reused && !template.unit;
      reused ||= canReuse;
      result.push({ ...template, unit: u, ...(canReuse ? {} : { id: Math.random().toString(36).slice(2) }) });
    }
  }
  return [...others, ...carryFirstPairing(result)];
}

const POOL_PAIRINGS = new Set(["crossover", "same_position", "seeded"]);
/**
 * A round ticked in front of existing play-offs (e.g. Quarterfinal added after Semifinal) starts as "Decide later".
 * The pool pairing the organiser saved on the stage it now precedes moves to the new first stage, and the later
 * stages follow winners — so adding a round never loses the saved pairing. Nothing is invented when none was saved.
 */
export function carryFirstPairing<T extends PlayoffStageLike>(stages: T[]): T[] {
  const byUnit = new Map<string, T[]>();
  stages.forEach((s) => byUnit.set(s.unit, [...(byUnit.get(s.unit) ?? []), s]));
  const patch = new Map<string, Partial<T>>();
  byUnit.forEach((list) => {
    const sorted = [...list].sort((a, b) => ORDER.findIndex((o) => o.code === playoffCode(a.name)) - ORDER.findIndex((o) => o.code === playoffCode(b.name)));
    if (sorted.length < 2 || POOL_PAIRINGS.has(String(sorted[0].pairing ?? ""))) return;
    const donor = sorted.slice(1).find((s) => POOL_PAIRINGS.has(String(s.pairing ?? "")));
    if (!donor) return;
    patch.set(sorted[0].id, { pairing: donor.pairing } as Partial<T>);
    sorted.slice(1).forEach((s) => patch.set(s.id, { pairing: "winners" } as Partial<T>));
  });
  return stages.map((s) => (patch.has(s.id) ? { ...s, ...patch.get(s.id) } : s));
}

export function samePlayoffStages(a: PlayoffStageLike[], b: PlayoffStageLike[]): boolean {
  const k = (l: PlayoffStageLike[]) => l.filter((s) => s.phase === "playoff").map((s) => `${s.id}|${s.unit}|${s.name}|${String(s.pairing ?? "")}`).join(",");
  return k(a) === k(b) && a.length === b.length;
}
