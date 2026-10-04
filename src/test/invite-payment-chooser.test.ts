import { describe, expect, it } from "vitest";
import { invitePayButtons } from "@/components/tournaments/InvitePaymentChooser";

describe("invitePayButtons", () => {
  it("offers only the allowed methods, card first", () => {
    expect(invitePayButtons(["account", "eft"]).map((b) => b.key)).toEqual(["eft", "account"]);
    expect(invitePayButtons(["cash", "card", "account", "eft"]).map((b) => b.key)).toEqual(["card", "eft", "account", "cash"]);
  });
  it("offers nothing when no method is allowed", () => {
    expect(invitePayButtons([])).toEqual([]);
    expect(invitePayButtons(null)).toEqual([]);
  });
});
