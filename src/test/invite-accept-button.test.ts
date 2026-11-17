import { describe, it, expect } from "vitest";
import { inviteAcceptLabel, inviteAcceptBlocker } from "@/lib/tournaments/invite-link";

describe("invitation main button", () => {
  it("doubles entry with a fee says select partner and proceed to payment", () => {
    expect(inviteAcceptLabel({ feeCents: 21000, prepaid: false, doubles: true })).toBe("Select partner & proceed to payment");
  });
  it("prepaid doubles entry only asks to select a partner", () => {
    expect(inviteAcceptLabel({ feeCents: 21000, prepaid: true, doubles: true })).toBe("Select your partner");
  });
  it("singles entry with a fee keeps Accept & pay", () => {
    expect(inviteAcceptLabel({ feeCents: 21000, prepaid: false, doubles: false })).toBe("Accept & pay");
  });
  it("stays disabled until a category is ticked", () => {
    expect(inviteAcceptBlocker({ mustChooseDivision: true, chosenCount: 0, verifyReady: true, verifyLabel: "Last 4 digits" })).not.toBeNull();
  });
  it("stays disabled until the cellphone digits are typed", () => {
    expect(inviteAcceptBlocker({ mustChooseDivision: true, chosenCount: 1, verifyReady: false, verifyLabel: "Last 4 digits" })).not.toBeNull();
  });
  it("is enabled once a category is ticked and the digits are typed", () => {
    expect(inviteAcceptBlocker({ mustChooseDivision: true, chosenCount: 2, verifyReady: true, verifyLabel: "Last 4 digits" })).toBeNull();
  });
});
