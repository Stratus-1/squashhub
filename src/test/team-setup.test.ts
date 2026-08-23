import { describe, it, expect } from "vitest";
import {
  inheritLeagueConfig,
  teamSetupQuestions,
  buildTeamAllocation,
  playersPerTeam,
} from "@/lib/leagues/team-setup";

const player = (id: string, ladder: number | null = null) => ({ id, name: id, ladder_position: ladder });

describe("Step 2 inherits Step 1", () => {
  it("never re-asks category when the league already has one", () => {
    const cfg = inheritLeagueConfig({ discipline: "doubles", category: "ladies" }, { doubles_rubbers: 3 });
    expect(teamSetupQuestions(cfg).askCategory).toBe(false);
  });

  it("asks category only for legacy leagues without one", () => {
    const cfg = inheritLeagueConfig({ discipline: "singles", category: null }, { singles_rubbers: 5 });
    expect(teamSetupQuestions(cfg).askCategory).toBe(true);
  });

  it("never re-asks players per match once league rules exist", () => {
    const cfg = inheritLeagueConfig({ discipline: "singles", category: "mens" }, { singles_rubbers: 4 });
    expect(cfg.rulesDefined).toBe(true);
    expect(teamSetupQuestions(cfg).askPlayersPerMatch).toBe(false);
  });
});

describe("adaptive Step 2 allocation questions", () => {
  it("singles keeps the ladder draft workflow", () => {
    const q = teamSetupQuestions(inheritLeagueConfig({ discipline: "singles", category: "mens" }, { singles_rubbers: 4 }));
    expect(q.allocationMode).toBe("ladder");
    expect(q.askLadderStart).toBe(true);
    expect(q.askDistribution).toBe(true);
    expect(q.askPairsPerTeam).toBe(false);
  });

  it("doubles gets NO singles ladder fields by default", () => {
    const q = teamSetupQuestions(inheritLeagueConfig({ discipline: "doubles", category: "mixed" }, { doubles_rubbers: 3 }));
    expect(q.allocationMode).toBe("pairs");
    expect(q.askLadderStart).toBe(false);
    expect(q.askRankedPoolSize).toBe(false);
    expect(q.askDistribution).toBe(false);
    expect(q.askPlayersPerMatch).toBe(false);
    expect(q.askPairsPerTeam).toBe(true);
  });

  it("doubles shows ladder fields only with an explicit opt-in rule", () => {
    const cfg = inheritLeagueConfig({ discipline: "doubles", category: "open" }, { doubles_rubbers: 2 });
    const q = teamSetupQuestions(cfg, { rank_doubles_by_ladder: true });
    expect(q.askLadderStart).toBe(true);
  });

  it("hybrid asks both singles ladder and pair allocation", () => {
    const q = teamSetupQuestions(
      inheritLeagueConfig({ discipline: "hybrid", category: "open" }, { singles_rubbers: 3, doubles_rubbers: 1 }),
    );
    expect(q.allocationMode).toBe("hybrid");
    expect(q.askLadderStart).toBe(true);
    expect(q.askPairsPerTeam).toBe(true);
  });

  it("hybrid without singles rubbers hides the ladder controls", () => {
    const q = teamSetupQuestions(
      inheritLeagueConfig({ discipline: "hybrid", category: "open" }, { singles_rubbers: 0, doubles_rubbers: 3 }),
    );
    expect(q.askLadderStart).toBe(false);
  });

  it("category and discipline stay independent dimensions", () => {
    const cfg = inheritLeagueConfig({ discipline: "doubles", category: "mens" }, { doubles_rubbers: 3 });
    expect(cfg.discipline).toBe("doubles");
    expect(cfg.category).toBe("mens");
  });
});

describe("team allocation", () => {
  it("counts players from singles slots plus two per pair", () => {
    const cfg = inheritLeagueConfig({ discipline: "hybrid", category: "open" }, { singles_rubbers: 3, doubles_rubbers: 1 });
    expect(playersPerTeam(cfg, 2)).toBe(7);
  });

  it("allocates real players into pairs, never fake players", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => player(id));
    const out = buildTeamAllocation(players, { numTeams: 2, singlesPerTeam: 0, pairsPerTeam: 2 });
    expect(out.teams).toHaveLength(2);
    expect(out.teams[0].pairs).toHaveLength(2);
    expect(out.teams[0].pairs[0].every((p) => typeof p.id === "string")).toBe(true);
    const ids = out.teams.flatMap((t) => t.pairs.flat().map((p) => p.id));
    expect(new Set(ids).size).toBe(8);
  });

  it("fills singles slots before pairs and keeps leftovers unallocated", () => {
    const players = Array.from({ length: 7 }, (_, i) => player(`p${i}`));
    const out = buildTeamAllocation(players, { numTeams: 1, singlesPerTeam: 2, pairsPerTeam: 2, reserves: 1 });
    expect(out.teams[0].singles.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(out.teams[0].pairs).toHaveLength(2);
    expect(out.reserves.map((p) => p.id)).toEqual(["p6"]);
    expect(out.unallocated).toHaveLength(0);
  });
});
