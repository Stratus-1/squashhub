/** Planning-only unordered group edges; never a generator or a pool-boundary bypass. */
export interface RRTopology {
  mode: "within" | "between" | "custom";
  /** Zero-based group indexes. Diagonal edges mean within-group round robin. */
  edges?: [number, number][];
  /** Explicit expected allocation; must sum to the stage field. */
  sizes?: number[];
}

export function rrSizes(n: number, count: number, topology?: RRTopology): number[] {
  if (topology?.sizes) return topology.sizes;
  const p = Math.max(1, Math.floor(count));
  return Array.from({ length: p }, (_, i) => Math.floor(n / p) + (i < n % p ? 1 : 0));
}

export function rrEdges(count: number, topology?: RRTopology): [number, number][] {
  if (!topology || topology.mode === "within") return Array.from({ length: count }, (_, i) => [i, i]);
  const seen = new Set<string>();
  return (topology.edges ?? []).flatMap(([x, y]) => {
    const a = Math.min(x, y), b = Math.max(x, y), key = `${a}:${b}`;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b >= count || (a === b && topology.mode === "between") || seen.has(key)) return [];
    seen.add(key);
    return [[a, b] as [number, number]];
  });
}

export function rrIssues(n: number, count: number, topology?: RRTopology): string[] {
  const sizes = rrSizes(n, count, topology), errors: string[] = [];
  if (!Number.isInteger(count) || count < 1 || count > Math.max(1, n)) errors.push("Choose a valid group count.");
  if (sizes.length !== count || sizes.some((s) => !Number.isInteger(s) || s < 1) || sizes.reduce((a, b) => a + b, 0) !== n) errors.push("Group entries must be positive whole numbers and total the stage entrants.");
  if (topology && topology.mode !== "within") {
    if ((topology.edges ?? []).some(([a, b]) => !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= count || b >= count || (a === b && topology.mode === "between"))) errors.push("Saved matchups refer to unavailable groups; review the matrix.");
    const edges = rrEdges(count, topology);
    if (!edges.length) errors.push("Select at least one group matchup.");
    if (Array.from({ length: count }, (_, i) => i).some((i) => !edges.some(([a, b]) => a === i || b === i))) errors.push("Every group needs a matchup, or remove it from this stage.");
  }
  return errors;
}

export function rrMatchCount(sizes: number[], topology?: RRTopology): number {
  return rrEdges(sizes.length, topology).reduce((n, [a, b]) => n + (a === b ? sizes[a] * (sizes[a] - 1) / 2 : sizes[a] * sizes[b]), 0);
}

/** Slot-level preview only. No self-match and no reciprocal duplicate. */
export function rrSlotPairs(sizes: number[], topology?: RRTopology): [string, string][] {
  return rrEdges(sizes.length, topology).flatMap(([a, b]) => Array.from({ length: sizes[a] }, (_, x) =>
    Array.from({ length: sizes[b] }, (_, y) => y).filter((y) => a !== b || x < y).map((y) => [`${a}:${x}`, `${b}:${y}`] as [string, string])
  ).flat());
}