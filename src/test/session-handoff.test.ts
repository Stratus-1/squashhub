import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { productionRootHost, buildHandoffUrl, parseHandoffHash, isSafeSubdomain } from "@/lib/session-handoff";

describe("root sign-in hands member to their club", () => {
  it("only the main page counts as root", () => {
    expect(productionRootHost("squashhub.co.za")).toBe("squashhub.co.za");
    expect(productionRootHost("www.squashhub.co.za")).toBe("squashhub.co.za");
    expect(productionRootHost("csi.squashhub.co.za")).toBeNull();
    expect(productionRootHost("localhost")).toBeNull();
  });
  it("round-trips the session to the club address", () => {
    const url = buildHandoffUrl("https:", "squashhub.co.za", "csi", "a.b.c", "r1");
    expect(url.startsWith("https://csi.squashhub.co.za/#")).toBe(true);
    expect(parseHandoffHash(new URL(url).hash)).toEqual({ at: "a.b.c", rt: "r1" });
  });
  it("rejects unsafe club addresses", () => {
    expect(isSafeSubdomain("csi")).toBe(true);
    expect(isSafeSubdomain("evil.com/x")).toBe(false);
  });
});
