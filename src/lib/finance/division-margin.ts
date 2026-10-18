export interface DivisionLedgerLine { account: string; debit: number | string; credit: number | string }
/** Purchase-based contribution, not inventory COGS; never added to net income twice. */
export function divisionMargins(lines: DivisionLedgerLine[], includeShop = false) {
  const balance = (account: string, income: boolean) => lines.filter(line => line.account === account)
    .reduce((sum, line) => sum + (income ? Number(line.credit) - Number(line.debit) : Number(line.debit) - Number(line.credit)), 0);
  const divisions = includeShop || lines.some(line => line.account.startsWith("shop_")) ? ["bar", "shop"] : ["bar"];
  return divisions.map(division => {
    const sales = balance(`${division}_income`, true), purchases = balance(`${division}_expense`, false);
    const profit = sales - purchases;
    return { division, sales, purchases, profit, margin: sales > 0 ? profit / sales * 100 : null };
  });
}
