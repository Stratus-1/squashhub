/** Display-only menu personalisation. Never used for authorisation: it can
 *  only reorder or hide items the caller already passes in as visible. */
export type MenuPrefs = { groups: Record<string, string[]>; hidden: string[] };
export const EMPTY_PREFS: MenuPrefs = { groups: {}, hidden: [] };

export function normalisePrefs(raw: unknown): MenuPrefs {
  const r = (raw ?? {}) as Partial<MenuPrefs>;
  const groups: Record<string, string[]> = {};
  if (r.groups && typeof r.groups === "object") {
    for (const [k, v] of Object.entries(r.groups)) if (Array.isArray(v)) groups[k] = v.filter((x) => typeof x === "string");
  }
  return { groups, hidden: Array.isArray(r.hidden) ? r.hidden.filter((x) => typeof x === "string") : [] };
}

/** Order visible items by the saved order. Items not in the saved order (new
 *  menus) are placed right after their nearest default predecessor. Saved ids
 *  that aren't visible are ignored, so nothing hidden by permissions appears. */
export function applyOrder<T>(items: T[], saved: string[] | undefined, id: (t: T) => string): T[] {
  if (!saved?.length) return items;
  const byId = new Map(items.map((t) => [id(t), t]));
  const out: string[] = saved.filter((s, i) => byId.has(s) && saved.indexOf(s) === i);
  items.forEach((t, idx) => {
    const k = id(t);
    if (out.includes(k)) return;
    let pos = 0;
    for (let j = idx - 1; j >= 0; j--) {
      const p = out.indexOf(id(items[j]));
      if (p >= 0) { pos = p + 1; break; }
    }
    out.splice(pos, 0, k);
  });
  return out.map((k) => byId.get(k)!);
}

export function visibleOnly<T>(items: T[], hidden: string[], id: (t: T) => string, locked: string[] = []): T[] {
  return items.filter((t) => locked.includes(id(t)) || !hidden.includes(id(t)));
}
