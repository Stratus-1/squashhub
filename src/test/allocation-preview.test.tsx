import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AllocationPreview } from "@/components/tournaments/AllocationPreview";
import { fixtureEligibility, previewSwap, validateAllocation, verifyPlanBlocks, type AllocationContext, type AllocationMatch } from "@/lib/tournaments/allocation-preview";
const a: AllocationMatch = { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", champ_id: "t", status: "scheduled", scheduled_date: "2026-11-04", scheduled_time: "18:00", court_id: 1, duration: 30, player_a_member_id: "p1", player_b_member_id: "p2", title: "Ann v Bea" };
const b: AllocationMatch = { ...a, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", scheduled_time: "19:00", player_a_member_id: "p3", player_b_member_id: "p4", title: "Cara v Dee" };
const booking = { id: "hold", club_id: "club", court_id: 1, date: "2026-11-04", start_time: "18:00", end_time: "21:00", source: "club_event", booking_type: "match", external_id: "sbs:plan:stage:1", ops_note: "Tournament court reservation (Step-by-Step Beta)" };
const tournament = { id: "t", club_id: "club", beta_lifecycle: { answers: { planId: "plan", stages: [{ id: "stage", mode: "scheduled", date: booking.date, from: "18:00", to: "21:00", courtIds: ["1"] }] } } };
const ctx: AllocationContext = { clubId: "club", tournamentId: "t", authorized: true, complete: true, bookings: [booking], blocks: verifyPlanBlocks([booking], tournament), matches: [a, b], now: "2026-10-14T22:00" };
describe("read-only tournament allocations", () => {
  it("verifies exact server plan evidence, not championship text", () => {
    expect(ctx.blocks).toHaveLength(1);
    expect(verifyPlanBlocks([{ ...booking, guest_name: "Club Championship — Stage" }], tournament)).toHaveLength(1);
    expect(verifyPlanBlocks([{ ...booking, external_id: null, guest_name: "Club Championship" }], tournament)).toEqual([]);
    expect(verifyPlanBlocks([{ ...booking, club_member_id: "member" }], tournament)).toEqual([]);
    expect(verifyPlanBlocks([booking], { ...tournament, beta_lifecycle: {} })).toEqual([]);
    expect(verifyPlanBlocks([{ ...booking, end_time: "22:00" }], tournament)).toEqual([]);
  });
  it("allows free allocation without per-match booking and preserves input", () => {
    const before = JSON.stringify(ctx);
    expect(validateAllocation(ctx, a, { date: booking.date, time: "20:00", courtId: 1 })).toBeNull();
    expect(previewSwap(ctx, a, b)).toBeNull();
    expect(JSON.stringify(ctx)).toBe(before);
  });
  it("checks every category and both swap durations", () => {
    const other = { ...b, id: "cccccccc-cccc-cccc-cccc-cccccccccccc", champ_id: "another", scheduled_time: "20:00" };
    expect(validateAllocation({ ...ctx, matches: [...ctx.matches, other] }, a, { date: booking.date, time: "20:00", courtId: 1 })).toMatch(/Another fixture/);
    expect(previewSwap(ctx, { ...a, duration: 200 }, b)).toMatch(/verification/);
  });
  it("blocks personal bookings, live/scored, TBD, stale reads, past and deadlines", () => {
    expect(fixtureEligibility(ctx, { ...a, booking_id: "personal" })).toMatch(/Individually/);
    expect(fixtureEligibility(ctx, { ...a, status: "in_progress" })).toMatch(/Started/);
    expect(fixtureEligibility(ctx, { ...a, score: "0-0" })).toMatch(/scored/);
    expect(fixtureEligibility(ctx, { ...a, player_b_member_id: null })).toMatch(/TBD/);
    expect(fixtureEligibility({ ...ctx, complete: false }, a)).toMatch(/incomplete/);
    expect(fixtureEligibility({ ...ctx, authorized: false }, a)).toMatch(/permission/);
    expect(validateAllocation({ ...ctx, now: "2026-12-01T00:00" }, a, { date: booking.date, time: "20:00", courtId: 1 })).toMatch(/Past/);
    expect(validateAllocation(ctx, { ...a, play_by: "2026-11-03" }, { date: booking.date, time: "20:00", courtId: 1 })).toMatch(/deadline/);
    expect(validateAllocation({ ...ctx, bookings: [...ctx.bookings, { ...booking, id: "personal", start_time: "20:00", end_time: "20:30", user_id: "u" }] }, a, { date: booking.date, time: "20:00", courtId: 1 })).toMatch(/Individually/);
  });
  it("mobile/keyboard selection reviews both matches and cancels without saving", () => {
    render(<AllocationPreview context={ctx} />);
    fireEvent.click(screen.getByRole("button", { name: "Move match Ann v Bea" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview swap" }));
    expect(screen.getByRole("dialog").textContent).toContain("Cara v Dee");
    expect(screen.getByRole("dialog").textContent).toContain("Block reservation remains unchanged");
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /^save|confirm/i })).toBeNull();
  });
  it("desktop handle selects independently of calendar zoom", () => {
    render(<AllocationPreview context={ctx} events={[{ id: a.id, date: booking.date, time: "18:00", court: "Court 1", title: "Ann v Bea", kind: "confirmed" }]} />);
    const zoom = screen.getByTestId("cal-zoom").textContent;
    fireEvent.dragStart(screen.getByRole("button", { name: "Drag Ann v Bea" }), { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    expect(screen.getByTestId("cal-zoom").textContent).toBe(zoom);
    fireEvent.click(screen.getByRole("button", { name: "Preview target 2026-11-04 20:00 Court 1" }));
    expect(screen.getByRole("dialog").textContent).toContain("20:00");
  });
});