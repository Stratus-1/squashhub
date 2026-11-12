/**
 * Non-stock lines on a bar/shop supplier invoice (e.g. cleaning materials bought
 * at Makro together with drinks). They never touch stock: each line is a normal
 * expense posting, paid the same way as the invoice's stock lines.
 */
export type InvoicePaymentMethod = "cash" | "card" | "eft" | "account";

/** Standard expense accounts offered for non-stock invoice lines. */
export const INVOICE_OTHER_ACCOUNTS: { value: string; label: string }[] = [
  { value: "general_expense", label: "General Expenses" },
  { value: "cleaning_services", label: "Cleaning Services" },
  { value: "maintenance", label: "Maintenance" },
  { value: "club_stock_expense", label: "Stock club expense" },
  { value: "electricity", label: "Electricity" },
  { value: "security", label: "Security" },
  { value: "internet_software", label: "Internet & Software" },
  { value: "rent", label: "Rent" },
];

export type OtherLineInput = { description: string; account: string; amount: string };
export type CustomExpenseAccount = { id: string; name: string; base_account: string | null };

/** Same money-side rule as the stock purchase trigger (journal_division_stock_purchase). */
export function invoiceOffsetAccount(method: string): string {
  if (method === "account") return "creditors";
  if (method === "cash") return "cash";
  return "bank_current";
}

export function otherLineAmount(l: OtherLineInput): number {
  const n = Math.round((parseFloat(l.amount) || 0) * 100) / 100;
  return n > 0 ? n : 0;
}

/** Lines the user started filling in (anything typed). */
export function touchedOtherLines(lines: OtherLineInput[]): OtherLineInput[] {
  return lines.filter(l => l.description.trim() || l.account || l.amount.trim());
}

/** Returns an error message for the first incomplete line, or null when all are complete. */
export function validateOtherLines(lines: OtherLineInput[]): string | null {
  for (const l of touchedOtherLines(lines)) {
    if (!l.description.trim()) return "Describe each other item (e.g. Cleaning materials)";
    if (!l.account) return "Choose an account for each other item";
    if (otherLineAmount(l) <= 0) return "Enter an amount for each other item";
  }
  return null;
}

/**
 * Balanced journal lines: Dr each chosen expense (club-made expense accounts post
 * to their roll-up account and carry their id), Cr the invoice's money account.
 */
export function buildOtherLinesJournal(
  lines: OtherLineInput[],
  opts: { paymentMethod: string; supplier?: string; invoiceNumber?: string; customAccounts?: CustomExpenseAccount[] },
) {
  const ref = [opts.supplier?.trim(), opts.invoiceNumber?.trim() ? `#${opts.invoiceNumber.trim()}` : null].filter(Boolean).join(" ");
  const suffix = ref ? ` — ${ref}` : "";
  const debits = touchedOtherLines(lines).map(l => {
    const customId = l.account.startsWith("custom:") ? l.account.slice(7) : null;
    const custom = customId ? opts.customAccounts?.find(a => a.id === customId) : null;
    if (customId && !custom) throw new Error("Choose an account for each other item");
    return {
      account: custom ? (custom.base_account || "general_expense") : l.account,
      debit: otherLineAmount(l),
      description: `${l.description.trim()}${suffix}`,
      custom_account_id: customId,
    };
  });
  const total = Math.round(debits.reduce((s, d) => s + d.debit, 0) * 100) / 100;
  if (debits.length === 0 || total <= 0) return { lines: [], total: 0, description: "" };
  const description = `Invoice other items${suffix}`;
  return {
    total,
    description,
    lines: [...debits, { account: invoiceOffsetAccount(opts.paymentMethod), credit: total, description }],
  };
}
