import { describe, expect, it } from "vitest";
import { isStitchTestCreds, isYocoTestKey } from "../../supabase/functions/_shared/gateway-test-mode";

describe("gateway test mode detection (test payments are never recorded)", () => {
  it("treats Stitch with Test mode ticked as a test payment", () => {
    expect(isStitchTestCreds({ test_mode: "true", client_id: "test-958fd377" })).toBe(true);
  });

  it("treats a Stitch test- Client ID as a test payment even if the box is unticked", () => {
    expect(isStitchTestCreds({ test_mode: "false", client_id: "test-958fd377" })).toBe(true);
  });

  it("treats live Stitch credentials as real money", () => {
    expect(isStitchTestCreds({ test_mode: "false", client_id: "a1b2c3-live" })).toBe(false);
  });

  it("treats a Yoco sk_test_ key as a test payment and sk_live_ as real money", () => {
    expect(isYocoTestKey("sk_test_abc")).toBe(true);
    expect(isYocoTestKey("sk_live_abc")).toBe(false);
  });
});
