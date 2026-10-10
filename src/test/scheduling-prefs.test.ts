import { describe, expect, it } from "vitest";
import { normaliseSchedulingPrefs, planPrefWaves, DEFAULT_SCHEDULING_PREFS, type PrefGame, type SchedulingPrefs } from "@/lib/tournaments/scheduling-prefs";
import { planBellsWaves, planTimedSchedule, bellsSlotMinutes } from "@/lib/tournaments/formal-stage-schedule";

const day = (courts: number[], to = "21:00") => [{ date: "2026-10-06", from: "18:00", to, courtIds: courts }];
const P = (o: Partial<SchedulingPrefs>): SchedulingPrefs => ({ ...DEFAULT_SCHEDULING_PREFS, ...o });
const keyOf = (g: number) => (g === 1 ? "6th League · Singles" : g === 2 ? "7th League · Singles" : undefined);
/** 6×6 cross-league: a1..a6 (group 1) v b1..b6 (group 2), 6 rounds of 6. */
const cross = (): PrefGame[] => Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, i) => ({ id: `r${r + 1}g${i}`, round: r + 1, people: [`a${i}`, `b${(i + r) % 6}`], groups: [1, 2] }))).flat();
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const people = (g: PrefGame[]) => Object.fromEntries(g.map((x) => [x.id, x.people]));
const noClash = (slots: { id: string; time: string; date: string }[], games: PrefGame[]) => {
  const pp = people(games); const seen = new Set<string>();
  for (const s of slots) for (const p of pp[s.id]) { const k = `${s.date}${s.time}${p}`; expect(seen.has(k)).toBe(false); seen.add(k); }
};
const restGaps = (slots: { id: string; time: string }[], games: PrefGame[], step: number) => {
  const pp = people(games); const times = new Map<string, number[]>();
  for (const s of slots) for (const p of pp[s.id]) times.set(p, [...(times.get(p) ?? []), toMin(s.time)]);
  return Math.min(...[...times.values()].flatMap((t) => t.sort((a, b) => a - b).slice(1).map((x, i) => (x - t[i]) / step)));
};

