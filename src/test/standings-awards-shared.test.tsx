import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// One in-memory tournament row = the single source of truth both screens use.
const db: { row: any; completed: number } = { row: {}, completed: 0 };
vi.mock("@/lib/supabase-ext", () => ({
  fromExt: (table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: JSON.parse(JSON.stringify(db.row)) }),
      update: (patch: any) => ({ eq: async () => { Object.assign(db.row, patch); return { error: null }; } }),
      then: (r: any) => r({ count: table === "club_champs_matches" ? db.completed : 0 }),
    };
    return q;
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { StandingsAwardsSection } from "@/components/smart-builder/StandingsAwardsSection";

const spoon = async () => {
  fireEvent.click(await screen.findByText(/Edit/));
  return screen.getByLabelText("Wooden Spoon") as HTMLInputElement;
};

describe("Standings & awards — shared between Setup and the tournament admin panel", () => {
  beforeEach(() => { cleanup(); db.row = { beta_lifecycle: { stage: "activate" }, builder_spec: {}, status: "open" }; db.completed = 0; });

  it("a change in one screen is what the other screen loads", async () => {
    const onSaved = vi.fn();
    render(<StandingsAwardsSection tournamentId="t1" onSaved={onSaved} />); // admin panel
    const cb = await spoon();
    const before = cb.checked;
    fireEvent.click(cb);
    await waitFor(() => expect(db.row.beta_lifecycle.standings_awards.woodenSpoon).toBe(!before));
    expect(db.row.beta_lifecycle.stage).toBe("activate"); // other lifecycle data kept
    expect(onSaved).toHaveBeenCalled();
    cleanup();
    render(<StandingsAwardsSection tournamentId="t1" />); // Setup
    expect((await spoon()).checked).toBe(!before);
  });

  it("asks before changing awards once results exist, and keeps the value if cancelled", async () => {
    db.completed = 3;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<StandingsAwardsSection tournamentId="t1" />);
    const cb = await spoon();
    const before = cb.checked;
    fireEvent.click(cb);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(db.row.beta_lifecycle.standings_awards).toBeUndefined();
    expect(cb.checked).toBe(before);
    confirm.mockReturnValue(true);
    fireEvent.click(cb);
    await waitFor(() => expect(db.row.beta_lifecycle.standings_awards?.woodenSpoon).toBe(!before));
    confirm.mockRestore();
  });
});
