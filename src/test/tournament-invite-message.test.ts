import { describe, expect, it } from "vitest";
import {
  buildDefaultTournamentInviteText,
  migrateLegacyTournamentInviteText,
} from "@/lib/tournaments/invite-message";

describe("editable tournament invitation wording", () => {
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