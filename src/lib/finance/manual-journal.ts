/**
 * Pure rules for Finance > Journal entry (manual balanced journal).
 * The server (`admin_post_journal`) re-checks everything; these keep the form honest.
 */
export const MEMBER_LINE_ACCOUNTS = ["debtors", "member_credits"] as const;

export interface JournalDraftLine {
  key: string;
  /** Standard account key, or `custom:<id>` for a club-made account. */
  account: string;
  debit: string;
  credit: string;
  memberId: string;
  description: string;
}

export interface CustomAccountLike { id: string; category: string; base_account: string | null }

const STANDALONE: Record<string, string> = { Asset: "other_assets", Liability: "creditors", Income: "fee_income", Expense: "general_expense" };

/** The ledger account a draft line posts to (club-made accounts post to their roll-up account). */
export function ledgerAccountOf(account: string, custom: CustomAccountLike[]): string {
  if (!account.startsWith("custom:")) return account;
  const c = custom.find((a) => a.id === account.slice(7));
  if (!c) return "";
  return c.base_account ?? STANDALONE[c.category] ?? "general_expense";
}

export function needsMember(account: string, custom: CustomAccountLike[]): boolean {
  return (MEMBER_LINE_ACCOUNTS as readonly string[]).includes(ledgerAccountOf(account, custom));
}

const AMOUNT = /^\d+(\.\d{1,2})?$/;
export function parseAmount(v: string): number | null {
  const t = (v || "").trim();
  if (!t) return 0;
  if (!AMOUNT.test(t)) return null;
  return Number(t);
}

const cents = (n: number) => Math.round(n * 100);

export function journalTotals(lines: JournalDraftLine[]) {
  let debit = 0, credit = 0;
  for (const l of lines) {
    debit += cents(parseAmount(l.debit) ?? 0);
    credit += cents(parseAmount(l.credit) ?? 0);
  }
  return { debit: debit / 100, credit: credit / 100, difference: (debit - credit) / 100, balanced: debit === credit && debit > 0 };
}

/** Problems that stop the journal being saved (empty list = ready). */
export function journalProblems(lines: JournalDraftLine[], custom: CustomAccountLike[], reason: string): string[] {
  const out: string[] = [];
  if (!reason.trim()) out.push("Enter a reason for the journal");
  if (lines.length < 2) out.push("A journal needs at least two lines");
  lines.forEach((l, i) => {
    const n = i + 1;
    const d = parseAmount(l.debit), c = parseAmount(l.credit);
    if (!l.account || !ledgerAccountOf(l.account, custom)) out.push(`Line ${n}: choose an account`);
    if (d === null || c === null) out.push(`Line ${n}: amounts need at most two decimals`);
    else if ((d > 0) === (c > 0)) out.push(`Line ${n}: enter either a debit or a credit`);
    if (l.account && needsMember(l.account, custom) && !l.memberId) out.push(`Line ${n}: choose the member`);
  });
  const t = journalTotals(lines);
  if (!t.balanced) out.push(t.debit === 0 ? "Enter the amounts" : `Debits and credits differ by ${Math.abs(t.difference).toFixed(2)}`);
  return out;
}

/** Lines for the server, in the shape `admin_post_journal` expects. Members only travel on member lines. */
export function journalPayload(lines: JournalDraftLine[], custom: CustomAccountLike[]) {
  return lines.map((l) => {
    const isCustom = l.account.startsWith("custom:");
    return {
      account: isCustom ? null : l.account,
      custom_account_id: isCustom ? l.account.slice(7) : null,
      debit: parseAmount(l.debit) ?? 0,
      credit: parseAmount(l.credit) ?? 0,
      member_id: needsMember(l.account, custom) ? l.memberId : null,
      description: l.description.trim() || null,
    };
  });
}

let seq = 0;
export const blankLine = (patch: Partial<JournalDraftLine> = {}): JournalDraftLine => ({
  key: `l${++seq}`, account: "", debit: "", credit: "", memberId: "", description: "", ...patch,
});

/** "Member did work for the club": expense up, member owes less (or goes into credit). */
export function memberWorkTemplate(expenseAccount = "maintenance"): JournalDraftLine[] {
  return [
    blankLine({ account: expenseAccount }),
    blankLine({ account: "debtors" }),
  ];
}

/** Keep the template's two lines in step: the same amount on both sides. */
export function applyTemplateAmount(lines: JournalDraftLine[], amount: string): JournalDraftLine[] {
  if (lines.length !== 2) return lines;
  return [{ ...lines[0], debit: amount, credit: "" }, { ...lines[1], credit: amount, debit: "" }];
}

/** Member credit transfer amount check (available = transferable credit from the server). */
export function transferProblem(amount: string, available: number): string | null {
  const a = parseAmount(amount);
  if (a === null || !amount.trim() || a <= 0) return "Enter a positive amount with at most two decimals";
  if (cents(a) > cents(available)) return `Only ${available.toFixed(2)} credit is available to transfer`;
  return null;
}
