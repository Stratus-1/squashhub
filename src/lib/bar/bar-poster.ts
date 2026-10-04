/**
 * A4 "Bar usage" poster for any club: big menu QR, how-to-buy steps,
 * tab-then-settle note, app note and counter-mode note. Pure client-side PDF.
 * Wording follows the club's bar payment options (account / card online / swipe / cash).
 */
import { jsPDF } from "jspdf";

export interface BarPosterOptions {
  clubName: string;
  url: string;
  qrDataUrl: string; // PNG data URL of the QR code
  logoDataUrl?: string | null;
  accountEnabled: boolean;
  cardOnlineEnabled: boolean;
  swipeEnabled: boolean;
  cashEnabled: boolean;
}

const NAVY: [number, number, number] = [30, 58, 95];
const AMBER: [number, number, number] = [217, 154, 38];
const INK: [number, number, number] = [33, 37, 41];
const MUTED: [number, number, number] = [100, 108, 118];

function payPhrase(o: BarPosterOptions, member: boolean): string {
  const opts: string[] = [];
  if (member && o.accountEnabled) opts.push("add it to your member account");
  if (o.cardOnlineEnabled) opts.push("pay by card online");
  if (o.swipeEnabled) opts.push("pay with the club card machine");
  if (o.cashEnabled) opts.push("pay cash at the bar");
  if (!opts.length) return "settle with the club";
  if (opts.length === 1) return opts[0];
  return `${opts.slice(0, -1).join(", ")} or ${opts[opts.length - 1]}`;
}

export async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function buildBarPoster(o: BarPosterOptions): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 16;

  // Header band
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 58, "F");
  doc.setFillColor(...AMBER);
  doc.rect(0, 58, W, 2.5, "F");

  let textX = M;
  if (o.logoDataUrl) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, 13, 36, 36, 3, 3, "F");
    try {
      const fmt = o.logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(o.logoDataUrl, fmt, M + 3, 16, 30, 30, undefined, "FAST");
    } catch { /* ignore bad logo */ }
    textX = M + 44;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  const nameLines = doc.splitTextToSize(o.clubName.toUpperCase(), W - textX - M);
  doc.setFontSize(nameLines.length > 1 ? 20 : 26);
  doc.text(nameLines.slice(0, 2), textX, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.setTextColor(...AMBER);
  doc.text("Bar usage", textX, nameLines.length > 1 ? 50 : 42);

  // QR
  const qrSize = 88;
  const qrX = (W - qrSize) / 2, qrY = 70;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(1.2);
  doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 4, 4, "S");
  doc.addImage(o.qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("SCAN WITH YOUR PHONE CAMERA", W / 2, qrY + qrSize + 14, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(o.url, W / 2, qrY + qrSize + 19.5, { align: "center" });

  // Options
  let y = qrY + qrSize + 31;
  const block = (num: string, title: string, body: string) => {
    doc.setFillColor(...AMBER);
    doc.circle(M + 6, y + 1, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(num, M + 6, y + 2.6, { align: "center" });
    doc.setTextColor(...NAVY);
    doc.setFontSize(12.5);
    doc.text(title, M + 16, y + 2.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(body, W - M * 2 - 16);
    doc.text(lines, M + 16, y + 8.5);
    y += 10 + lines.length * 4.8 + 5;
  };

  block(
    "01",
    "SCAN THE BAR CODE",
    `Scan the code, choose your items and open a tab for yourself. When you're done, ${payPhrase(o, true)}.`,
  );
  block(
    "02",
    "VISITING THE CLUB?",
    `Visitors follow the same steps: scan the code, order and open your own tab, then ${payPhrase(o, false)} when you settle.`,
  );

  // Tab note
  doc.setFillColor(244, 246, 250);
  const note = "Open a tab for your session and keep adding items as you go — settle your account once, at the end.";
  const noteLines = doc.splitTextToSize(note, W - M * 2 - 10);
  const noteH = 8 + noteLines.length * 4.8;
  doc.roundedRect(M, y, W - M * 2, noteH, 2.5, 2.5, "F");
  doc.setFillColor(...NAVY);
  doc.rect(M, y, 1.8, noteH, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(noteLines, M + 6, y + 6.5);
  y += noteH + 7;

  // Also / counter notes
  const small = (label: string, body: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...AMBER);
    doc.text(label, M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(body, W - M * 2);
    doc.text(lines, M, y + 4.8);
    y += 5 + lines.length * 4.4 + 4;
  };
  if (o.accountEnabled || o.cardOnlineEnabled) {
    const appPay = [o.accountEnabled && "add them to their member account", o.cardOnlineEnabled && "pay by card online"]
      .filter(Boolean)
      .join(", or ");
    small("ALSO — ALREADY USING THE SQUASHHUB APP?", `Members can log in to the app, choose items and ${appPay}.`);
  }
  small(
    "COUNTER MODE",
    "At busy times the club may switch on counter mode, where the bar device runs several tabs at once. This is activated by the club when needed.",
  );

  // Footer
  doc.setFillColor(...NAVY);
  doc.rect(0, H - 12, W, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Powered by SquashHub", W / 2, H - 4.8, { align: "center" });

  return doc;
}
