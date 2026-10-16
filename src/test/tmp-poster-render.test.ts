import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildBarPoster } from "@/lib/bar/bar-poster";
import clubLogoDataUrl from "@/assets/club-logo.png?inline";

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==";

describe("temp poster render", () => {
  it("writes preview PDFs", () => {
    const withLogo = buildBarPoster({
      clubName: "Uitsig Squash Club",
      url: "https://uit.squashhub.co.za/s/47iik6nb",
      qrDataUrl: QR,
      logoDataUrl: clubLogoDataUrl,
      logoWidth: 512,
      logoHeight: 512,
      venue: "bar",
      accountEnabled: true,
      cardOnlineEnabled: true,
      swipeEnabled: true,
      cashEnabled: true,
    });
    writeFileSync("/tmp/browser/poster-club-logo.pdf", Buffer.from(withLogo.output("arraybuffer")));

    const longName = buildBarPoster({
      clubName: "A long squash club name for poster layout verification",
      url: "https://uit.squashhub.co.za/s/47iik6nb",
      qrDataUrl: QR,
      logoDataUrl: clubLogoDataUrl,
      logoWidth: 512,
      logoHeight: 512,
      venue: "bar-shop",
      accountEnabled: true,
      cardOnlineEnabled: true,
      swipeEnabled: true,
      cashEnabled: true,
    });
    writeFileSync("/tmp/browser/poster-long-name.pdf", Buffer.from(longName.output("arraybuffer")));
  });
});
