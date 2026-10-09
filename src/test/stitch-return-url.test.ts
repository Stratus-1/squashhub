import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guards the Stitch Express return contract (see issue log "The standard").
// These regressions recurred several times: stripping redirect_url for every
// club, swapping to redirect_uri, or using the shared /pay/return host.
const read = (p: string) => readFileSync(resolve(__dirname, "../../supabase/functions", p), "utf8");
const payment = read("stitch-create-payment/index.ts");
const mandate = read("stitch-create-mandate/index.ts");

describe("Stitch return URL contract", () => {
  for (const [name, src] of [["once-off/top-up/tournament/membership", payment], ["recurring mandate", mandate]] as const) {
    it(`${name}: appends redirect_url (never redirect_uri) to the hosted link`, () => {
      expect(src).toMatch(/searchParams\.set\("redirect_url"/);
      expect(src).not.toMatch(/searchParams\.set\("redirect_uri"/);
    });
    it(`${name}: only drops the return when Stitch refuses it, and logs that`, () => {
      expect(src).toMatch(/appendRedirectIfReachable/);
      expect(src).toMatch(/RETURN_URL_MISSING/);
    });
    it(`${name}: club hosts return to /my-account, never /pay/return`, () => {
      expect(src).toMatch(/\.squashhub\.co\.za/);
      expect(src).toMatch(/\/my-account/);
    });
  }

  it("guest tournament payments use the club account page, not the invite path", () => {
    expect(payment).toMatch(/inviteContext\s*\?\s*clubAccountReturnUrl/);
  });
});

describe("Bar card payments use the top-up return contract", () => {
  const bar = read("bar-card-pay/index.ts");
  it("returns to the club's /my-account, never the shared www /pay/return for Stitch", () => {
    expect(bar).toMatch(/\.squashhub\.co\.za\/my-account/);
    expect(bar).toMatch(/appendRedirectIfReachable\(String\(link\), stitchReturn\)/);
    expect(bar).toMatch(/redirectUri: stitchReturn/);
    expect(bar).toMatch(/RETURN_URL_MISSING/);
  });
});
