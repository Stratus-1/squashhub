/**
 * Member "My Tab" — an OPEN running cart for the current bar visit.
 *
 * It lives only on the member's device and is never written to
 * `bar_tab_entries` (that table is the POSTED member-account ledger; inserting
 * there journals a charge). Settlement turns the open tab into exactly one
 * posted transaction: account charge, card terminal sale, or online card sale.
 */
export type OpenTab = Record<string, number>;

export const openTabStorageKey = (clubId: string, memberId: string) =>
  `sh.bar.openTab.${clubId}.${memberId}`;

export function addToTab(tab: OpenTab, itemId: string, delta: number): OpenTab {
  const next = Math.max(0, Math.floor((tab[itemId] || 0) + delta));
  if (next === 0) {
    const { [itemId]: _drop, ...rest } = tab;
    return rest;
  }
  return { ...tab, [itemId]: next };
}

export function tabCount(tab: OpenTab): number {
  return Object.values(tab).reduce((s, q) => s + (q > 0 ? q : 0), 0);
}

export function tabTotal(tab: OpenTab, prices: Record<string, number>): number {
  return Object.entries(tab).reduce((s, [id, q]) => s + (prices[id] ?? 0) * q, 0);
}

/** Drop items that are no longer sold so a stale tab can't be settled. */
export function pruneTab(tab: OpenTab, validIds: Set<string>): OpenTab {
  return Object.fromEntries(Object.entries(tab).filter(([id, q]) => q > 0 && validIds.has(id)));
}

export function loadOpenTab(key: string): OpenTab {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: OpenTab = {};
    for (const [id, q] of Object.entries(parsed)) {
      const n = Math.floor(Number(q));
      if (n > 0) out[id] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveOpenTab(key: string, tab: OpenTab) {
  try {
    if (tabCount(tab) === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(tab));
  } catch {
    /* storage unavailable — tab stays in memory */
  }
}
