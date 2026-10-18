import { divisionMargins, type DivisionLedgerLine, type TradingCostBasis, type SaleCostSummary, type StockPurchaseReference } from "./division-margin";

export interface StatementLine extends DivisionLedgerLine { description?: string | null }
export interface StatementAccount { label: string; category: string }
export interface StatementRow { label: string; amount: number }

/** Trading costs belong above gross income, never again below it. */
export function groupedIncome(lines: StatementLine[], accounts: Record<string, StatementAccount>, hasShop: boolean, basis: TradingCostBasis, costs: SaleCostSummary[] = [], purchases: StockPurchaseReference[] = []) {
  const tradingAccounts = new Set(["bar_income", "shop_income", "bar_expense", "shop_expense", "bar_cost_of_sales", "shop_cost_of_sales"]);
  const primary: StatementRow[] = [], expenses: StatementRow[] = [];
  for (const [account, meta] of Object.entries(accounts)) {
    if (tradingAccounts.has(account) || !["Income", "Expense"].includes(meta.category)) continue;
    const amount = lines.filter(line => line.account === account).reduce((sum, line) => sum + (meta.category === "Income" ? Number(line.credit) - Number(line.debit) : Number(line.debit) - Number(line.credit)), 0);
    if (Math.abs(amount) < 0.005) continue;
    (meta.category === "Income" ? primary : expenses).push({ label: meta.label, amount });
  }
  const divisions = divisionMargins(lines, hasShop, basis, costs, purchases).map(row => {
    const allocated = new Map<string, number>();
    for (const line of lines.filter(line => line.account === `${row.division}_cost_of_sales`)) {
      const label = line.description?.trim() || "Allocated direct costs";
      allocated.set(label, (allocated.get(label) ?? 0) + Number(line.debit) - Number(line.credit));
    }
    return { ...row, allocated: [...allocated].map(([label, amount]) => ({ label, amount })).filter(row => Math.abs(row.amount) >= 0.005) };
  });
  const primaryTotal = primary.reduce((sum, row) => sum + row.amount, 0);
  const grossIncome = primaryTotal + divisions.reduce((sum, row) => sum + row.profit, 0);
  const generalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
  return { primary, expenses, divisions, primaryTotal, grossIncome, generalExpenses, netProfit: grossIncome - generalExpenses };
}