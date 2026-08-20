import { describe, it, expect } from "vitest";
import { sanitizeDraftPayload } from "../draft-payload";

describe("sanitizeDraftPayload", () => {
  it("drops empty constrained enum fields so DB defaults apply", () => {
    const out = sanitizeDraftPayload({
      name: "Draft",
      bye_handling: "",
      scoring_mode: "",
      match_type: "",
      round_format: "single_round_robin",
    });
    expect(out).not.toHaveProperty("bye_handling");
    expect(out).not.toHaveProperty("scoring_mode");
    expect(out).not.toHaveProperty("match_type");
    expect(out.round_format).toBe("single_round_robin");
    expect(out.name).toBe("Draft");
  });

  it("keeps non-constrained empty strings and falsy non-strings", () => {
    const out = sanitizeDraftPayload({
      description: "",
      num_groups: 0,
      enable_playoffs: false,
      start_date: null,
    });
    expect(out.description).toBe("");
    expect(out.num_groups).toBe(0);
    expect(out.enable_playoffs).toBe(false);
    expect(out.start_date).toBeNull();
  });

  it("leaves a fully configured payload unchanged", () => {
    const payload = {
      gender: "mixed",
      match_type: "singles",
      scoring_mode: "standard",
      bye_handling: "no_match",
    };
    expect(sanitizeDraftPayload(payload)).toEqual(payload);
  });
});

describe("sanitizeExtrasPayload", () => {
  it("drops nulls for NOT NULL tournament columns", async () => {
    const { sanitizeExtrasPayload } = await import("../draft-payload");
    const out = sanitizeExtrasPayload({
      event_type: null,
      seeding_source: null,
      league_win_conditions: null,
      league_sources: {},
      max_entrants: null,
    });
    expect(out).not.toHaveProperty("event_type");
    expect(out).not.toHaveProperty("seeding_source");
    expect(out).not.toHaveProperty("league_win_conditions");
    expect(out.league_sources).toEqual({});
    expect(out.max_entrants).toBeNull();
  });
});
