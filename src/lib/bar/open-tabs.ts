export interface OpenTabListItem {
  tab_id: string;
  guest_name: string;
  opened_at: string;
}

const tabNameCollator = new Intl.Collator("en-ZA", { sensitivity: "base" });

/** Display-only ordering and filtering; the supplied board rows are never mutated. */
export function sortAndFilterOpenTabs<T extends OpenTabListItem>(tabs: T[], query: string): T[] {
  const search = query.trim().toLocaleLowerCase();
  return tabs
    .filter(tab => !search || tab.guest_name.toLocaleLowerCase().includes(search))
    .slice()
    .sort((a, b) =>
      tabNameCollator.compare(a.guest_name.trim(), b.guest_name.trim())
      || a.opened_at.localeCompare(b.opened_at)
      || a.tab_id.localeCompare(b.tab_id),
    );
}
