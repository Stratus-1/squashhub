import { describe, it, expect } from "vitest";
import { matchDetailsFor, matchDetailsHtml, matchDetailsText, dayLabel, type DetailContext } from "@/lib/smart-builder/draw-match-details";

const base = (over: Partial<DetailContext> = {}): DetailContext => ({
  tournamentName: "Club Champs",
  names: { me: "Willem Pretorius", opp: "Kabelo Phillips", p1: "Anna", o2: "Ben", o3: "<script>x</script>" },
  categoryOf: (g) => (g === 1 ? "Mens A" : "Mixed Doubles"),
  courts: { c20: { id: "c20", name: "Court 1", venue_name: "Riverside" } },
  bookings: {}, clubVenue: "Riverside Club", matches: [], ...over,
});

describe("draw email: Your match details", () => {
  it("formats the date without timezone shift", () => { expect(dayLabel("2026-11-24")).toBe("Tue 24 Nov 2026"); });
  it("planned allocation says scheduled, never 'booking confirmed'", () => {
    const d = matchDetailsFor("me", base({ matches: [{ id: "m1", group_number: 1, round_number: 1, player_a_member_id: "me", player_b_member_id: "opp", scheduled_date: "2026-11-24", scheduled_time: "18:00:00", court_id: "c20" }] }));
    expect(d[0]).toMatchObject({ opponent: "Kabelo Phillips", when: "Tue 24 Nov 2026", time: "18:00", court: "Court 1", venue: "Riverside", state: "scheduled" });
    expect(matchDetailsHtml(d)).toContain("Your match is scheduled for");
    expect(matchDetailsHtml(d)).not.toContain("booking confirmed");
  });
  it("only an active linked booking says Court booking confirmed, with end time", () => {
    const d = matchDetailsFor("me", base({ bookings: { b1: { id: "b1", status: "active", date: "2026-11-24", start_time: "18:00", end_time: "18:45", court_id: "c20" } },
      matches: [{ id: "m1", group_number: 1, player_a_member_id: "opp", player_b_member_id: "me", scheduled_date: "2026-11-24", scheduled_time: "18:00", court_id: "c20", booking_id: "b1" }] }));
    expect(d[0]).toMatchObject({ state: "booked", time: "18:00–18:45", opponent: "Kabelo Phillips" });
    const cancelled = matchDetailsFor("me", base({ bookings: { b1: { id: "b1", status: "cancelled" } }, matches: [{ id: "m1", player_a_member_id: "me", player_b_member_id: "opp", booking_id: "b1" }] }));
    expect(cancelled[0].state).toBe("tbc");
  });
  it("missing time/court/opponent shows To be confirmed", () => {
    const d = matchDetailsFor("me", base({ matches: [{ id: "m1", round_number: 2, player_a_member_id: "me", player_b_member_id: null }] }));
    expect(d[0]).toMatchObject({ opponent: "To be confirmed", when: "To be confirmed", time: "To be confirmed", court: "To be confirmed", round: "Round 2" });
  });
  it("doubles: names both opponents and the partner; multiple games sorted by date; escapes names", () => {
    const d = matchDetailsFor("p1", base({ matches: [
      { id: "m2", group_number: 2, player_a_member_id: "o2", partner_a_member_id: "o3", player_b_member_id: "me", partner_b_member_id: "p1", scheduled_date: "2026-11-25" },
      { id: "m1", group_number: 2, player_a_member_id: "p1", player_b_member_id: "opp", scheduled_date: "2026-11-24" },
    ] }));
    expect(d.map((x) => x.matchId)).toEqual(["m1", "m2"]);
    expect(d[1]).toMatchObject({ opponent: "Ben & <script>x</script>", partner: "Willem Pretorius" });
    expect(matchDetailsHtml(d)).toContain("&lt;script&gt;");
    expect(matchDetailsHtml(d)).not.toContain("<script>");
  });
  it("never contains phone numbers and is empty for a player with no game", () => {
    expect(matchDetailsFor("nobody", base({ matches: [{ id: "m1", player_a_member_id: "me", player_b_member_id: "opp" }] }))).toEqual([]);
    expect(matchDetailsHtml([])).toBe("");
    const t = matchDetailsText(matchDetailsFor("me", base({ matches: [{ id: "m1", player_a_member_id: "me", player_b_member_id: "opp", play_by: "2026-10-27" }] })));
    expect(t).toContain("Play by Tue 27 Oct 2026");
    expect(t).not.toMatch(/\+27|0\d{9}/);
  });
});
