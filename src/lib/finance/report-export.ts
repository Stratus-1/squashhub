/**
 * Report-only exports (CSV, Excel, PDF) for the finance statements.
 * Each export holds the club name, report title, period and the report lines —
 * never the surrounding page (navigation, cards, buttons).
 */
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { groupedIncome } from "./grouped-income";
import type { BalanceSheet } from "./balance-sheet";
import type { TradingCostBasis } from "./division-margin";

export type ReportRowKind = "line" | "detail" | "subtotal" | "total";
export interface ReportRow { label: string; values: (number | string | null)[]; kind?: ReportRowKind }
export interface ReportSection { title?: string; rows: ReportRow[] }
export interface FinancialReport {
  title: string;
  clubName?: string;
  period: string;
  notes?: string[];
  labelColumn: string;
  valueColumns: string[];
  sections: ReportSection[];
  filename: string;
}

const day = (iso: string) => format(new Date(`${iso}T12:00:00`), "d MMM yyyy");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0
const fileBase = (title: string, clubName: string | undefined, suffix: string) => [clubName && slug(clubName), slug(title), suffix].filter(Boolean).join("_");

type IncomeReport = ReturnType<typeof groupedIncome>;

export function incomeStatementReport(input: { report: IncomeReport; basis: TradingCostBasis; from: string; to: string; clubName?: string; currencyCode: string; missingCosts?: number }): FinancialReport {
  const { report, basis, from, to, clubName, currencyCode, missingCosts = 0 } = input;
  const line = (label: string, amount: number, kind: ReportRowKind = "line"): ReportRow => ({ label, values: [round2(amount)], kind });
  const sections: ReportSection[] = [
    { title: "Primary income", rows: [...report.primary.map(r => line(r.label, r.amount)), line("Primary gross income", report.primaryTotal, "subtotal")] },
    ...report.divisions.map(d => ({
      title: d.division === "shop" ? "Shop" : "Bar",
      rows: [
        line("Sales", d.sales),
        ...d.tipIncome.map(t => line(t.label, t.amount)),
        line(`Less: ${basis === "purchases" ? "Stock purchases" : "Cost of sales — Items"}`, -d.tradingCost),
        ...d.allocated.map(c => line(`Less: ${c.label}`, -c.amount)),
        line(`Gross profit / (loss)${d.margin === null ? "" : ` · ${d.margin.toFixed(1)}%`}`, d.profit, "subtotal"),
      ],
    })),
    { rows: [line("Total gross income", report.grossIncome, "total")] },
    { title: "General expenses", rows: [...report.expenses.map(r => line(r.label, r.amount)), line("Total general expenses", report.generalExpenses, "subtotal")] },
    { rows: [line(report.netProfit >= 0 ? "Net profit" : "Net loss", report.netProfit, "total")] },
  ];
  const notes = [`${basis === "purchases" ? "Purchases" : "Cost of sales"} basis`];
  if (missingCosts > 0) notes.push(`Provisional: ${missingCosts} sale lines have no recorded cost`);
  return {
    title: "Income Statement", clubName, period: `For the period ${day(from)} to ${day(to)}`, notes,
    labelColumn: "Item", valueColumns: [`Amount (${currencyCode})`], sections,
    filename: fileBase("income-statement", clubName, `${from}_to_${to}`),
  };
}

export interface TrialBalanceRow { label: string; category: string; debit: number; credit: number }
export function trialBalanceReport(input: { rows: TrialBalanceRow[]; asAt: string; clubName?: string; currencyCode: string }): FinancialReport {
  const { rows, asAt, clubName, currencyCode } = input;
  const debit = rows.reduce((s, r) => s + r.debit, 0), credit = rows.reduce((s, r) => s + r.credit, 0);
  return {
    title: "Trial Balance", clubName, period: `As at ${day(asAt)}`,
    labelColumn: "Account", valueColumns: ["Category", `Debit (${currencyCode})`, `Credit (${currencyCode})`],
    sections: [{ rows: [...rows.map(r => ({ label: r.label, values: [r.category, round2(r.debit), round2(r.credit)] })), { label: "Total", values: [null, round2(debit), round2(credit)], kind: "total" as const }] }],
    filename: fileBase("trial-balance", clubName, asAt),
  };
}

export function balanceSheetReport(input: { bs: BalanceSheet; asAt: string; clubName?: string; currencyCode: string }): FinancialReport {
  const { bs, asAt, clubName, currencyCode } = input;
  const part = (title: string, rows: { label: string; amount: number }[], total: number): ReportSection => ({
    title, rows: [...rows.map(r => ({ label: r.label, values: [round2(r.amount)] })), { label: `Total ${title.toLowerCase()}`, values: [round2(total)], kind: "subtotal" }],
  });
  return {
    title: "Balance Sheet", clubName, period: `As at ${day(asAt)}`,
    labelColumn: "Item", valueColumns: [`Amount (${currencyCode})`],
    sections: [
      part("Assets", bs.assets, bs.totalAssets),
      part("Liabilities", bs.liabilities, bs.totalLiabilities),
      part("Equity", bs.equity, bs.totalEquity),
      { rows: [{ label: "Total liabilities and equity", values: [round2(bs.totalLiabilities + bs.totalEquity)], kind: "total" }] },
    ],
    filename: fileBase("balance-sheet", clubName, asAt),
  };
}

