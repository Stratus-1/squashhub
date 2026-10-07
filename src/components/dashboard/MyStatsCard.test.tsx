import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MyStatsCard } from "./MyStatsCard";
const summary = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-member-stats", () => ({
  STAT_CATEGORY_LABELS: { club: "Club", league: "League", regional: "Regional", national: "National", total: "Total" },
  STAT_CATEGORY_ORDER: ["club", "league", "regional", "national", "total"],
  useMemberStatSeasons: () => ({ data: [2025, 2026] }),
  useMemberStatsSummary: (id: string, year: number | null) => { summary(id, year); return { data: { byCategory: { total: { played: 10, won: 7, lost: 3, winRate: 70 }, club: { played: 4, won: 3, lost: 1, winRate: 75 } } } }; },
}));
vi.mock("@/hooks/use-club", () => ({ useMyClub: () => ({ data: { club: { sla_accepted_at: "2026-01-01" } } }) }));
vi.mock("./MatchHistorySheet", () => ({ MatchHistorySheet: ({ open, category, memberId, seasonYear }: { open: boolean; category: string; memberId: string; seasonYear: number | null }) => open ? <div role="dialog" aria-label={`${category} history`}>{memberId} / {seasonYear ?? "all"}</div> : null }));
afterEach(cleanup);
describe("Member stats presentation", () => {
  it("retains populated totals, season filtering and the same member history action", () => {
    render(<MyStatsCard memberId="member-1" />);
    expect(screen.getByText("10 played")).toBeVisible();
    expect(screen.getByText("70%")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    expect(summary).toHaveBeenLastCalledWith("member-1", 2025);
    fireEvent.click(screen.getByRole("button", { name: /Club 4/ }));
    expect(screen.getByRole("dialog", { name: "club history" })).toHaveTextContent("member-1 / 2025");
  });
  it("defaults to all time and preserves the overall drill-down", () => {
    render(<MyStatsCard memberId="member-2" />);
    expect(summary).toHaveBeenLastCalledWith("member-2", null);
    fireEvent.click(screen.getByRole("button", { name: /Overall/ }));
    expect(screen.getByRole("dialog", { name: "total history" })).toHaveTextContent("member-2 / all");
  });
});