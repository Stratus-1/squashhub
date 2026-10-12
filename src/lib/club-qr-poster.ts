import { jsPDF } from "jspdf";

interface PosterInput {
  clubName: string;
  subdomain: string;
  url: string;
  cta: string;
  svg: SVGSVGElement;
  logoUrl?: string | null;
}

export interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Fit source pixel dimensions into a max box, preserving aspect ratio. */
export function fitBox(srcW: number, srcH: number, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = srcW && srcH ? srcW / srcH : 1;
  let w = maxH * ratio;
  let h = maxH;
  if (w > maxW) {
    w = maxW;
    h = maxW / ratio;
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: maxW, h: maxH };
  return { w, h };
}

export function loadImageAsDataUrlWithSize(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 128;
      canvas.height = img.naturalHeight || 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error("Could not load logo"));
    img.src = src;
  });
}

export function loadImageAsDataUrl(src: string): Promise<string> {
  return loadImageAsDataUrlWithSize(src).then((l) => l.dataUrl);
}

function svgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 1024;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(blobUrl);
      reject(err);
    };
    img.src = blobUrl;
  });
}

export async function generateClubQrPoster({
  clubName,
  subdomain,
  url,
  cta,
  svg,
  logoUrl,
}: PosterInput): Promise<void> {
  const qrDataUrl = await svgToPngDataUrl(svg);
  let logoDataUrl: string | undefined;
  let logoW = 0;
  let logoH = 0;
  if (logoUrl) {
    try {
      const loaded = await loadImageAsDataUrlWithSize(logoUrl);
      logoDataUrl = loaded.dataUrl;
      const fit = fitBox(loaded.width, loaded.height, 17, 17);
      logoW = fit.w;
      logoH = fit.h;
    } catch {
      /* ignore logo load failures; poster still works without it */
    }
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = 210;
  const pageH = 297;
  const margin = 16;
  const navy = "#1E3A5F";
  const amber = "#D4A03A";

  // Background
  doc.setFillColor("#ffffff");
  doc.rect(0, 0, pageW, pageH, "F");

  // Header bar
  doc.setFillColor(navy);
  doc.rect(0, 0, pageW, 42, "F");

  // Club name
  doc.setTextColor("#ffffff");
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  const clubNameLines = doc.splitTextToSize(clubName, pageW - margin * 2);
  doc.text(clubNameLines, pageW / 2, 20, { align: "center" });

  // Subtitle
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Join us on SquashHub", pageW / 2, 32, { align: "center" });

  // Accent line
  doc.setDrawColor(amber);
  doc.setLineWidth(1.5);
  doc.line(margin, 46, pageW - margin, 46);

  // QR code
  const qrSize = 110;
  const qrX = (pageW - qrSize) / 2;
  const qrY = 62;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  // Logo overlay (center of QR code) — aspect ratio preserved
  if (logoDataUrl && logoW && logoH) {
    const logoX = qrX + (qrSize - logoW) / 2;
    const logoY = qrY + (qrSize - logoH) / 2;
    doc.setFillColor("#ffffff");
    doc.circle(qrX + qrSize / 2, qrY + qrSize / 2, 10.5 + 1.5, "F");
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, logoW, logoH);
  }

  // CTA
  doc.setTextColor(navy);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  const ctaLines = doc.splitTextToSize(cta, pageW - margin * 2);
  doc.text(ctaLines, pageW / 2, qrY + qrSize + 16, { align: "center" });

  // URL
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const urlLines = doc.splitTextToSize(url, pageW - margin * 2);
  doc.text(urlLines, pageW / 2, qrY + qrSize + 32, { align: "center" });

  // Footer
  doc.setFillColor(navy);
  doc.rect(0, pageH - 22, pageW, 22, "F");
  doc.setTextColor("#ffffff");
  doc.setFontSize(9);
  doc.text("Powered by SquashHub  •  squashhub.co.za", pageW / 2, pageH - 10, {
    align: "center",
  });

  doc.save(`${subdomain}-qr-poster.pdf`);
}
