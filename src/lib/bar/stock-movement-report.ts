export type StockPeriod = "day" | "week" | "month" | "last-month" | "custom";

export const stockToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);

export function stockDateRange(period: Exclude<StockPeriod, "custom">, now = new Date()) {
  const to = stockToday(now);
  const day = new Date(`${to}T12:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (period === "day") return { from: to, to };
  if (period === "week") {
    day.setUTCDate(day.getUTCDate() - 6);
    return { from: iso(day), to };
  }
  day.setUTCDate(1);
  if (period === "month") return { from: iso(day), to };
  day.setUTCMonth(day.getUTCMonth() - 1);
  const from = iso(day);
  day.setUTCMonth(day.getUTCMonth() + 1);
  day.setUTCDate(0);
  return { from, to: iso(day) };
}

export interface StockMovementRow {
  id: string; name: string; division: string; unit_label: string;
  opening: number | null; receipts: number; sales: number; specials: number;
  club_use: number; adjustments: number; net: number; closing: number; current: number;
}
export interface StockMovementReport {
  generated_at: string; history_complete: boolean; rows: StockMovementRow[];
}

export function hasStockMovement(row: StockMovementRow) {
  return [row.receipts, row.sales, row.specials, row.club_use, row.adjustments, row.net].some(value => value !== 0);
}

export const stockColumns = [
  ["opening", "Opening stock"], ["receipts", "Purchases"], ["sales", "Sales"],
  ["specials", "Specials"], ["club_use", "Club sponsored"], ["adjustments", "Adjustments"],
  ["net", "Net movement"], ["closing", "Closing stock"], ["current", "Current stock"],
] as const;

// Quote formula-leading text as well as ordinary CSV delimiters for spreadsheet safety.
export function stockCsvCell(value: unknown) {
  let text = String(value ?? "");
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function stockMovementCsv(rows: StockMovementRow[], from: string, to: string, generatedAt: string) {
  const header = ["From", "To", "Stock as at", "Item", "Division", "Stock unit", ...stockColumns.map(([, label]) => label)];
  return "\uFEFF" + [header, ...rows.filter(hasStockMovement).map(row => [from, to, generatedAt, row.name, row.division, row.unit_label,
    ...stockColumns.map(([key]) => row[key] ?? "Unavailable")])]
    .map(row => row.map(stockCsvCell).join(",")).join("\r\n");
}

export function downloadStockCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}