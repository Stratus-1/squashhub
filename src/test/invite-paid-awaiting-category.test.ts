import { describe, it, expect } from "vitest";
import { inviteState, paidAwaitingCategory, type InvitePayload } from "@/lib/tournaments/invite-link";

// John Dyason case (17 Nov 2026): R210 card payment arrived before a category was chosen.
const prepaid: InvitePayload = {
  found: true, status: "pending_payment", fee_status: "paid", confirmed_at: null, selected_divisions: [],
  can_respond_public: true, is_invitee: true,
};

describe("paid before choosing a category", () => {
  it("still asks the player to choose a category and accept", () => {
    expect(paidAwaitingCategory(prepaid)).toBe(true);
    expect(inviteState(prepaid)).toBe("actionable");
  });
  it("counts as entered once a category is chosen and accepted", () => {
    const done = { ...prepaid, status: "paid", confirmed_at: "2026-11-17T10:00:00Z", selected_divisions: [1] };
    expect(paidAwaitingCategory(done)).toBe(false);
    expect(inviteState(done)).toBe("registered");
  });
  it("leaves organiser-entered paid players as entered", () => {
    const organiser = { ...prepaid, admin_entered: true } as InvitePayload;
    expect(paidAwaitingCategory(organiser)).toBe(false);
    expect(inviteState(organiser)).toBe("registered");
  });
  it("does not apply when nothing has been paid", () => {
    const unpaid = { ...prepaid, fee_status: "due" };
    expect(paidAwaitingCategory(unpaid)).toBe(false);
  });
});
