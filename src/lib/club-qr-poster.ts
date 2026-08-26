import { jsPDF } from "jspdf";

interface PosterInput {
  clubName: string;
  subdomain: string;
  url: string;
  cta: string;
  svg: SVGSVGElement;
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
}: PosterInput): Promise<void> {
  const qrDataUrl = await svgToPngDataUrl(svg);

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
