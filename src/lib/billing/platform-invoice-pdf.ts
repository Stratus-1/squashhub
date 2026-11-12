import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

/** Minimal shape of a SquashHub platform invoice needed to print it. */
export interface PlatformInvoicePdfInput {
  invoice_number: string;
  status: string;
  issued_at: string;
  due_date: string | null;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  billing_cycle: string;
  plan_name: string;
  member_count: number;
  price_per_member: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  currency: string;
  line_items?: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    period_start?: string;
    period_end?: string;
  }> | null;
}

const NAVY: [number, number, number] = [30, 58, 95];
const MUTED: [number, number, number] = [100, 116, 139];

const sym = (ccy = "ZAR") =>
  ({ USD: "$", EUR: "€", GBP: "£", ZAR: "R" } as Record<string, string>)[ccy.toUpperCase()] || `${ccy.toUpperCase()} `;
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Builds the SquashHub subscription/messaging invoice as an A4 PDF, mirroring the on-screen invoice. */
export function buildPlatformInvoicePdf(
  inv: PlatformInvoicePdfInput,
  clubName: string,
  bank: Record<string, string | undefined>,
  billTo?: any
): jsPDF {
  const money = (n: number) => `${sym(inv.currency)}${Number(n || 0).toFixed(2)}`;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 16;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(bank.company_name || "SquashHub / Stratus Software Solutions (Pty) Ltd", M, 14, { maxWidth: 120 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let hy = 21;
  for (const line of [bank.company_address, bank.vat_number ? `VAT No: ${bank.vat_number}` : null].filter(Boolean) as string[]) {
    doc.text(line, M, hy, { maxWidth: 120 });
    hy += 4;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TAX INVOICE", W - M, 12, { align: "right" });
  doc.setFont("courier", "normal");
  doc.text(inv.invoice_number || "", W - M, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Issued: ${fmtDate(inv.issued_at)}`, W - M, 24, { align: "right" });
  doc.text(`Due: ${fmtDate(inv.due_date)}`, W - M, 28, { align: "right" });

  // Bill to + payment
  let y = 44;
  const colW = (W - 2 * M - 6) / 2;
  const block = (x: number, title: string, lines: string[], bold?: string) => {
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(title, x, y);
    let ly = y + 5;
    if (bold) {
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(10);
      doc.text(bold, x, ly, { maxWidth: colW });
      ly += 5;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    for (const l of lines) {
      const wrapped = doc.splitTextToSize(l, colW) as string[];
      doc.text(wrapped, x, ly);
      ly += 4 * wrapped.length;
    }
    return ly;
  };
  const addr = [billTo?.address_line1, billTo?.address_line2, billTo?.city, billTo?.province, billTo?.postal_code, billTo?.country].filter(Boolean);
  const billLines = [
    billTo?.contact_name ? `Attn: ${billTo.contact_name}` : null,
    ...addr,
    billTo?.phone ? `Tel: ${billTo.phone}` : null,
    (billTo?.emails || []).length ? (billTo.emails || []).join(", ") : null,
    billTo?.vat_number ? `VAT / Tax No: ${billTo.vat_number}` : null,
    billTo?.po_number ? `PO No: ${billTo.po_number}` : null,
    `Billing period: ${fmtDate(inv.period_start)} → ${fmtDate(inv.period_end)}`,
    `Cycle: ${inv.billing_cycle}`,
  ].filter(Boolean) as string[];
  const payLines = [
    bank.bank_name ? `Bank: ${bank.bank_name}` : null,
    bank.bank_account_name ? `Account name: ${bank.bank_account_name}` : null,
    bank.bank_account_number ? `Account no: ${bank.bank_account_number}` : null,
    bank.bank_branch_code ? `Branch code: ${bank.bank_branch_code}` : null,
    `Reference: ${inv.invoice_number}`,
    `Status: ${String(inv.status).toUpperCase()}`,
  ].filter(Boolean) as string[];
  const end1 = block(M, "BILL TO", billLines, billTo?.company_name || clubName);
  const end2 = block(M + colW + 6, "PAYMENT", payLines);
  y = Math.max(end1, end2) + 4;

  const lines = Array.isArray(inv.line_items) && inv.line_items.length
    ? inv.line_items.map((l) => [
        l.period_start ? `${l.description}\n${fmtDate(l.period_start)} → ${fmtDate(l.period_end)}` : l.description,
        String(Number(l.quantity ?? 1)),
        money(Number(l.unit_price || 0)),
        money(Number(l.amount || 0)),
      ])
    : [[
        `${inv.plan_name}\nSubscription — ${fmtDate(inv.period_start)} → ${fmtDate(inv.period_end)}`,
        String(inv.member_count),
        money(Number(inv.price_per_member)),
        money(Number(inv.subtotal)),
      ]];

  const totals: any[] = [
    ["", "", "Subtotal", money(Number(inv.subtotal))],
    ["", "", "VAT", money(Number(inv.vat_amount))],
    ["", "", { content: "Total due", styles: { fontStyle: "bold" } }, { content: money(Number(inv.total)), styles: { fontStyle: "bold" } }],
  ];
  if (inv.paid_at) totals.push(["", "", "Paid", fmtDate(inv.paid_at)]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Description", { content: "Qty", styles: { halign: "right" } }, { content: "Unit", styles: { halign: "right" } }, { content: "Amount", styles: { halign: "right" } }]],
    body: lines,
    foot: totals,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [248, 250, 252], textColor: 30, fontStyle: "normal", halign: "right" },
    columnStyles: { 1: { halign: "right", cellWidth: 16 }, 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 32 } },
  });

  const fy = ((doc as any).lastAutoTable?.finalY ?? y + 40) + 12;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(
      `Thank you. Please use invoice number ${inv.invoice_number} as your EFT reference, or pay online via Stitch from the Subscription tab.`,
      W - 2 * M
    ),
    M,
    fy
  );
  return doc;
}