describe("scheduling preferences", () => {
  it("1. no restriction packs 3 per wave on 13-min slots", () => {
    const g = cross();
    const r = planPrefWaves({ games: g, days: day([1, 2, 3]), minutes: 13, prefs: P({}), keyOf });
    expect(r.issues).toEqual([]); expect(r.slots).toHaveLength(36);
    expect(r.slots.filter((s) => s.time === "18:00")).toHaveLength(3);
    expect(r.slots.filter((s) => s.time === "18:13")).toHaveLength(3);
    noClash(r.slots, g);
  });
  it("2. avoid back-to-back: avoided when room, falls back softly when tight", () => {
    const g = cross();
    const roomy = planPrefWaves({ games: g, days: day([1, 2, 3], "22:30"), minutes: 13, prefs: P({ rest: "avoid" }), keyOf });
    expect(roomy.issues).toEqual([]); expect(restGaps(roomy.slots, g, 13)).toBeGreaterThanOrEqual(2);
    const tight = planPrefWaves({ games: g, days: day([1, 2, 3], "20:36"), minutes: 13, prefs: P({ rest: "avoid" }), keyOf }); // 12 slots × 3 = 36
    expect(tight.issues).toEqual([]); expect(tight.slots).toHaveLength(36);
  });
  it("3. require 1-slot rest: fits with room, blocks when impossible", () => {
    const g = cross();
    const ok = planPrefWaves({ games: g, days: day([1, 2, 3], "22:30"), minutes: 13, prefs: P({ rest: "one" }), keyOf });
    expect(ok.issues).toEqual([]); expect(restGaps(ok.slots, g, 13)).toBeGreaterThanOrEqual(2);
    const bad = planPrefWaves({ games: g, days: day([1, 2, 3, 4, 5, 6], "19:18"), minutes: 13, prefs: P({ rest: "one" }), keyOf });
    expect(bad.slots).toEqual([]); expect(bad.issues[0]).toMatch(/Requiring 1-slot rest leaves \d+ match/);
  });
  it("4. require 2-slot rest keeps 2 slots between appearances", () => {
    const g = cross();
    const r = planPrefWaves({ games: g, days: day([1, 2, 3], "23:59"), minutes: 13, prefs: P({ rest: "two" }), keyOf });
    expect(r.issues).toEqual([]); expect(restGaps(r.slots, g, 13)).toBeGreaterThanOrEqual(3);
  });
  it("5. rotate courts on 3 and 4 courts: no one stays on one court consecutively when avoidable", () => {
    for (const courts of [[1, 2, 3], [1, 2, 3, 4]]) {
      const g = cross();
      const r = planPrefWaves({ games: g, days: day(courts), minutes: 13, prefs: P({ courts: "rotate" }), keyOf });
      expect(r.issues).toEqual([]);
      const pp = people(g); const last = new Map<string, number>(); let repeats = 0;
      for (const s of [...r.slots].sort((a, b) => a.time.localeCompare(b.time))) for (const p of pp[s.id]) { if (last.get(p) === s.courtId) repeats++; last.set(p, s.courtId); }
      const any = planPrefWaves({ games: g, days: day(courts), minutes: 13, prefs: P({}), keyOf });
      let anyRepeats = 0; const l2 = new Map<string, number>();
      for (const s of [...any.slots].sort((a, b) => a.time.localeCompare(b.time))) for (const p of pp[s.id]) { if (l2.get(p) === s.courtId) anyRepeats++; l2.set(p, s.courtId); }
      expect(repeats).toBeLessThanOrEqual(anyRepeats);
      expect(repeats).toBeLessThan(10);
    }
  });
  it("6. preferred category court is used first, other courts as fallback", () => {
    const g: PrefGame[] = [1, 2, 3].map((i) => ({ id: `x${i}`, round: 1, people: [`p${i}`, `q${i}`], groups: [1] }));
    const r = planPrefWaves({ games: g, days: day([1, 2, 3], "18:13"), minutes: 13, prefs: P({ courts: "category", categoryCourts: [{ key: keyOf(1)!, courtIds: [2], rule: "preferred" }] }), keyOf });
    expect(r.issues).toEqual([]); expect(r.slots[0].courtId).toBe(2); expect(new Set(r.slots.map((s) => s.courtId)).size).toBe(3);
  });
  it("7. only-these-courts restricts and blocks when impossible; never makes an unavailable court usable", () => {
    const g: PrefGame[] = [1, 2, 3].map((i) => ({ id: `x${i}`, round: 1, people: [`p${i}`, `q${i}`], groups: [1] }));
    const only = P({ courts: "category", categoryCourts: [{ key: keyOf(1)!, courtIds: [2], rule: "only" }] });
    const r = planPrefWaves({ games: g, days: day([1, 2, 3]), minutes: 13, prefs: only, keyOf });
    expect(r.slots.every((s) => s.courtId === 2)).toBe(true);
    const tight = planPrefWaves({ games: g, days: day([1, 2, 3], "18:26"), minutes: 13, prefs: only, keyOf });
    expect(tight.slots).toEqual([]); expect(tight.issues[0]).toMatch(/Only these courts/);
    const gone = planPrefWaves({ games: g, days: day([1, 3]), minutes: 13, prefs: only, keyOf });
    expect(gone.slots).toEqual([]); expect(gone.issues[0]).toMatch(/no usable court/);
  });
  it("8. a person shared across doubles teams is never on two courts at once", () => {
    const g: PrefGame[] = [
      { id: "d1", round: 1, people: ["ann", "bob", "cat", "dan"], groups: [1] },
      { id: "d2", round: 1, people: ["eve", "bob", "fay", "gus"], groups: [1] },
    ];
    for (const prefs of [P({}), P({ rest: "avoid" }), P({ courts: "rotate" })]) {
      const r = planPrefWaves({ games: g, days: day([1, 2]), minutes: 13, prefs, keyOf });
      expect(r.slots[0].time).not.toBe(r.slots[1].time);
    }
  });
  it("9. Bells 10 + 3 = 13-minute slots", () => {
    expect(bellsSlotMinutes({ mode: "time_capped_points", timeCapPlay: 10, timeCapBreak: 3 })).toBe(13);
    const r = planPrefWaves({ games: cross(), days: day([1, 2, 3]), minutes: 13, prefs: P({ courts: "rotate" }), keyOf });
    expect([...new Set(r.slots.map((s) => s.time))].slice(0, 3)).toEqual(["18:00", "18:13", "18:26"]);
  });
  it("10. saved prefs normalise back identically (reopen); junk = defaults", () => {
    const saved = P({ rest: "one", courts: "category", categoryCourts: [{ key: "Men A", courtIds: [1, 3], rule: "only" }] });
    expect(normaliseSchedulingPrefs(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(normaliseSchedulingPrefs(undefined)).toEqual(DEFAULT_SCHEDULING_PREFS);
    expect(normaliseSchedulingPrefs({ rest: "x", courts: 4 })).toEqual(DEFAULT_SCHEDULING_PREFS);
  });
  const ctx = (prefs: SchedulingPrefs) => ({ days: day([20, 21, 24]), minutes: 13, bells: true, waves: false, roundDates: [], scheduledRounds: [], prefs, labels: { "1": keyOf(1)!, "2": keyOf(2)! }, busyOther: [] });
  const timed = () => cross().map((g, k) => ({ ...g, group: 1, bracket: k }));
  it("11. preview and generation share one planner: same input, same slots", () => {
    const prefs = P({ rest: "avoid", courts: "rotate" });
    expect(planTimedSchedule(ctx(prefs), timed())).toEqual(planTimedSchedule(ctx(prefs), timed()));
    expect(planTimedSchedule(ctx(prefs), timed()).slots).toHaveLength(36);
  });
  it("12. no saved prefs = exactly the previous Bells wave planner", () => {
    const g = timed();
    const before = planBellsWaves({ rounds: Array.from({ length: 6 }, (_, r) => ({ round: r + 1, games: g.filter((x) => x.round === r + 1).map((x) => x.id) })), days: day([20, 21, 24]), minutes: 13, players: people(g) });
    expect(planTimedSchedule(ctx(DEFAULT_SCHEDULING_PREFS), g).slots).toEqual(before.slots);
  });
});

describe("category evenings", () => {
  const twoDays = [{ date: "2026-10-05", from: "18:00", to: "21:00", courtIds: [1, 2] }, { date: "2026-10-07", from: "18:00", to: "21:00", courtIds: [1, 2] }]; // Mon, Wed
  const games = (g: number, n: number, pre: string): PrefGame[] => Array.from({ length: n }, (_, i) => ({ id: `${pre}${i}`, round: 1, people: [`${pre}a${i}`, `${pre}b${i}`], groups: [g] }));
  const kOf = (g: number) => (g === 1 ? "Ladies › A · Singles" : g === 2 ? "Mens › B · Singles" : undefined);
  it("required evening keeps a category on that weekday only", () => {
    const g = [...games(1, 4, "l"), ...games(2, 4, "m")];
    const r = planPrefWaves({ games: g, days: twoDays, minutes: 30, keyOf: kOf, prefs: P({ courts: "category", categoryCourts: [{ key: "Ladies", courtIds: [], weekdays: [3], rule: "only" }] }) });
    expect(r.issues).toEqual([]);
    expect(r.slots.filter((s) => s.id.startsWith("l")).every((s) => s.date === "2026-10-07")).toBe(true);
  });
  it("subcategory override beats category", () => {
    const g = games(2, 3, "m");
    const r = planPrefWaves({ games: g, days: twoDays, minutes: 30, keyOf: kOf, prefs: P({ courts: "category", categoryCourts: [{ key: "Mens", courtIds: [], weekdays: [1], rule: "only" }, { key: "Mens::B", courtIds: [2], weekdays: [3], rule: "only" }] }) });
    expect(r.issues).toEqual([]);
    expect(r.slots.every((s) => s.date === "2026-10-07" && s.courtId === 2)).toBe(true);
  });
  it("preferred evening spills to other evenings when full", () => {
    const g = games(1, 16, "l"); // Mon holds 12 (6 slots × 2 courts)
    const r = planPrefWaves({ games: g, days: twoDays, minutes: 30, keyOf: kOf, prefs: P({ courts: "category", categoryCourts: [{ key: "Ladies", courtIds: [], weekdays: [1], rule: "preferred" }] }) });
    expect(r.issues).toEqual([]);
    expect(r.slots.filter((s) => s.date === "2026-10-05")).toHaveLength(12);
    expect(r.notes.join(" ")).toMatch(/moved to other evenings/);
  });
  it("required evening with no matching date blocks clearly", () => {
    const r = planPrefWaves({ games: games(1, 2, "l"), days: twoDays, minutes: 30, keyOf: kOf, prefs: P({ courts: "category", categoryCourts: [{ key: "Ladies", courtIds: [], weekdays: [5], rule: "only" }] }) });
    expect(r.slots).toEqual([]); expect(r.issues[0]).toMatch(/Only these evenings/);
  });
});
