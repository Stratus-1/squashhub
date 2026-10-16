import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { buildBarPoster } from "@/lib/bar/bar-poster";
import clubLogoDataUrl from "@/assets/club-logo.png?inline";
import brandLogoDataUrl from "@/assets/shub-logo-white.png?inline";

const QR = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AwMDEwMDAwMDAwAkBgMB/DXemwAAAABJRU5ErkJggg==";

describe("temp poster render", () => {
  it("reports what the inlined imports look like", () => {
    console.log("BRAND:", typeof brandLogoDataUrl, "len", String(brandLogoDataUrl).length, "prefix", String(brandLogoDataUrl).slice(0, 40));
    console.log("CLUB:", typeof clubLogoDataUrl, "len", String(clubLogoDataUrl).length, "prefix", String(clubLogoDataUrl).slice(0, 40));
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    try {
      doc.addImage(String(brandLogoDataUrl), "PNG", 20, 20, 50, 13);
      console.log("addImage OK");
    } catch (e) {
      console.log("addImage FAILED:", (e as Error).message);
    }
    writeFileSync("/tmp/browser/probe.pdf", Buffer.from(doc.output("arraybuffer")));

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
  });
});
