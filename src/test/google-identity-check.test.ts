import { describe, expect, it } from "vitest";
import {
  decideGoogleIdentity,
  googleNameOf,
  isGoogleSignIn,
} from "@/lib/google-identity-check";

/**
 * A Google sign-in must be questioned exactly when it could land someone on
 * another person's membership, and must stay quiet for a member who already
 * owns the login they are using.
 */
describe("Google sign-in identity check", () => {
  it("1. a member whose login already holds their own membership is not asked", () => {
    expect(
      decideGoogleIdentity({
        providerIsGoogle: true,
        alreadyLinked: true,
        emailMatchesMember: true,
        nameMatchesMember: true,
      })
    ).toBe("none");
  });

  it("2. wrong Google account: name is on the club's list but this login owns nothing", () => {
    expect(
      decideGoogleIdentity({
        providerIsGoogle: true,
        alreadyLinked: false,
        emailMatchesMember: false,
        nameMatchesMember: true,
      })
    ).toBe("is_that_you");
  });

  it("3. the club holds this email but the login is not linked yet", () => {
    expect(
      decideGoogleIdentity({
        providerIsGoogle: true,
        alreadyLinked: false,
        emailMatchesMember: true,
        nameMatchesMember: false,
      })
    ).toBe("is_that_you");
  });

  it("4. nobody at the club matches: ask whether it is a new application", () => {
    expect(
      decideGoogleIdentity({
        providerIsGoogle: true,
        alreadyLinked: false,
        emailMatchesMember: false,
        nameMatchesMember: false,
      })
    ).toBe("new_application");
  });

  it("5. email/password logins are never asked", () => {
    expect(
      decideGoogleIdentity({
        providerIsGoogle: false,
        alreadyLinked: false,
        emailMatchesMember: false,
        nameMatchesMember: true,
      })
    ).toBe("none");
  });

  it("6. the name Google sends is read from full_name, spaced and trimmed", () => {
    expect(googleNameOf({ full_name: "  Taylor   Gower ", email: "t@example.com" })).toBe("Taylor Gower");
    expect(googleNameOf({ name: "Willem Pretorius" })).toBe("Willem Pretorius");
    expect(googleNameOf({ email: "no-name@example.com" })).toBe("");
    expect(googleNameOf(undefined)).toBe("");
  });

  it("7. only Google sign-ins count, including the multi-provider list", () => {
    expect(isGoogleSignIn({ provider: "google" })).toBe(true);
    expect(isGoogleSignIn({ providers: ["google"] })).toBe(true);
    expect(isGoogleSignIn({ provider: "email" })).toBe(false);
    expect(isGoogleSignIn({})).toBe(false);
    expect(isGoogleSignIn(undefined)).toBe(false);
  });
});