/** Rows (header block + table) shared by CSV and Excel. */
export function reportRows(r: FinancialReport): (string | number | null)[][] {
  const out: (string | number | null)[][] = [];
  if (r.clubName) out.push([r.clubName]);
  out.push([r.title], [r.period]);
  for (const n of r.notes ?? []) out.push([n]);
  out.push([], [r.labelColumn, ...r.valueColumns]);
  r.sections.forEach((s, i) => {
    if (i > 0) out.push([]);
    if (s.title) out.push([s.title.toUpperCase()]);
    for (const row of s.rows) out.push([row.kind === "detail" ? `  ${row.label}` : row.label, ...row.values]);
  });
  return out;
}

export function reportCsv(r: FinancialReport): string {
  const cell = (v: string | number | null) => v === null || v === undefined ? "" : typeof v === "number" ? v.toFixed(2) : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return reportRows(r).map(row => row.map(cell).join(",")).join("\r\n");
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadReportCsv(r: FinancialReport) {
  save(new Blob(["\ufeff" + reportCsv(r)], { type: "text/csv;charset=utf-8" }), `${r.filename}.csv`);
}

export function reportWorkbook(r: FinancialReport): XLSX.WorkBook {
  const rows = reportRows(r);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (const ref of Object.keys(ws)) {
    const c = ws[ref];
    if (!ref.startsWith("!") && c && typeof c.v === "number") c.z = "#,##0.00;-#,##0.00;0.00";
  }
  ws["!cols"] = [{ wch: Math.min(60, Math.max(28, ...rows.map(x => String(x[0] ?? "").length))) }, ...r.valueColumns.map(c => ({ wch: Math.max(16, c.length + 2) }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, r.title.slice(0, 31));
  return wb;
}

export function downloadReportXlsx(r: FinancialReport) {
  const data = XLSX.write(reportWorkbook(r), { bookType: "xlsx", type: "array" });
  save(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${r.filename}.xlsx`);
}

/** jsPDF's built-in fonts only cover Latin-1; swap common typographic characters. */
const pdfText = (s: string) => s.replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u00a0\u202f]/g, " ").replace(/\u2026/g, "...");

export function reportPdf(r: FinancialReport, money: (n: number) => string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  if (r.clubName) { doc.text(pdfText(r.clubName), 14, y); y += 7; }
  doc.setFontSize(12); doc.text(r.title, 14, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(pdfText(r.period), 14, y); y += 5;
  for (const n of r.notes ?? []) { doc.text(pdfText(n), 14, y); y += 5; }
  const cols = 1 + r.valueColumns.length;
  const body: any[] = [];
  r.sections.forEach(s => {
    if (s.title) body.push([{ content: pdfText(s.title), colSpan: cols, styles: { fontStyle: "bold", fillColor: [230, 234, 240] } }]);
    for (const row of s.rows) {
      const bold = row.kind === "subtotal" || row.kind === "total";
      const styles = { fontStyle: bold ? "bold" : "normal", ...(row.kind === "total" ? { fillColor: [245, 245, 245] } : {}), ...(row.kind === "detail" ? { textColor: [90, 90, 90] } : {}) };
      body.push([
        { content: pdfText(row.label), styles: row.kind === "detail" ? { ...styles, cellPadding: { left: 8, top: 1.8, bottom: 1.8, right: 1.8 } } : styles },
        ...row.values.map(v => ({ content: v === null ? "" : typeof v === "number" ? pdfText(money(v)) : pdfText(v), styles: { ...styles, halign: typeof v === "number" ? "right" : "left" } })),
      ]);
    }
  });
  autoTable(doc, {
    startY: y + 2,
    head: [[pdfText(r.labelColumn), ...r.valueColumns.map(pdfText)]],
    headStyles: { fillColor: [30, 58, 95], textColor: 255 },
    body,
    styles: { fontSize: 9, cellPadding: 1.8, valign: "middle" },
    columnStyles: Object.fromEntries(r.valueColumns.map((c, i) => [i + 1, { cellWidth: c.startsWith("Category") ? 26 : 34, halign: "right" as const }])),
    theme: "plain",
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`${pdfText(r.title)} - page ${page}`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.setTextColor(0);
    },
  });
  return doc;
}

export function downloadReportPdf(r: FinancialReport, money: (n: number) => string) {
  save(reportPdf(r, money).output("blob"), `${r.filename}.pdf`);
}
