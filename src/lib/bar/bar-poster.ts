/**
 * A4 "Bar usage" poster for any club: big menu QR, how-to-buy steps,
 * tab-then-settle note, app note and counter-mode note. Pure client-side PDF.
 * Wording follows the club's bar payment options (account / card online / swipe / cash).
 */
import { jsPDF } from "jspdf";
import { fitBox, type LoadedImage } from "@/lib/club-qr-poster";
import squashHubLogoDataUrl from "@/assets/shub-logo-white.png?inline";

export interface BarPosterOptions {
  clubName: string;
  url: string;
  qrDataUrl: string; // PNG data URL of the QR code
  logoDataUrl?: string | null;
  logoWidth?: number;
  logoHeight?: number;
  accountEnabled: boolean;
  cardOnlineEnabled: boolean;
  swipeEnabled: boolean;
  cashEnabled: boolean;
  venue?: "bar" | "shop" | "bar-shop";
}

const NAVY: [number, number, number] = [30, 58, 95];
const AMBER: [number, number, number] = [217, 154, 38];
const INK: [number, number, number] = [33, 37, 41];
const MUTED: [number, number, number] = [100, 108, 118];
/** SquashHub brand mark (white lettering + icon) as shipped in src/assets. */
const BRAND_LOGO_PX = { w: 1920, h: 496 };

export function barPosterPaymentMethods(o: Pick<BarPosterOptions, "accountEnabled" | "cardOnlineEnabled" | "swipeEnabled" | "cashEnabled">): string[] {
  return [
    o.accountEnabled && "Member account - members only; membership number and Bar PIN required",
    o.cardOnlineEnabled && "Card online - pay securely on your phone",
    o.swipeEnabled && "Swipe card at the counter - pay using the club card machine",
    o.cashEnabled && "Cash at the counter - settle with bar/shop staff",
  ].filter((method): method is string => typeof method === "string");
}

export async function loadImageAsDataUrlWithSize(src: string): Promise<LoadedImage | null> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, width: dims.w, height: dims.h };
  } catch {
    return null;
  }
}

export async function loadImageAsDataUrl(src: string): Promise<string | null> {
  const l = await loadImageAsDataUrlWithSize(src);
  return l?.dataUrl ?? null;
}

export function buildBarPoster(o: BarPosterOptions): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 16;
  const venue = o.venue === "bar" ? "BAR" : o.venue === "shop" ? "SHOP" : "BAR & SHOP";
  doc.setProperties({ title: `${o.clubName} - ${venue} scan to pay`, subject: "Menu QR and accepted payment methods" });
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 48, "F");
  doc.setFillColor(...AMBER);
  doc.rect(0, 48, W, 2, "F");
  let textX = M;
  if (o.logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, 8, 32, 32, 2, 2, "F");
    const fit = fitBox(o.logoWidth ?? 1, o.logoHeight ?? 1, 28, 28);
    try {
      doc.addImage(o.logoDataUrl, "PNG", M + 16 - fit.w / 2, 24 - fit.h / 2, fit.w, fit.h);
    } catch { /* A missing logo must not prevent printing. */ }
    textX += 40;
  }
  // SquashHub brand mark in the top-right corner of the navy header.
  const brand = fitBox(BRAND_LOGO_PX.w, BRAND_LOGO_PX.h, 46, 11);
  const brandX = W - M - brand.w;
  try {
    doc.addImage(squashHubLogoDataUrl, "PNG", brandX, (48 - brand.h) / 2, brand.w, brand.h);
  } catch { /* A missing brand mark must not prevent printing. */ }
  const nameMaxW = Math.max(40, brandX - 6 - textX);
  doc.setFont("helvetica", "bold");
  let nameSize = 22;
  doc.setFontSize(nameSize);
  while (doc.splitTextToSize(o.clubName, nameMaxW).length > 2 && nameSize > 10) {
    doc.setFontSize(--nameSize);
  }
  const nameLines = doc.splitTextToSize(o.clubName, nameMaxW);
  doc.setTextColor(255, 255, 255);
  doc.text(nameLines, textX, nameLines.length > 1 ? 17 : 23);
  doc.setFontSize(12);
  doc.setTextColor(...AMBER);
  doc.text(venue, textX, 40);

  doc.setFontSize(26);
  doc.setTextColor(...NAVY);
  doc.text("SCAN TO PAY", W / 2, 65, { align: "center" });
  const qrSize = 96;
  doc.addImage(o.qrDataUrl, "PNG", (W - qrSize) / 2, 71, qrSize, qrSize);
  doc.setFontSize(10);
  doc.text("OPEN YOUR PHONE CAMERA AND SCAN", W / 2, 174, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const urlLines = doc.splitTextToSize(o.url, W - M * 2);
  doc.text(urlLines, W / 2, 180, { align: "center" });
  let y = 187 + (urlLines.length - 1) * 3;
  const steps = [
    ["1", "SCAN", "Open the menu on your phone."],
    ["2", "CHOOSE", "Select your items and check quantities."],
    ["3", "PAY", "Choose an available payment option below."],
  ];
  for (const [number, title, body] of steps) {
    doc.setFillColor(...AMBER);
    doc.circle(M + 4, y + 1, 4, "F");
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(number, M + 4, y + 2.2, { align: "center" });
    doc.text(title, M + 12, y + 2);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(body, M + 37, y + 2);
    y += 12;
  }
  y += 2;
  doc.setDrawColor(...AMBER);
  doc.line(M, y - 4, W - M, y - 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("ACCEPTED PAYMENT METHODS", M, y + 2);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const methods = barPosterPaymentMethods(o);
  for (const method of methods.length ? methods : ["No payment methods are enabled. Please speak to club staff."]) {
    const lines = doc.splitTextToSize(method, W - M * 2 - 4);
    doc.text(lines, M + 2, y);
    y += lines.length * 4 + 3;
  }
  doc.setFillColor(...NAVY);
  doc.rect(0, H - 12, W, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  // "Powered by" followed by the SquashHub logo, centred as one group.
  const foot = fitBox(BRAND_LOGO_PX.w, BRAND_LOGO_PX.h, 34, 6);
  const label = "Powered by";
  const labelW = doc.getTextWidth(label);
  const groupX = (W - (labelW + 2.5 + foot.w)) / 2;
  doc.text(label, groupX, H - 4.8);
  try {
    doc.addImage(squashHubLogoDataUrl, "PNG", groupX + labelW + 2.5, H - 12 + (12 - foot.h) / 2, foot.w, foot.h);
  } catch { /* A missing brand mark must not prevent printing. */ }
  return doc;
}
