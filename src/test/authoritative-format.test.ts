import { describe, expect, it } from "vitest";
import {
  authoritativeRules,
  compositionToPersist,
  resolveAuthoritativeComposition,
  startingPositions,
} from "@/lib/leagues/authoritative-format";
import { resolveFormat, rubberSlots, totalRubbers } from "@/lib/leagues/format";
import { inheritLeagueConfig } from "@/lib/leagues/team-setup";

const DOUBLES_LEAGUE = { discipline: "doubles", category: "open" } as const;

describe("authoritative league composition", () => {
  it("prefers the league (association) record over team mirrors", () => {
    const c = resolveAuthoritativeComposition({
      associationRules: { doubles_rubbers: 5, team_size: 10 },
      teamRules: [{ doubles_rubbers: 3 }, { doubles_rubbers: 3 }, { doubles_rubbers: 3 }],
    });
    expect(c.doublesRubbers).toBe(5);
    expect(c.source).toBe("association");
  });

  it("falls back to legacy team mirrors when the league record has no counts", () => {
    const c = resolveAuthoritativeComposition({
      associationRules: { team_size: null },
      teamRules: [{ doubles_rubbers: 5 }, { doubles_rubbers: 5 }],
    });
    expect(c.doublesRubbers).toBe(5);
    expect(c.source).toBe("teams");
    expect(c.hasStoredComposition).toBe(true);
  });

  it("reports nothing stored for a brand-new league", () => {
    const c = resolveAuthoritativeComposition({ associationRules: null, teamRules: [] });
    expect(c.hasStoredComposition).toBe(false);
    expect(c.source).toBe("none");
  });

  it("adding teams never changes the resolved count", () => {
    const assoc = { doubles_rubbers: 5, team_size: 10 };
    for (const teams of [1, 2, 3, 4]) {
      const c = resolveAuthoritativeComposition({
        associationRules: assoc,
        teamRules: Array.from({ length: teams }, () => ({ doubles_rubbers: 5, team_size: 10 })),
      });
      expect(c.doublesRubbers).toBe(5);
    }
  });
});

describe("reopening the team wizard", () => {
  const stored = resolveAuthoritativeComposition({
    associationRules: { doubles_rubbers: 5, team_size: 10 },
    teamRules: [{ doubles_rubbers: 5 }, { doubles_rubbers: 5 }, { doubles_rubbers: 5 }, { doubles_rubbers: 5 }],
  });

  it("resolves 5 doubles rubbers with four teams, not the 3 default", () => {
    const cfg = inheritLeagueConfig(
      DOUBLES_LEAGUE,
      authoritativeRules({ doubles_rubbers: 5, team_size: 10 }, [{ doubles_rubbers: 5 }, { doubles_rubbers: 5 }]),
    );
    expect(cfg.doublesRubbers).toBe(5);
    expect(totalRubbers(cfg)).toBe(5);
    expect(rubberSlots(cfg)).toHaveLength(5);
    expect(startingPositions(cfg)).toBe(10);
  });

  it("never writes a UI default while the record is still loading", () => {
    const out = compositionToPersist({
      stored,
      draft: { singlesRubbers: 0, doublesRubbers: 3 },
      loaded: false,
      dirty: false,
    });
    expect(out.write).toBe(false);
    expect(out.doublesRubbers).toBe(5);
  });

  it("keeps the stored count when the admin only edits teams", () => {
    const out = compositionToPersist({
      stored,
      draft: { singlesRubbers: 0, doublesRubbers: 3 },
      loaded: true,
      dirty: false,
    });
    expect(out.write).toBe(false);
    expect(out.doublesRubbers).toBe(5);
  });

  it("persists the new count when the admin actually changes it", () => {
    const out = compositionToPersist({
      stored,
      draft: { singlesRubbers: 0, doublesRubbers: 4 },
      loaded: true,
      dirty: true,
    });
    expect(out.write).toBe(true);
    expect(out.doublesRubbers).toBe(4);
  });

  it("writes the first configuration for a league with nothing stored", () => {
    const out = compositionToPersist({
      stored: resolveAuthoritativeComposition({ associationRules: null, teamRules: [] }),
      draft: { singlesRubbers: 0, doublesRubbers: 5 },
      loaded: true,
      dirty: false,
    });
    expect(out.write).toBe(true);
    expect(out.doublesRubbers).toBe(5);
  });
});

describe("scorecard rows follow the authoritative format", () => {
  it("a 5-rubber doubles league produces exactly 5 rows regardless of team count", () => {
    for (const teams of [1, 2, 4]) {
      const rules = authoritativeRules(
        { doubles_rubbers: 5, team_size: 10, pairing_policy: "fixed" },
        Array.from({ length: teams }, () => ({ doubles_rubbers: 5, team_size: 10 })),
      );
      const cfg = resolveFormat(DOUBLES_LEAGUE, rules as any);
      expect(rubberSlots(cfg).filter((s) => s.type === "doubles")).toHaveLength(5);
    }
  });

  it("singles history is untouched", () => {
    const rules = authoritativeRules({ singles_rubbers: 4, team_size: 4 }, []);
    const cfg = resolveFormat({ discipline: "singles", category: "mens" }, rules as any);
    expect(cfg.singlesRubbers).toBe(4);
    expect(cfg.doublesRubbers).toBe(0);
    expect(startingPositions(cfg)).toBe(4);
  });
});
