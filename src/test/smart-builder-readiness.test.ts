import { describe, expect, it } from "vitest";
import { DefinitionSchema, effectiveSchedule } from "@/lib/smart-builder/definition";
import { validateDefinition } from "@/lib/smart-builder/validate";
import { mapToExistingTournament } from "@/lib/smart-builder/to-existing";
import { assessReadiness } from "@/lib/smart-builder/readiness";

const base = {
  name: "Riverside Doubles",
  divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [
    { id: "ko", name: "Knockout", kind: "knockout", groups: 1, groupSize: 16, input: { entrants: 16 }, schedule: { mode: "fixed" } },
  ] }] }],
};
const run = (raw: unknown) => {
  const def = DefinitionSchema.parse(raw);
  const v = validateDefinition(def), m = mapToExistingTournament(def);
  return { def, m, r: assessReadiness(def, v, m) };
};

describe("smart builder readiness", () => {
  it("old drafts load with empty settings and report what's missing", () => {
    const { r } = run(base);
    const ids = r.missing.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["scope", "entry", "dates", "sending", "channels", "fee", "whatsapp_group", "results"]));
    expect(r.nextMissing?.id).toBe("scope");
  });

  it("Riverside decisions persist into structured settings and map to existing fields without sending", () => {
    const { m, r } = run({
      ...base,
      // Schedule maths: a 16-draw knockout needs 4 fixed round dates.
      divisions: [{ ...base.divisions[0], sections: [{ ...base.divisions[0].sections[0], stages: [{ ...base.divisions[0].sections[0].stages[0], schedule: { mode: "fixed", roundDates: ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"] } }] }] }],
      event: { scope: "club", ownerId: "o-riv", ownerName: "Riverside", audience: "selected_members", expectedEntries: 16, seedingSource: "club_ladder",
        venues: { mode: "single", clubIds: ["riv"], names: ["Riverside"] } },
      players: { entryMethod: "selected", audience: "individuals", confirmAvailabilityOnly: true, seedingSource: "ranking" },
      comms: { inviteSending: "manual", inviteChannels: ["email", "whatsapp"], entryFeeRands: 0, whatsappGroup: "no", resultNotify: "none" },
      scheduleDefaults: { startDate: "2026-10-01", endDate: "2026-10-29", weekday: 4, venueNames: ["Riverside"], courtsPerVenue: 3, matchMinutes: 45 },
    });
    expect(r.missing).toEqual([]);
    expect(r.sections.find((s) => s.key === "invitations")?.state).not.toBe("missing");
    expect(m.extras.invite_methods).toEqual(["email", "whatsapp"]);
    expect(m.extras.result_notify_scope).toBe("never");
    expect(m.champ.registration_mode).toBe("invite");
    expect(m.champ.payment_required).toBe(false);
    expect(m.executability).toBe("ready");
  });

  it("flags a bad WhatsApp group link", () => {
    const { r } = run({ ...base, comms: { whatsappGroup: "yes", whatsappGroupUrl: "https://example.com/x" } });
    expect(r.missing.some((x) => x.id === "whatsapp_group")).toBe(true);
  });

  it("stages inherit tournament schedule defaults", () => {
    const { def } = run({ ...base, scheduleDefaults: { courtsPerVenue: 4, venueNames: ["A", "B"] } });
    const e = effectiveSchedule(def, def.divisions[0].sections[0].stages[0]);
    expect(e.courtsPerVenue).toEqual({ value: 4, inherited: true });
    expect(e.venueNames.inherited).toBe(true);
  });

  it("treats a saved Bells draft as timed points without asking for PAR or best-of", () => {
    const { m, r } = run({ ...base, name: "Bells Tournament", divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [
      { id: "rr1", name: "Round robin", kind: "round_robin", groups: 1, groupSize: 8, schedule: { mode: "fixed", startDate: "2026-09-24T12:00:00", endDate: "2026-09-24T13:27:00", matchMinutes: 15 } },
    ] }] }] });
    const scoring = r.sections.find((s) => s.key === "design")?.items.find((i) => i.id === "scoring");
    expect(scoring?.state).toBe("complete");
    expect(scoring?.detail).toContain("timed points");
    expect(r.sections.find((s) => s.key === "schedule")?.items.find((i) => i.id === "dates")?.state).toBe("missing"); // older draft: dates only on a stage — the one tournament range must be set
    expect(m.champ.scoring_mode).toBe("time_capped_points");
    expect(m.champ.match_duration_minutes).toBe(15);
    expect(m.champ.start_date).toBe("2026-09-24");
    expect(m.champ.end_date).toBe("2026-09-24");
    expect(m.champ.points_per_game).toBeUndefined();
  });

  it("allows an explicit standard-games choice even when a tournament is named Bells", () => {
    const { m, r } = run({ ...base, name: "Bells Tournament", scoring: { mode: "standard" } });
    expect(m.champ.scoring_mode).toBeUndefined();
    expect(r.sections.find((s) => s.key === "design")?.items.find((i) => i.id === "scoring")?.state).toBe("warning");
  });

  it("blocks when a division's first stage can't run on today's engine", () => {
    const { m } = run({ ...base, divisions: [{ id: "d", name: "Open", sections: [{ id: "s", name: "Main", stages: [{ id: "x", name: "Split", kind: "split", groups: 1 }] }] }] });
    expect(m.executability).toBe("blocked");
  });
});

describe("event scope opening steps", () => {
  it("asks scope, then audience, then expected entries — before format", () => {
    const { r: r1 } = run({ ...base });
    expect(r1.nextMissing?.id).toBe("scope");
    const { r: r2o } = run({ ...base, event: { scope: "regional" } });
    expect(r2o.nextMissing?.id).toBe("owner");
    const { r: r2 } = run({ ...base, event: { scope: "regional", ownerId: "nsa", ownerName: "NSA" } });
    expect(r2.nextMissing?.id).toBe("event_audience");
    expect(r2.nextMissing?.ask).toContain("Selected clubs");
    const { r: r3 } = run({ ...base, event: { scope: "regional", ownerId: "nsa", audience: "all_clubs", eligibleCount: 816, coverage: { regional: 600, national: 200 } } });
    expect(r3.nextMissing?.id).toBe("expected_entries");
    expect(r3.nextMissing?.ask).toContain("816");
  });
  it("rejects an audience not valid for the scope", () => {
    const { r } = run({ ...base, event: { scope: "club", audience: "selected_regions" } });
    expect(r.missing.map((m) => m.id)).toContain("event_audience");
  });
});
