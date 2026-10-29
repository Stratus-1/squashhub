import { StandardFormat } from "./standard";
import type { TournamentFormat } from "./types";

export function targetWinner(a: number, b: number, target: number, condition: "sudden_death" | "win_by_2" = "sudden_death"): "a" | "b" | null {
  if (![a, b, target].every(Number.isInteger) || a < 0 || b < 0 || target < 1 || a === b) return null;
  const high = Math.max(a, b), low = Math.min(a, b);
  if (high < target) return null;
  if (condition === "sudden_death" ? high !== target : (low < target - 1 ? high !== target : high - low !== 2)) return null;
  return a > b ? "a" : "b";
}

export const FirstToTargetFormat: TournamentFormat = {
  ...StandardFormat,
  key: "first_to_target",
  label: "First to target",
  description: "One game; first to the target wins. One standings point per win.",
  badge: { label: "First to target", variant: "outline" },
  rankStandings: (a, b) => b.won - a.won,
  standingsColumns: [{ key: "points", label: "Pts", title: "One point per win", render: (row) => String(row.won) }],
};