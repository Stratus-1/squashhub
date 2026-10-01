import { describe, expect, it } from "vitest";
import { diamondFixtureReplacements, diamondPendingParticipantPatch, diamondSlotReplacements, type ParticipantIds } from "@/lib/tournaments/diamond-participants";

const saved: ParticipantIds = {
  player_a_member_id: "home-3", player_b_member_id: "away-3",
  partner_a_member_id: "home-4", partner_b_member_id: "away-4",
};

describe("Diamond League squad substitutions", () => {
  const oldTeams = [{ id: "home", pool: "A" as const, name: "Home", players: ["home-1", "home-2", "home-3", "home-4"] }];
  const newTeams = [{ ...oldTeams[0], players: ["home-1", "home-2", "reserve", "home-4"] }];
  const replacements = diamondSlotReplacements(oldTeams, newTeams);

  it("maps only the replaced slot", () => {
    expect([...replacements]).toEqual([["home-3", "reserve"]]);
    expect(diamondSlotReplacements(newTeams, newTeams).size).toBe(0);
  });

  it("updates every participant in an unstarted game from the current squad", () => {
    expect(diamondPendingParticipantPatch(saved, { ...saved, player_a_member_id: "reserve" }, false, replacements))
      .toEqual({ player_a_member_id: "reserve" });
  });

  it("keeps seeded pairs and only replaces the departing player in pending doubles of a started tie", () => {
    const seeded: ParticipantIds = { ...saved, player_a_member_id: "home-4", partner_a_member_id: "home-3" };
    expect(diamondPendingParticipantPatch(seeded, saved, true, replacements))
      .toEqual({ partner_a_member_id: "reserve" });
  });

  it("does not reset a started tie to the team order when no one was replaced", () => {
    const seeded: ParticipantIds = { ...saved, player_a_member_id: "home-4", partner_a_member_id: "home-3" };
    expect(diamondPendingParticipantPatch(seeded, saved, true, new Map())).toEqual({});
  });

  it("recovers an already-saved substitution from a completed singles row without changing that row", () => {
    const evidence = [{ saved, expected: { ...saved, player_a_member_id: "reserve" } }];
    const recovered = diamondFixtureReplacements(evidence, newTeams);
    expect([...recovered]).toEqual([["home-3", "reserve"]]);
    expect(diamondPendingParticipantPatch({ ...saved, partner_a_member_id: "home-3" }, saved, true, recovered))
      .toEqual({ player_a_member_id: "reserve", partner_a_member_id: "reserve" });
    expect(evidence[0].saved.player_a_member_id).toBe("home-3");
  });

  it("does not treat a player moved to another active squad slot as a replacement", () => {
    expect(diamondFixtureReplacements([{ saved, expected: { ...saved, player_a_member_id: "reserve" } }],
      [{ ...newTeams[0], players: ["home-3", "home-2", "reserve", "home-4"] }]).size).toBe(0);
  });
});