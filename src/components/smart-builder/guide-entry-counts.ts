import { placesOf, type Picks } from "@/lib/smart-builder/pick-entries";
import { unitsFor, type RegLite } from "@/lib/smart-builder/step-draw";

export type GuideEntryCount = { entered: number; selected: number; total: number };
/** Read-only player entries; overlapping saved registrations and local picks count once. */
export function guideEntryCounts(cats: string[], keys: string[], picks: Picks, regs: RegLite[]) {
  const counts: Record<string, GuideEntryCount> = {};
  keys.forEach((key, index) => {
    const entered = new Set(unitsFor(regs, index + 1, keys.length, false).units.map((u) => u.member));
    const selected = new Set(Object.keys(picks).filter((id) => placesOf(picks, id).includes(key)));
    counts[key] = { entered: entered.size, selected: selected.size, total: new Set([...entered, ...selected]).size };
  });
  cats.forEach((cat) => {
    const children = keys.filter((key) => key.startsWith(`${cat}::`));
    if (!children.length) return;
    counts[cat] = children.reduce((sum, key) => ({ entered: sum.entered + counts[key].entered, selected: sum.selected + counts[key].selected, total: sum.total + counts[key].total }), { entered: 0, selected: 0, total: 0 });
  });
  return counts;
}
export function guideCountText(count?: GuideEntryCount, state: "ready" | "loading" | "error" = "ready") {
  const selected = count?.selected ?? 0;
  if (state === "loading") return `(${selected} selected players · entered loading…)`;
  if (state === "error") return `(${selected} selected players · entered unavailable)`;
  return `(${count?.entered ?? 0} entered · ${selected} selected · ${count?.total ?? 0} total player entries)`;
}