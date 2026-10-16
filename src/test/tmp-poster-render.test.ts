import { describe, it } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { buildBarPoster } from "@/lib/bar/bar-poster";

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==";
const dataUrl = (p: string) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const BRAND = dataUrl("src/assets/shub-logo-white.png");
const CLUB = dataUrl("src/assets/club-logo.png");

describe("temp poster render", () => {
  it("writes preview PDFs", () => {
    const base = {
      url: "https://uit.squashhub.co.za/s/47iik6nb",
      qrDataUrl: QR,
      logoDataUrl: CLUB,
      logoWidth: 512,
      logoHeight: 512,
      brandLogoDataUrl: BRAND,
      venue: "bar" as const,
      accountEnabled: true,
      cardOnlineEnabled: true,
      swipeEnabled: true,
      cashEnabled: true,
    };
    const withLogo = buildBarPoster({ ...base, clubName: "Uitsig Squash Club" });
    writeFileSync("/tmp/browser/poster-club-logo.pdf", Buffer.from(withLogo.output("arraybuffer")));

    const longName = buildBarPoster({
      ...base,
      clubName: "A long squash club name for poster layout verification",
      venue: "bar-shop",
    });
    writeFileSync("/tmp/browser/poster-long-name.pdf", Buffer.from(longName.output("arraybuffer")));

    const noClubLogo = buildBarPoster({
      ...base,
      clubName: "Riverside Squash Club",
      logoDataUrl: null,
      logoWidth: undefined,
      logoHeight: undefined,
    });
    writeFileSync("/tmp/browser/poster-no-club-logo.pdf", Buffer.from(noClubLogo.output("arraybuffer")));
  });
});
