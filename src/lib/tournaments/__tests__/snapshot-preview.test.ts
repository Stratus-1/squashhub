import { describe, it, expect } from "vitest";
import { buildSnapshotPreview, type Snapshot, type SnapMatch } from "@/lib/tournaments/snapshot-preview";

const st = (id: string, name: string, mode: string, date: string, deadline: string) => ({ id, name, mode, date, deadline, from: "18:00", to: "21:00", courtIds: ["1", "3"], phase: "main" });
const plan = { stages: [st("s1", "Round 1", "play_by", "2026-10-13", "2026-10-19"), st("s2", "Round 2", "scheduled", "2026-10-20", ""), st("s3", "Round 3", "scheduled", "2026-10-27", ""), st("s4", "Round 4", "scheduled", "2026-11-03", ""), st("s5", "Round 5", "scheduled", "2026-11-10", "")] };
const M = (o: Partial<SnapMatch>): SnapMatch => ({ id: "x", group_number: 1, round_number: 1, status: "scheduled", is_bye: false, player_a_member_id: null, player_b_member_id: null, winner_member_id: null, score: null, scheduled_date: null, scheduled_time: null, court_id: null, booking_id: null, play_by: "2026-10-19", ...o });
const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
const snap = (matches: SnapMatch[], extra: Partial<Snapshot> = {}): Snapshot => ({
  formatPlan: plan, minutes: 45, bookings: [], names: Object.fromEntries(ids.map((x) => [x, x.toUpperCase()])),
  divisions: [{ groupNumber: 1, label: "Mens B", kind: "swiss", swissRounds: 6 }],
  entries: ids.map((x, i) => ({ group_number: 1, club_member_id: x, order_index: i })), matches, ...extra,
});
const r1 = [1, 2, 3, 4].map((i) => M({ id: `m${i}`, player_a_member_id: `p${i}`, player_b_member_id: `p${9 - i}` }));
const dec = { swissRounds: 5, moveRrToStageDates: true, treatMissingOpponentAsBye: true };

describe("snapshot preview (pure, read-only)", () => {
  it("does not mutate the input snapshot", () => {
    const s = snap(r1.map((m) => ({ ...m }))); const before = JSON.stringify(s);
    buildSnapshotPreview(s, dec, { results: { m1: "p1" }, stageOverrides: { s1: { deadline: "2026-10-25" } } });
    expect(JSON.stringify(s)).toBe(before);
  });
  it("booked R1 keeps its slot; others show Play by 19 Oct; flags Swiss round mismatch", () => {
    const ms = [{ ...r1[0], booking_id: "b1", scheduled_date: "2026-10-14", scheduled_time: "18:00" }, ...r1.slice(1)];
    const p = buildSnapshotPreview(snap(ms), dec);
    expect(p.upcoming.find((u) => u.key === "m1")?.source).toBe("live_booked");
    expect(p.upcoming.filter((u) => u.source === "live_play_by").every((u) => u.when === "Play by 2026-10-19")).toBe(true);
    expect(p.discrepancies.some((d) => /Saved Swiss rounds 6/.test(d.text))).toBe(true);
  });
  it("R2 Swiss fixture appears only when both feeder results exist; slot proposed in R2 window", () => {
    const none = buildSnapshotPreview(snap(r1), dec);
    expect(none.upcoming.some((u) => u.round === 2)).toBe(false);
    const all = buildSnapshotPreview(snap(r1), dec, { results: { m1: "p1", m2: "p2", m3: "p3", m4: "p4" }, stageOverrides: {} });
    const r2 = all.upcoming.filter((u) => u.round === 2);
    expect(r2.length).toBeGreaterThan(0);
    expect(r2.every((u) => !/TBD|#/.test(`${u.a}${u.b}`))).toBe(true);
    expect(all.proposals.every((p) => p.date === "2026-10-20")).toBe(true);
  });
  it("switching R2 to play-by in simulation replaces slots with deadline", () => {
    const p = buildSnapshotPreview(snap(r1), dec, { results: { m1: "p1", m2: "p2", m3: "p3", m4: "p4" }, stageOverrides: { s2: { mode: "play_by", deadline: "2026-10-23" } } });
    const r2 = p.upcoming.filter((u) => u.round === 2);
    expect(r2.length).toBeGreaterThan(0); expect(r2.every((u) => u.when.startsWith("Play by 2026-10-23"))).toBe(true);
  });
  it("missing opponent flagged and treated as bye", () => {
    const p = buildSnapshotPreview(snap([...r1.slice(0, 3), M({ id: "m4", player_a_member_id: "p4" })]), dec);
    expect(p.discrepancies.some((d) => /no opponent/.test(d.text) && d.severity === "warn")).toBe(true);
  });
  it("round-robin out-of-window round is re-proposed in its own dates", () => {
    const s = snap([M({ id: "r4", round_number: 4, player_a_member_id: "p1", player_b_member_id: "p2", scheduled_date: "2026-10-20", scheduled_time: "19:10", court_id: 1, play_by: null })], { divisions: [{ groupNumber: 1, label: "Ladies B", kind: "round_robin", swissRounds: null }] });
    const p = buildSnapshotPreview(s, dec);
    expect(p.discrepancies.some((d) => /outside Round 4/.test(d.text))).toBe(true);
    expect(p.proposals[0]?.date).toBe("2026-11-03");
  });
});

describe("snapshot preview linked booking simulation", () => {
  it("is exported and pure", async () => {
    const mod = await import("../snapshot-preview");
    expect(typeof mod.buildSnapshotPreview).toBe("function");
  });
});
