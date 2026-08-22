import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelfScheduledRounds } from "@/components/club-admin/tournament/SelfScheduledRounds";

describe("SelfScheduledRounds panel", () => {
  it("shows only the current round and no court/time controls", () => {
    render(
      <SelfScheduledRounds
        deadlines={[{ label: "Round 1", date: "2026-03-01" }]}
        onChange={() => {}}
        progress={[{ roundNumber: 1, total: 4, completed: 1, complete: false }]}
        totalRounds={3}
      />,
    );
    expect(screen.getByText(/Current round: Round 1/)).toBeTruthy();
    expect(screen.getByText(/Must be played by/)).toBeTruthy();
    expect(screen.queryByText(/court/i)?.textContent || "").not.toMatch(/Courts used/);
    // Later rounds are locked, not configurable.
    expect(screen.getByText(/Later rounds are not set up yet/)).toBeTruthy();
    // No club-scheduled switch this early in the draw.
    expect(screen.queryByText(/Club schedules this stage/)).toBeNull();
  });

  it("offers the club-scheduled switch at the final", () => {
    const onChange = vi.fn();
    render(
      <SelfScheduledRounds
        deadlines={[
          { label: "Round 1", date: "2026-03-01" },
          { label: "Semi-final", date: "2026-03-08" },
        ]}
        onChange={onChange}
        progress={[
          { roundNumber: 1, total: 2, completed: 2, complete: true },
          { roundNumber: 2, total: 1, completed: 0, complete: false },
        ]}
        totalRounds={2}
      />,
    );
    expect(screen.getByText(/Completed rounds/)).toBeTruthy();
    const toggle = screen.getByText(/Club schedules this stage/);
    expect(toggle).toBeTruthy();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0];
    expect(next[1].mode).toBe("club");
    expect(next[0]).toEqual({ label: "Round 1", date: "2026-03-01" });
  });
});
