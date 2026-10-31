import { describe, expect, it } from "vitest";
import { emailQuotaDecision, nominationQuotaApplies } from "../../supabase/functions/_shared/comms-email-quota";
describe("CSIR nomination email limit", () => {
  it("allows 30 attempts but defers the 31st for an hour", () => {
    const now = Date.UTC(2026, 9, 31, 9, 32);
    expect(emailQuotaDecision(Array(29).fill(now), now).allowed).toBe(true);
    expect(emailQuotaDecision(Array(30).fill(now), now)).toEqual({ allowed: false, retryAt: now + 3_600_000 });
    expect(emailQuotaDecision(Array(30).fill(now), now + 3_600_000).allowed).toBe(true);
  });
  it("uses a rolling hour, not a clock-hour reset", () => {
    const start = Date.UTC(2026, 9, 31, 9, 59);
    expect(emailQuotaDecision(Array(30).fill(start), start + 60_000).allowed).toBe(false);
  });
  it("does not change other clubs or tournament emails", () => {
    expect(nominationQuotaApplies("e41098d4-9b19-4fc0-a082-d43ac13ff32b", "agm_nominations")).toBe(true);
    expect(nominationQuotaApplies("another-club", "agm_nominations")).toBe(false);
    expect(nominationQuotaApplies("e41098d4-9b19-4fc0-a082-d43ac13ff32b", "tournament_draw")).toBe(false);
  });
});