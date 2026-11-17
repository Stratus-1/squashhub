import { divisionMargins, type DivisionLedgerLine, type TradingCostBasis, type SaleCostSummary, type StockPurchaseReference } from "./division-margin";

export interface StatementLine extends DivisionLedgerLine { description?: string | null; custom_account_id?: string | null }
export interface StatementAccount { label: string; category: string }
export interface StatementCustomAccount { id: string; name: string; category: string; reporting_category?: string | null; base_account?: string | null }
export interface StatementRow { label: string; amount: number }
export const DEFAULT_INCOME_STATEMENT_BASIS: TradingCostBasis = "cost_of_sales";

/** A club-made expense account that is just another name for Salaries & Wages. */
export const isSalaryAccountName = (name: string) => /^(salary|salaries)\s*(&|and)\s*wages?$/i.test(name.trim());

/** Short, readable drill-down label for a salary line (statement/opening-balance prefixes removed). */
export function salaryDetailLabel(description?: string | null) {
  const text = (description ?? "").trim();
  if (/^Opening balances?\b/i.test(text)) return "Opening balance (prior period)";
  return text.replace(/^Salary — /, "").replace(/^Bank statement:\s*/i, "").trim() || "Other wages";
}

/** Trading costs belong above gross income, never again below it. */
export function groupedIncome(sourceLines: StatementLine[], standardAccounts: Record<string, StatementAccount>, hasShop: boolean, basis: TradingCostBasis = DEFAULT_INCOME_STATEMENT_BASIS, costs: SaleCostSummary[] = [], purchases: StockPurchaseReference[] = [], customAccounts: StatementCustomAccount[] = []) {
  const accounts = { ...standardAccounts, salary_wages: { label: "Salaries & Wages", category: "Expense" } };
  const lines = sourceLines.map(line => {
    // Keep historical payroll journals intact while using the current reporting classification.
    if (line.account === "salary_wages" || (line.account === "bar_cost_of_sales" && line.description?.startsWith("Salary — "))) {
      return { ...line, account: "salary_wages", custom_account_id: null };
    }
    const custom = customAccounts.find(account => account.id === line.custom_account_id);
    if (!custom) return line;
    if (custom.category === "Expense" && !custom.reporting_category && isSalaryAccountName(custom.name)) return { ...line, account: "salary_wages", custom_account_id: null };
    const allocation = custom.reporting_category ?? (custom.base_account === "bar_cost_of_sales" || custom.base_account === "shop_cost_of_sales" ? custom.base_account : null);
    if (allocation) return { ...line, account: allocation, description: custom.name };
    if (["bar_income", "shop_income", "bar_expense", "shop_expense"].includes(line.account)) return line;
    const key = `custom:${custom.id}`;
    accounts[key] = { label: custom.name, category: custom.category };
    return { ...line, account: key };
  });
  const salaryDetails = new Map<string, number>();
  for (const line of lines.filter(line => line.account === "salary_wages")) {
    const label = salaryDetailLabel(line.description);
    salaryDetails.set(label, (salaryDetails.get(label) ?? 0) + Number(line.debit) - Number(line.credit));
  }
  const tradingAccounts = new Set(["bar_income", "shop_income", "bar_expense", "shop_expense", "bar_cost_of_sales", "shop_cost_of_sales"]);
  const primary: StatementRow[] = [], expenses: StatementRow[] = [];
  for (const [account, meta] of Object.entries(accounts)) {
    if (tradingAccounts.has(account) || !["Income", "Expense"].includes(meta.category)) continue;
    const amount = lines.filter(line => line.account === account).reduce((sum, line) => sum + (meta.category === "Income" ? Number(line.credit) - Number(line.debit) : Number(line.debit) - Number(line.credit)), 0);
    if (Math.abs(amount) < 0.005) continue;
    (meta.category === "Income" ? primary : expenses).push({ label: meta.label, amount });
  }
  const divisions = divisionMargins(lines, hasShop, basis, costs, purchases).map(row => {
    const tipPeople = new Map<string, { received: number; paid: number }>();
    const tipPerson = (name: string) => {
      const person = tipPeople.get(name) ?? { received: 0, paid: 0 };
      tipPeople.set(name, person);
      return person;
    };
    if (row.division === "bar") for (const line of lines.filter(line => line.account === "bar_income" && line.description?.startsWith("Tip income — "))) {
      tipPerson((line.description ?? "").slice("Tip income — ".length).trim() || "Staff").received += Number(line.credit) - Number(line.debit);
    }
    const allocated = new Map<string, number>();
    for (const line of lines.filter(line => line.account === `${row.division}_cost_of_sales`)) {
      const label = line.description?.trim() || "Allocated direct costs";
      const amount = Number(line.debit) - Number(line.credit);
      if (row.division === "bar" && label.startsWith("Tips paid — ")) {
        tipPerson(label.slice("Tips paid — ".length).trim() || "Staff").paid += amount;
        continue;
      }
      allocated.set(label, (allocated.get(label) ?? 0) + amount);
    }
    const tipTotal = [...tipPeople.values()].reduce((sum, person) => sum + person.received, 0);
    const tipIncome = [...tipPeople]
      .map(([name, person]) => ({ label: `Tips — ${name}`, amount: person.received - person.paid, received: person.received, paid: person.paid }))
      .filter(row => Math.abs(row.amount) >= 0.005);
    return { ...row, sales: row.sales - tipTotal, tipIncome, allocated: [...allocated].map(([label, amount]) => ({ label, amount })).filter(row => Math.abs(row.amount) >= 0.005) };
  });
  const primaryTotal = primary.reduce((sum, row) => sum + row.amount, 0);
  const grossIncome = primaryTotal + divisions.reduce((sum, row) => sum + row.profit, 0);
  const generalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);
  return { primary, expenses, divisions, primaryTotal, grossIncome, generalExpenses, salaryDetails: [...salaryDetails].map(([label, amount]) => ({ label, amount })).filter(row => Math.abs(row.amount) >= 0.005), netProfit: grossIncome - generalExpenses };
}