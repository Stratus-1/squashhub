import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CapacityCheck } from "@/components/club-admin/tournament/CapacityCheck";

const leagues = [{ groupNumber: 1, label: "League 1", format: "single_round_robin" as const, slotMinutes: 20, pools: 1, entities: 8, playoffs: false }];

describe("CapacityCheck", () => {
  it("shows incomplete state", () => {
    render(<CapacityCheck customizeDailySchedule={false} daySchedules={[]} startDate="" endDate="" playDays={[]} startTime="08:00" endTime="18:00" selectedCourtIds={[]} leagues={leagues} isDoubles={false} crossLeague={false} parallelLeagues={false} onParallelLeaguesChange={() => {}} />);
    expect(screen.getByText(/Add tournament dates, playing times and courts/)).toBeTruthy();
  });
  it("renders numbers and details", () => {
    render(<CapacityCheck customizeDailySchedule={false} daySchedules={[]} startDate="2026-09-05" endDate="2026-09-05" playDays={[6]} startTime="08:00" endTime="18:00" selectedCourtIds={[1,2,3,4]} leagues={leagues} isDoubles={false} crossLeague={false} parallelLeagues={false} onParallelLeaguesChange={() => {}} />);
    expect(screen.getByText(/4 courts · 1 session over 1 day = 40h of court time/)).toBeTruthy();
    fireEvent.click(screen.getByText(/How is this calculated/));
    expect(screen.getByText(/match slot/)).toBeTruthy();
  });
});
