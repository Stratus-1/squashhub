/**
 * Balance sheet built from the trial balance (journal lines) as at a date.
 * Income/expense lines are closed into equity: surplus before the financial
 * year start is "Accumulated surplus", the rest is "Current year surplus".
 */
export interface BSLine { account: string; custom_account_id?: string | null; debit: number | string; credit: number | string; created_at: string }
export interface BSAccountMeta { label: string; category: "Asset" | "Liability" | "Income" | "Expense" }
export interface BSRow { key: string; label: string; amount: number }

export interface BalanceSheet {
  assets: BSRow[];
  liabilities: BSRow[];
  equity: BSRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}

const EQUITY_ACCOUNTS = new Set(["opening_balance_equity"]);

export function buildBalanceSheet(
  lines: BSLine[],
  metaFor: (line: BSLine) => { key: string; meta: BSAccountMeta } | null,
  asAtIsoExclusive: string,
  fyStartIso: string,
): BalanceSheet {
  const bal = new Map<string, { label: string; category: BSAccountMeta["category"]; dr: number }>();
  let priorSurplus = 0;
  let currentSurplus = 0;
  for (const l of lines) {
    if (l.created_at >= asAtIsoExclusive) continue;
    const r = metaFor(l);
    if (!r) continue;
    const net = Number(l.debit || 0) - Number(l.credit || 0);
    if (r.meta.category === "Income" || r.meta.category === "Expense") {
      if (l.created_at < fyStartIso) priorSurplus -= net; else currentSurplus -= net;
      continue;
    }
    const e = bal.get(r.key) ?? { label: r.meta.label, category: r.meta.category, dr: 0 };
    e.dr += net;
    bal.set(r.key, e);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const assets: BSRow[] = [];
  const liabilities: BSRow[] = [];
  const equity: BSRow[] = [];
  for (const [key, e] of bal) {
    if (Math.abs(e.dr) < 0.005) continue;
    if (e.category === "Asset") assets.push({ key, label: e.label, amount: round(e.dr) });
    else if (EQUITY_ACCOUNTS.has(key)) equity.push({ key, label: e.label, amount: round(-e.dr) });
    else liabilities.push({ key, label: e.label, amount: round(-e.dr) });
  }
  equity.push({ key: "accumulated_surplus", label: "Accumulated surplus (prior years)", amount: round(priorSurplus) });
  equity.push({ key: "current_surplus", label: "Current year surplus / (deficit)", amount: round(currentSurplus) });
  const sum = (r: BSRow[]) => round(r.reduce((s, x) => s + x.amount, 0));
  const totalAssets = sum(assets), totalLiabilities = sum(liabilities), totalEquity = sum(equity);
  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.01 };
}
