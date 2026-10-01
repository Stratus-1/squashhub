import { describe, expect, it } from "vitest";
import { diamondPendingParticipantPatch, diamondSlotReplacements, type ParticipantIds } from "@/lib/tournaments/diamond-participants";

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
});