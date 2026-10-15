import { describe, it, expect } from "vitest";
import { classifyBooking, reconcileBlocks, planCreateBlocks, slotLabel, type ExternalBlockConfig, type ProviderBooking, type BlockMapping } from "../external-blocks";

const cfg: ExternalBlockConfig = { blockName: "Club Championships", courtIds: [1, 2], dateFrom: "2026-10-12", dateTo: "2026-12-02" };
const pb = (id: number, court = 1, start = "18:00", end = "18:45", name: string | null = "Club Championships", date = "2026-10-20"): ProviderBooking =>
  ({ externalId: `gobook:${id}`, bookerName: name, courtId: court, date, start, end });
const map = (id: number, extra: Partial<BlockMapping> = {}): BlockMapping =>
  ({ externalId: `gobook:${id}`, tournamentId: "t", courtId: 1, date: "2026-10-20", start: "18:00", end: "18:45", confirmedAt: "c", missingSince: null, ...extra });
const base = { tournamentId: "t", cfg, dates: ["2026-10-20"], now: "N" };

describe("external booking blocks (fake GoBook)", () => {
  it("name alone is not proof; GoBook client-number prefix tolerated", () => {
    expect(classifyBooking(pb(1, 1, "18:00", "18:45", "1004; Club Championships"), cfg)).toBe("candidate");
    expect(classifyBooking(pb(1, 9), cfg)).toBe("name_outside_scope");
    expect(classifyBooking(pb(1, 1, "18:00", "18:45", "Smith J"), cfg)).toBe("unrelated");
    expect(classifyBooking(pb(1), null)).toBe("unrelated");
  });
  it("new blocks need confirmation and touch no match", () => {
    const r = reconcileBlocks({ ...base, provider: [pb(1)], mappings: [], allocations: [] });
    expect(r.pendingConfirmation).toHaveLength(1);
    expect(r.protectedExternalIds).toEqual([]);
  });
  it("repeated sync is idempotent", () => {
    const input = { ...base, provider: [pb(1)], mappings: [map(1)], allocations: [{ matchId: "m", courtId: 1, date: "2026-10-20", start: "18:00", end: "18:45", playerNames: "A vs B" }] };
    const a = reconcileBlocks(input); const b = reconcileBlocks({ ...input, mappings: a.mappings });
    expect(b).toEqual(a);
    expect(a.conflicts).toEqual([]);
  });
  it("removed block is flagged, protected from cancel, allocation kept", () => {
    const r = reconcileBlocks({ ...base, provider: [], mappings: [map(1)], allocations: [{ matchId: "m", courtId: 1, date: "2026-10-20", start: "18:00", end: "18:45", playerNames: "A vs B" }] });
    expect(r.missing[0].missingSince).toBe("N");
    expect(r.protectedExternalIds).toEqual(["gobook:1"]);
    expect(r.conflicts[0].reason).toMatch(/no longer in GoBook/);
    expect(r.mappings).toHaveLength(1);
  });
  it("block restored clears missing flag; resize flags uncovered match", () => {
    const back = reconcileBlocks({ ...base, provider: [pb(1)], mappings: [map(1, { missingSince: "old" })], allocations: [] });
    expect(back.missing).toEqual([]);
    const shrunk = reconcileBlocks({ ...base, provider: [pb(1, 1, "18:00", "18:30")], mappings: [map(1)], allocations: [{ matchId: "m", courtId: 1, date: "2026-10-20", start: "18:00", end: "18:45", playerNames: "A vs B" }] });
    expect(shrunk.conflicts).toHaveLength(1);
  });
  it("other dates and other tournaments untouched", () => {
    const r = reconcileBlocks({ ...base, provider: [], mappings: [map(1, { date: "2026-10-21" }), map(2, { tournamentId: "other" })], allocations: [] });
    expect(r.mappings.every((m) => m.missingSince === null)).toBe(true);
  });
  it("SquashHub names win over GoBook booker name", () => {
    expect(slotLabel("Club Championships", { matchId: "m", courtId: 1, date: "d", start: "s", end: "e", playerNames: "Danie vs Etienne" })).toBe("Danie vs Etienne");
    expect(slotLabel("Club Championships", null)).toBe("Club Championships");
  });
  it("create-block is off by default; stable keys, clashes per court", () => {
    const req = { tournamentId: "t", courtIds: [1, 2, 9], date: "2026-10-20", start: "18:00", end: "21:00" };
    expect(planCreateBlocks(req, cfg, []).allowed).toBe(false);
    const p = planCreateBlocks(req, { ...cfg, allowCreate: true }, [pb(5, 2, "19:00", "19:45", "Smith J")]);
    expect(p.items.map((i) => i.status)).toEqual(["ready", "clash", "clash"]);
    expect(planCreateBlocks(req, { ...cfg, allowCreate: true }, []).items[0].idempotencyKey).toBe(p.items[0].idempotencyKey);
  });
});
