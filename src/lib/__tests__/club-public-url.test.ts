import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildClubPublicUrl } from "../club-public-url";

describe("buildClubPublicUrl", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error - replacing window.location for tests
    delete window.location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  function setHostname(hostname: string, protocol = "https:") {
    // @ts-expect-error - partial mock
    window.location = { hostname, origin: `${protocol}//${hostname}` };
  }

  it("returns /c/:subdomain path on preview hosts", () => {
    setHostname("id-preview--example.lovable.app");
    expect(buildClubPublicUrl("nsc", "/auth")).toBe(
      "https://id-preview--example.lovable.app/c/nsc/auth"
    );
  });

  it("returns /c/:subdomain path on localhost", () => {
    setHostname("localhost", "http:");
    expect(buildClubPublicUrl("nsc", "/auth")).toBe("http://localhost/c/nsc/auth");
  });

  it("uses squashhub.co.za root for production subdomains", () => {
    setHostname("nsc.squashhub.co.za");
    expect(buildClubPublicUrl("nsc", "/auth")).toBe("https://nsc.squashhub.co.za/auth");
  });

  it("uses squashhub.co.za root when accessed from root domain", () => {
    setHostname("squashhub.co.za");
    expect(buildClubPublicUrl("nsc", "/auth")).toBe("https://nsc.squashhub.co.za/auth");
  });

  it("strips one subdomain level for unknown custom domains", () => {
    setHostname("club.example.com");
    expect(buildClubPublicUrl("nsc", "/auth")).toBe("https://nsc.example.com/auth");
  });

  it("handles empty path", () => {
    setHostname("nsc.squashhub.co.za");
    expect(buildClubPublicUrl("nsc")).toBe("https://nsc.squashhub.co.za");
  });
});
