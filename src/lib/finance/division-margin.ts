export interface DivisionLedgerLine { account: string; debit: number | string; credit: number | string }
export type TradingCostBasis = "purchases" | "cost_of_sales";
export interface SaleCostSummary { division: string; cogs: number | string; uncosted_lines: number | string }
/** Report-only substitution: allocated ledger costs count once on either basis. */
export function divisionMargins(lines: DivisionLedgerLine[], includeShop = false, basis: TradingCostBasis = "purchases", costs: SaleCostSummary[] = []) {
  const balance = (account: string, income: boolean) => lines.filter(line => line.account === account)
    .reduce((sum, line) => sum + (income ? Number(line.credit) - Number(line.debit) : Number(line.debit) - Number(line.credit)), 0);
  const divisions = includeShop || lines.some(line => line.account.startsWith("shop_")) || costs.some(row => row.division === "shop") ? ["bar", "shop"] : ["bar"];
  return divisions.map(division => {
    const sales = balance(`${division}_income`, true), purchases = balance(`${division}_expense`, false);
    const costRows = costs.filter(row => row.division === division);
    const cogs = costRows.reduce((sum, row) => sum + Number(row.cogs), 0);
    const uncostedLines = costRows.reduce((sum, row) => sum + Number(row.uncosted_lines), 0);
    const directCosts = balance(`${division}_cost_of_sales`, false);
    const tradingCost = basis === "purchases" ? purchases : cogs;
    const profit = sales - tradingCost - directCosts;
    return { division, sales, purchases, cogs, directCosts, tradingCost, uncostedLines, profit, margin: sales > 0 ? profit / sales * 100 : null };
  });
}
