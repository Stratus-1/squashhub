import { expect, it } from "vitest";
import { checkBookingCaps } from "../../supabase/functions/_shared/booking-caps";
const club = { peak_day_overrides: { "4": { start: "15:45", end: "19:30" } }, max_bookings_per_day: 2, max_peak_bookings_per_day: 1 };
const base = { club, date: "2026-11-05", unlimited: false, unlimitedNonPeak: false };
it("blocks a second peak booking before GoBook", () => {
  expect(checkBookingCaps({ ...base, start: "18:45", end: "19:30", existing: [{ start_time: "18:00:00", end_time: "18:45:00" }] })).toMatch(/Peak-hour/);
});
it("allows one peak plus one off-peak", () => {
  expect(checkBookingCaps({ ...base, start: "06:00", end: "06:45", existing: [{ start_time: "18:00:00", end_time: "18:45:00" }] })).toBeNull();
});
it("blocks a third booking of the day", () => {
  expect(checkBookingCaps({ ...base, start: "07:00", end: "07:45", existing: [{ start_time: "06:00", end_time: "06:45" }, { start_time: "18:00", end_time: "18:45" }] })).toMatch(/Daily/);
});
it("bookings_unlimited bypasses; non-peak permission does not bypass peak", () => {
  const existing = [{ start_time: "18:00", end_time: "18:45" }];
  expect(checkBookingCaps({ ...base, unlimited: true, start: "18:45", end: "19:30", existing })).toBeNull();
  expect(checkBookingCaps({ ...base, unlimitedNonPeak: true, start: "18:45", end: "19:30", existing })).toMatch(/Peak-hour/);
});
