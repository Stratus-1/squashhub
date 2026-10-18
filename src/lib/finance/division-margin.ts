export interface DivisionLedgerLine { account: string; debit: number | string; credit: number | string; journal_ref?: string }
export type TradingCostBasis = "purchases" | "cost_of_sales";
export interface SaleCostSummary { division: string; cogs: number | string; uncosted_lines: number | string }
export interface StockPurchaseReference { id: string; division: string }
/** Only invoice-linked stock debits and explicit expense-to-stock reclassifications are purchases. */
export function capitalisedPurchases(lines: DivisionLedgerLine[], purchases: StockPurchaseReference[] = []) {
  const result = { bar: 0, shop: 0 };
  const groups = new Map<string, DivisionLedgerLine[]>();
  for (const line of lines) {
    if (!line.journal_ref) continue;
    const group = groups.get(line.journal_ref) ?? [];
    group.push(line);
    groups.set(line.journal_ref, group);
  }
  for (const [ref, group] of groups) {
    let stock = group.filter(line => line.account === "bar_stock_on_hand")
      .reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0);
    if (stock <= 0) continue;
    for (const division of ["bar", "shop"] as const) {
      const reversal = group.filter(line => line.account === `${division}_expense`)
        .reduce((sum, line) => sum + Number(line.credit) - Number(line.debit), 0);
      const reclassified = Math.min(stock, Math.max(0, reversal));
      result[division] += reclassified;
      stock -= reclassified;
    }
    const purchase = purchases.find(row => row.id === ref);
    if (purchase && stock > 0) result[purchase.division === "shop" ? "shop" : "bar"] += stock;
  }
  return result;
}
/** Report-only substitution: allocated ledger costs count once on either basis. */
export function divisionMargins(lines: DivisionLedgerLine[], includeShop = false, basis: TradingCostBasis = "purchases", costs: SaleCostSummary[] = [], stockPurchases: StockPurchaseReference[] = []) {
  const balance = (account: string, income: boolean) => lines.filter(line => line.account === account)
    .reduce((sum, line) => sum + (income ? Number(line.credit) - Number(line.debit) : Number(line.debit) - Number(line.credit)), 0);
  const capitalised = capitalisedPurchases(lines, stockPurchases);
  const divisions = includeShop || capitalised.shop !== 0 || lines.some(line => line.account.startsWith("shop_")) || costs.some(row => row.division === "shop") ? ["bar", "shop"] : ["bar"];
  return divisions.map(division => {
    const sales = balance(`${division}_income`, true), purchases = balance(`${division}_expense`, false) + capitalised[division === "shop" ? "shop" : "bar"];
    const costRows = costs.filter(row => row.division === division);
    const cogs = costRows.reduce((sum, row) => sum + Number(row.cogs), 0);
    const uncostedLines = costRows.reduce((sum, row) => sum + Number(row.uncosted_lines), 0);
    const directCosts = balance(`${division}_cost_of_sales`, false);
    const tradingCost = basis === "purchases" ? purchases : cogs;
    const profit = sales - tradingCost - directCosts;
    return { division, sales, purchases, cogs, directCosts, tradingCost, uncostedLines, profit, margin: sales > 0 ? profit / sales * 100 : null };
  });
}
