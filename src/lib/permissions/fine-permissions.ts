/**
 * Finer club permissions.
 *
 * A broad area slug (e.g. "finance") still means the whole area, exactly as
 * before, so every existing role keeps all of its access. An admin may instead
 * grant only some parts of an area using dotted child slugs ("finance.enter").
 *
 * Rules (mirrored by the database helper `perm_slug_granted`):
 *  1. A slug is granted when it is held exactly.
 *  2. A child slug "area.part" is granted when the whole area "area" is held.
 *  3. "area.view" is granted when any part of the area is held — anybody who
 *     may work in an area may also look at it.
 * Holding a part never grants the whole area.
 */

export interface SubPermission {
  value: string;
  label: string;
}

export const PERMISSION_CHILDREN: Record<string, SubPermission[]> = {
  finance: [
    { value: "finance.view", label: "View reports only" },
    { value: "finance.enter", label: "Enter transactions and journals" },
    { value: "finance.approve", label: "Approve EFT payments and top-ups" },
    { value: "finance.reverse", label: "Delete or reverse transactions" },
    { value: "finance.bank", label: "Import bank statements and reconcile" },
    { value: "finance.billing", label: "Member billing and annual renewals" },
    { value: "finance.payroll", label: "Bar staff payroll" },
  ],
  bar: [
    { value: "bar.stock", label: "Stock and purchases" },
    { value: "bar.stocktake", label: "Stock takes" },
    { value: "bar.cashup", label: "Cash-up" },
    { value: "bar.prices", label: "Items, prices and specials" },
    { value: "bar.staff", label: "Staff, PINs and shifts" },
  ],
  members: [
    { value: "members.view", label: "View members only" },
    { value: "members.edit", label: "Add and edit member details" },
    { value: "members.approve", label: "Approve applications and family requests" },
    { value: "members.status", label: "Suspend or resign members" },
  ],
  champs: [
    { value: "champs.setup", label: "Set up tournaments and draws" },
    { value: "champs.results", label: "Enter or correct results" },
    { value: "champs.paid", label: "Mark entries paid" },
  ],
  communications: [
    { value: "communications.send", label: "Send messages" },
    { value: "communications.templates", label: "Edit templates" },
  ],
};

/** Every child slug, flattened. */
export const ALL_CHILD_SLUGS: string[] = Object.values(PERMISSION_CHILDREN).flat().map((c) => c.value);

export function parentOf(slug: string): string | null {
  const i = slug.indexOf(".");
  return i > 0 ? slug.slice(0, i) : null;
}

export function childLabel(slug: string): string | null {
  const p = parentOf(slug);
  if (!p) return null;
  return PERMISSION_CHILDREN[p]?.find((c) => c.value === slug)?.label ?? null;
}

/** Same rule as the database helper `perm_slug_granted(held, slug)`. */
export function permissionGranted(held: Iterable<string> | null | undefined, slug: string): boolean {
  const list = held ? Array.from(held) : [];
  if (list.includes(slug)) return true;
  const parent = parentOf(slug);
  if (!parent) return false;
  if (list.includes(parent)) return true;
  if (slug === `${parent}.view`) return list.some((h) => h.startsWith(`${parent}.`));
  return false;
}

/** True when the member may open the area at all (whole area or any part of it). */
export function hasPermissionArea(held: Iterable<string> | null | undefined, area: string): boolean {
  const list = held ? Array.from(held) : [];
  return list.some((h) => h === area || h.startsWith(`${area}.`));
}

/**
 * Expand stored grants into every slug they imply, so UI code can use a plain
 * `set.has("finance.enter")`. The whole-area slug is only present when it was
 * actually granted.
 */
export function expandPermissions(held: Iterable<string> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const h of held ?? []) {
    out.add(h);
    const children = PERMISSION_CHILDREN[h];
    if (children) children.forEach((c) => out.add(c.value));
    const p = parentOf(h);
    if (p && PERMISSION_CHILDREN[p]) out.add(`${p}.view`);
  }
  return out;
}

/**
 * Tidy a selection before saving: when the whole area is ticked the separate
 * parts are redundant and are dropped, so the stored list stays readable.
 */
export function normaliseSelection(selected: Iterable<string>): string[] {
  const set = new Set(selected);
  return Array.from(set).filter((s) => {
    const p = parentOf(s);
    return !(p && set.has(p));
  });
}
