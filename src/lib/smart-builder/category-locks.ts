export type CategoryLocks = Record<string, boolean>;
/** Category safety state is keyed by stable answer identity, not display numbering. */
export function categoryLockKey(unit: string, groupedParent?: string): string {
  return groupedParent ?? unit;
}
export function setCategoryLocked(locks: CategoryLocks, key: string, locked: boolean): CategoryLocks {
  return { ...locks, [key]: locked };
}