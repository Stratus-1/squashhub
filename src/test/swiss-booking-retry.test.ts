import { describe, expect, it } from "vitest";
import { projectCourtFixtures, projectSwissBookingRetries, type ProjectionInput } from "@/lib/tournaments/projected-court-fixtures";

function input(): ProjectionInput {
  return {
    champ: { id: "synthetic", club_id: "club", swiss_rounds: { 1: 5 } },
    arch: { builder_architecture: "structured", builder_spec: { divisions: [{ divisionId: "d", groupNumber: 1, stages: [{ id: "s", order: 0, kind: "swiss", swissRounds: 5, schedule: { rule: "fixed", roundDates: [null, "2026-10-29"] } }] }] }, start_time: "18:00", end_time: "22:00", match_duration_minutes: 30, court_ids: [1, 2] },
    entries: Array.from({ length: 16 }, (_, i) => ({ group_number: 1, club_member_id: `p${i + 1}`, order_index: i })),
    matches: Array.from({ length: 8 }, (_, i) => ({ id: `r1-${i}`, group_number: 1, round_number: 1, player_a_member_id: `p${i + 1}`, player_b_member_id: `p${16 - i}`, winner_member_id: `p${i + 1}`, status: "completed" })),
    rounds: [], courts: [{ id: 1 }, { id: 2 }],
  };
}
describe("Failed initial Swiss court booking recovery", () => {
  it("retries the same saved fixture without creating a second pairing, then stops once booked", () => {
    const i = input();
    const first = projectCourtFixtures(i)[0];
    expect(first).toBeDefined();
    const row = { id: "saved", group_number: first.group, round_number: first.round, player_a_member_id: first.aId, player_b_member_id: first.bId, status: "scheduled" };
    i.matches.push(row);
    expect(projectCourtFixtures(i).some((f) => f.aId === first.aId && f.bId === first.bId)).toBe(false);
    expect(projectSwissBookingRetries(i)).toEqual([expect.objectContaining({ matchId: "saved", aId: first.aId, bId: first.bId, courtId: first.courtId })]);
    expect(projectSwissBookingRetries({ ...i, matches: i.matches.map((m) => m.id === "saved" ? { ...m, booking_id: "booking" } : m) })).toEqual([]);
  });
  it.each([{ status: "in_progress" }, { score: "3-1" }, { court_id: 1 }, { booking_id: "personal" }])("never retries started, scored or allocated games: %j", (patch) => {
    const i = input(), first = projectCourtFixtures(i)[0];
    expect(first).toBeDefined();
    i.matches.push({ id: "saved", group_number: first.group, round_number: first.round, player_a_member_id: first.aId, player_b_member_id: first.bId, status: "scheduled", ...patch });
    expect(projectSwissBookingRetries(i)).toEqual([]);
  });
});