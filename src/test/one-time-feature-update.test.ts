import { describe, expect, it } from "vitest";
import { isOneTimeFeatureUpdate } from "../lib/notification-navigation";

describe("One-time member feature update dismissal", () => {
  it("requires acknowledgement when the member closes a once-up update", () => {
    expect(isOneTimeFeatureUpdate({ id: "credit-update", type: "platform_update", data: { once_up_notice: true } })).toBe(true);
    expect(isOneTimeFeatureUpdate({ id: "normal-update", type: "platform_update" })).toBe(false);
  });
  it("leaves unrelated invitation dismissal unchanged", () => {
    expect(isOneTimeFeatureUpdate({ id: "invitation", type: "tournament_invite", data: { once_up_notice: true } })).toBe(false);
  });
});