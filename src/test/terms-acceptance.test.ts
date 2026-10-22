import { describe, it, expect } from "vitest";
import { termsPatch, termsPendingFromMetadata } from "@/lib/terms-acceptance";

/**
 * Terms acceptance lives on the auth account's metadata: the email registration
 * form writes it there, the visitor/league flows write it server-side, and a
 * Google sign-in arrives with none. The wizard must ask exactly when the account
 * has no record, and must never overwrite an earlier acceptance.
 */
describe("terms acceptance recorded on the account", () => {
  it("1. Google sign-in carries no terms keys: the wizard must ask and record both", () => {
    const google = { full_name: "Willem Pretorius", provider: "google" };
    expect(termsPendingFromMetadata(google)).toBe(true);
    expect(termsPatch(google, "2026-10-22T13:40:00.000Z")).toEqual({
      terms_accepted_at: "2026-10-22T13:40:00.000Z",
      privacy_accepted_at: "2026-10-22T13:40:00.000Z",
    });
  });

  it("2. email signup that already ticked: not asked again, never re-stamped", () => {
    const emailAccount = {
      name: "Thea van Bart",
      terms_accepted_at: "2026-09-30T08:00:00.000Z",
      privacy_accepted_at: "2026-09-30T08:00:00.000Z",
    };
    expect(termsPendingFromMetadata(emailAccount)).toBe(false);
    expect(termsPatch(emailAccount, "2026-10-22T13:40:00.000Z")).toBeNull();
  });

  it("3. account holding only a privacy stamp is still outstanding", () => {
    const half = { privacy_accepted_at: "2026-01-01T00:00:00.000Z" };
    expect(termsPendingFromMetadata(half)).toBe(true);
    expect(termsPatch(half, "2026-10-22T13:40:00.000Z")).toEqual({
      terms_accepted_at: "2026-10-22T13:40:00.000Z",
      privacy_accepted_at: "2026-10-22T13:40:00.000Z",
    });
  });

  it("4. a blank terms stamp is not an acceptance", () => {
    expect(termsPendingFromMetadata({ terms_accepted_at: "  " })).toBe(true);
    expect(termsPendingFromMetadata(undefined)).toBe(true);
  });
});
