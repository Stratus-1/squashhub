import { describe, expect, it } from "vitest";
import {
  buildDefaultTournamentInviteText,
  inviteCompetitionLines,
  migrateLegacyTournamentInviteText,
} from "@/lib/tournaments/invite-message";

describe("editable tournament invitation wording", () => {
  it("previews Diamond League as combined singles and doubles, independently of the tournament name", () => {
    const details = inviteCompetitionLines(true, "Men's", "singles").join("\n");
    const preview = buildDefaultTournamentInviteText("River 2 Clubs", details, true);
    expect(preview).toContain("You have been invited to the Diamond League — River 2 Clubs.");
    expect(preview).toContain("Competition: Diamond League (singles and doubles)\nCategory: Men's");
    expect(preview).not.toContain("Men's Singles");
    expect(buildDefaultTournamentInviteText("Diamond League 2026", details, true)).toContain("the Diamond League 2026.");
  });

  it("preserves the normal singles and doubles category wording", () => {
    expect(inviteCompetitionLines(false, "Men's", "singles")).toEqual(["Category: Men's Singles"]);
    expect(inviteCompetitionLines(false, "Ladies", "doubles")).toEqual(["Category: Ladies Doubles"]);
  });
  it("puts the default invitation sentence inside the editable text", () => {
    expect(buildDefaultTournamentInviteText("Friday Doubles", "— Tournament details —"))
      .toBe("You have been invited to Friday Doubles.\n\n— Tournament details —");
  });

  it("brings legacy saved details into the new editable format", () => {
    expect(migrateLegacyTournamentInviteText("Remember to arrive by 18:00.", "Friday Doubles"))
      .toBe("You have been invited to Friday Doubles.\n\nRemember to arrive by 18:00.");
  });

  it("does not duplicate an opening already saved by the organiser", () => {
    const reminder = "You are invited to Friday Doubles.\n\nA reminder that play starts at 18:00.";
    expect(migrateLegacyTournamentInviteText(reminder, "Friday Doubles")).toBe(reminder);
  });
});