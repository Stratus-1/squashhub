// Soft duplicate check for manual Enter Transaction: finds money already
// recorded in the same bank/cash account, same direction, same amount, on the
// same Johannesburg calendar day. Read-only; the user may still record it.

export type JournalLine = {
  account: string;
  debit: number | string | null;
  credit: number | string | null;
  description?: string | null;
  created_at: string;
  journal_ref?: string | null;
};

export type DuplicateQuery = {
  moneyAccount: "bank_current" | "cash";
  direction: "income" | "expense";
  amount: number;
  date: string; // yyyy-MM-dd (Johannesburg)
};

const JHB_OFFSET_MS = 2 * 60 * 60 * 1000; // South Africa has no daylight saving

export function johannesburgDate(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + JHB_OFFSET_MS).toISOString().slice(0, 10);
}

export function findPossibleDuplicates(lines: JournalLine[], q: DuplicateQuery): JournalLine[] {
  if (!(q.amount > 0) || !q.date) return [];
  const cents = Math.round(q.amount * 100);
  const seen = new Set<string>();
  return (lines || []).filter((l) => {
    if (l.account !== q.moneyAccount) return false;
    const value = Number(q.direction === "income" ? l.debit : l.credit) || 0;
    if (Math.round(value * 100) !== cents) return false;
    if (johannesburgDate(l.created_at) !== q.date) return false;
    const k = l.journal_ref || `${l.created_at}|${l.description}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
