import { StandardFormat } from "./standard";
import type { TournamentFormat } from "./types";

export function targetWinner(a: number, b: number, target: number): "a" | "b" | null {
  if (!Number.isInteger(target) || target < 1 || a === b || Math.max(a, b) < target) return null;
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