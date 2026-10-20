import { describe, expect, it } from "vitest";
import { championshipOnlyDay } from "@/lib/tournaments/reservation-day";
describe("Championship restrictions after release", () => {
  it("opens the released day even when tomorrow still has reservations", () => {
    expect(championshipOnlyDay(["2026-10-21"], "2026-10-20", false)).toBe(false);
    expect(championshipOnlyDay(["2026-10-21"], "2026-10-21", false)).toBe(true);
  });
});