import { describe, expect, it } from "vitest";
import { friendlyShellyMessage } from "@/lib/shelly-errors";

describe("friendlyShellyMessage", () => {
  it("explains an offline relay", () => {
    expect(friendlyShellyMessage('"Court 1 court lights" is offline.', "Test failed")).toBe(
      "The Shelly relay is offline. Check that it has power and WiFi, then try again.",
    );
  });

  it("explains an unreadable relay status", () => {
    expect(
      friendlyShellyMessage(
        "Shelly Cloud returned no status for channel 1. Check the Device ID and channel.",
        "Test failed",
      ),
    ).toBe(
      "Shelly Cloud could not read this relay. Check the Device ID and channel, then try again.",
    );
  });

  it("explains a Shelly Cloud connection failure", () => {
    expect(
      friendlyShellyMessage("Could not reach Shelly Cloud: connection reset", "Test failed"),
    ).toBe(
      "SquashHub could not reach Shelly Cloud. Check the club internet connection and try again.",
    );
  });
});
