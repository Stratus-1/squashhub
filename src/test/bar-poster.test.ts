import { describe, expect, it } from "vitest";
import { barPosterPaymentMethods, buildBarPoster } from "@/lib/bar/bar-poster";

describe("bar/shop poster payment wording", () => {
  it("includes all enabled options and identifies member-only payment", () => {
    const methods = barPosterPaymentMethods({ accountEnabled: true, cardOnlineEnabled: true, swipeEnabled: true, cashEnabled: true });
    expect(methods).toHaveLength(4);
    expect(methods.join(" ")).toMatch(/members only.*Bar PIN/);
    expect(methods.join(" ")).toContain("Swipe card at the counter");
    expect(methods.join(" ")).toContain("Cash at the counter");
  });
  it.each(Array.from({ length: 16 }, (_, mask) => [mask]))("honours every switch combination (%s)", mask => {
    const flags = { accountEnabled: !!(mask & 1), cardOnlineEnabled: !!(mask & 2), swipeEnabled: !!(mask & 4), cashEnabled: !!(mask & 8) };
    const text = barPosterPaymentMethods(flags).join(" ");
    expect(text.includes("Member account")).toBe(flags.accountEnabled);
    expect(text.includes("Card online")).toBe(flags.cardOnlineEnabled);
    expect(text.includes("Swipe card")).toBe(flags.swipeEnabled);
    expect(text.includes("Cash")).toBe(flags.cashEnabled);
  });
  it("produces one A4 page even with a long club name, preview URL and all methods", () => {
    const doc = buildBarPoster({
      clubName: "A long squash club name for poster layout verification",
      url: "https://id-preview--84cdc7bd-c950-4776-9fb1-c29f6232816d.lovable.app/s/abcdefgh",
      qrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==",
      venue: "shop", accountEnabled: true, cardOnlineEnabled: true, swipeEnabled: true, cashEnabled: true,
    });
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.output("blob").size).toBeGreaterThan(1000);
  });
  it("embeds the SquashHub brand mark when one is supplied", () => {
    const base = {
      clubName: "Riverside Squash Club",
      url: "https://riv.squashhub.co.za/s/abcdefgh",
      qrDataUrl: QR,
      venue: "bar" as const,
      accountEnabled: true, cardOnlineEnabled: true, swipeEnabled: true, cashEnabled: true,
    };
    const withBrand = buildBarPoster({ ...base, brandLogoDataUrl: BRAND });
    const withoutBrand = buildBarPoster(base);
    expect(withBrand.getNumberOfPages()).toBe(1);
    expect(withoutBrand.getNumberOfPages()).toBe(1);
    expect(withBrand.output("blob").size).toBeGreaterThan(withoutBrand.output("blob").size);
  });
});