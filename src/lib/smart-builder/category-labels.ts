/** Category identity remains the existing tournament/unit key; names are presentation only. */
export function categoryDisplayName(a: { categoryLabels?: Record<string, string> }, key: string): string {
  const [parent, child] = key.split("::");
  return a.categoryLabels?.[key] ?? (child ? `${a.categoryLabels?.[parent] ?? parent} › ${child}` : parent);
}

export function categoryLabelOnlyChange(before: Record<string, any>, after: Record<string, any>): boolean {
  const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const comparable = (a: Record<string, any>) => {
    const copy = structuredClone(a);
    delete copy.categoryLabels;
    if (copy.originalStructure) {
      delete copy.originalStructure.group_labels;
      delete copy.originalStructure.category_locks;
    }
    return JSON.stringify(stable(copy));
  };
  // Unlock/relock is also presentation-only; it must not run fixture reconciliation.
  return comparable(before) === comparable(after);
}