import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CourtsDisplay from "@/pages/CourtsDisplay";
import { PeakTimeIndicator } from "@/components/PeakTimeIndicator";
import { isPeakSlot } from "@/lib/peak-hours";

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.data, isLoading: false }) }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
afterEach(cleanup);

describe("shared court display peak indicator", () => {
  it("retains the booking table marker size, corner and label", () => {
    render(<PeakTimeIndicator />);
    expect(screen.getByTitle("Peak time")).toHaveTextContent("P");
    expect(screen.getByTitle("Peak time")).toHaveClass("absolute", "top-0.5", "right-1", "text-[9px]");
  });

  it.each([30, 40, 45, 60])("uses shared daily peak logic for every court with %i-minute slots", (slot) => {
    for (let day = 0; day < 7; day++) {
      const date = `2026-10-${String(4 + day).padStart(2, "0")}`;
      const club = {
        name: "Sample club", logo_url: null, slot_minutes: slot, open_time: "08:00", last_slot_time: "11:00",
        peak_weekday_start: "09:00", peak_weekday_end: "11:00",
        peak_weekend_start: "08:00", peak_weekend_end: "09:00",
        peak_day_overrides: { "2": { off: true }, "4": { start: "08:40", end: "10:15" } },
      };
      state.data = { club, date, courts: [1, 2, 3, 4].map(id => ({ id, name: `Court ${id}` })), bookings: [] };
      render(<MemoryRouter><CourtsDisplay /></MemoryRouter>);
      let expected = 0;
      for (let minutes = 480; minutes <= 660; minutes += slot) {
        const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
        if (isPeakSlot(new Date(`${date}T12:00:00`), time, club)) expected += 4;
      }
      expect(screen.queryAllByTitle("Peak time")).toHaveLength(expected);
      cleanup();
    }
  });

  it("shows the view-only sign-in notice, centred in the header", () => {
    const club = { name: "Sample club", logo_url: null, slot_minutes: 60, open_time: "08:00", last_slot_time: "11:00" };
    state.data = { club, date: "2026-10-08", courts: [{ id: 1, name: "Court 1" }], bookings: [] };
    render(<MemoryRouter><CourtsDisplay /></MemoryRouter>);
    const notice = screen.getByText(/View only — To make changes to your booking, please log in to the SquashHub app\./);
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveClass("text-center");
    cleanup();
  });
});