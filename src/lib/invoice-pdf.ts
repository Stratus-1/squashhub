import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { fitBox } from "@/lib/club-qr-poster";

export interface InvoiceBankDetails {
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch_code?: string | null;
  bank_reference?: string | null;
}

export interface InvoicePdfInput {
  invoiceNumber: string;
  feeLabel: string;
  amount: number;
  seasonYear?: number | string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  memberName?: string | null;
  memberEmail?: string | null;
  clubName?: string | null;
  clubAddress?: string | null;
  clubEmail?: string | null;
  clubPhone?: string | null;
  logoDataUrl?: string | null;
  logoWidth?: number;
  logoHeight?: number;
  bank?: InvoiceBankDetails | null;
}

const NAVY: [number, number, number] = [30, 58, 95];
const MUTED: [number, number, number] = [110, 116, 125];

function fmtAmt(n: number) {
  return `R ${Number(n || 0).toFixed(2)}`;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

/** Builds the club membership invoice as a one-page A4 PDF, mirroring the on-screen preview. */
export function buildInvoicePdf(input: InvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;
  const textX = M + (input.logoDataUrl ? 26 : 0);

  // ---- Header band ----
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 34, "F");

  if (input.logoDataUrl) {
    try {
      const fit = fitBox(input.logoWidth ?? 1, input.logoHeight ?? 1, 22, 22);
      doc.addImage(input.logoDataUrl, "PNG", M, (34 - fit.h) / 2, fit.w, fit.h);
    } catch {
      /* A missing logo must not prevent the invoice from printing. */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(input.clubName || "Invoice", textX, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let headerY = 21;
  const sub = [input.clubAddress, input.clubEmail, input.clubPhone].filter(Boolean) as string[];
  for (const line of sub) {
    doc.text(line, textX, headerY);
    headerY += 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("INVOICE", W - M, 13, { align: "right" });
  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  doc.text(input.invoiceNumber || "", W - M, 19, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Issue: ${fmtDate(input.issueDate)}`, W - M, 25, { align: "right" });
  doc.text(`Due: ${fmtDate(input.dueDate)}`, W - M, 29, { align: "right" });

  // ---- Billed to ----
  let y = 48;
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text("BILLED TO", M, y);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(input.memberName || "—", M, y + 6);
  if (input.memberEmail) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(input.memberEmail, M, y + 11);
  }
  if (input.seasonYear) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Season ${input.seasonYear}`, W - M, y, { align: "right" });
  }

  // ---- Items ----
  autoTable(doc, {
    startY: y + 18,
    margin: { left: M, right: M },
    head: [["Description", { content: "Amount", styles: { halign: "right" } }]],
    body: [[input.feeLabel || "Membership fee", fmtAmt(input.amount)]],
    foot: [["Total due", fmtAmt(input.amount)]],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [240, 242, 245], textColor: 30, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 40 } },
  });

  // ---- Banking details ----
  const bank = input.bank || {};
  const bankLines = [
    bank.bank_name ? `Bank: ${bank.bank_name}` : null,
    bank.bank_account_name ? `Account name: ${bank.bank_account_name}` : null,
    bank.bank_account_number ? `Account no: ${bank.bank_account_number}` : null,
    bank.bank_branch_code ? `Branch code: ${bank.bank_branch_code}` : null,
    `Reference: ${bank.bank_reference || input.invoiceNumber}`,
  ].filter(Boolean) as string[];

  if (bankLines.length) {
    let by = (doc as any).lastAutoTable?.finalY ?? y + 40;
    by += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text("Banking details", M, by);
    by += 4;
    const boxH = bankLines.length * 5 + 6;
    doc.setFillColor(246, 247, 249);
    doc.setDrawColor(225, 228, 232);
    doc.roundedRect(M, by, W - 2 * M, boxH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 55, 60);
    bankLines.forEach((line, i) => {
      doc.text(line, M + 4, by + 6 + i * 5);
    });
  }

  // ---- Footer ----
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Thank you for being part of ${input.clubName || "our club"}.`, W / 2, 285, { align: "center" });

  return doc;
}
