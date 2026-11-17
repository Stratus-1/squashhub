/** Alphabetical (case-insensitive, natural numbers) ordering for finance report lines. */
export const compareLabel = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
export const byLabel = <T extends { label: string }>(rows: T[]): T[] => [...rows].sort((a, b) => compareLabel(a.label, b.label));
