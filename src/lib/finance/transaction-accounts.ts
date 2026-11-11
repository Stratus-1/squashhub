/**
 * Account choices for Finance > Enter Transaction.
 *
 * Both Income and Payments out offer their profit-and-loss accounts PLUS every
 * balance-sheet account (assets, liabilities, equity — standard and club-made),
 * because money in/out often settles a balance-sheet item (paying a supplier,
 * refunding member credit, a loan repayment, a utility receivable).
 *
 * Never offered: the money accounts themselves (Current Account / Petty Cash),
 * Accounts Receivable (member settlement has its own linked flow) and the
 * stock-engine cost-of-sales accounts.
 */
export type TxDirection = "income" | "expense";
export type TxAccountCategory = "Asset" | "Liability" | "Income" | "Expense";

export const TX_EXCLUDED_ACCOUNTS = ["bank", "bank_current", "cash", "debtors", "bar_cost_of_sales", "shop_cost_of_sales"];

export function transactionAccountGroups<K extends string, C extends { category: string }>(
  direction: TxDirection,
  standard: Record<K, { category: TxAccountCategory }>,
  custom: C[],
) {
  const keys = (Object.keys(standard) as K[]).filter((k) => !TX_EXCLUDED_ACCOUNTS.includes(k));
  const pl: TxAccountCategory = direction === "income" ? "Income" : "Expense";
  const isBS = (cat: string) => cat !== "Income" && cat !== "Expense";
  return {
    standardPL: keys.filter((k) => standard[k].category === pl),
    standardBS: keys.filter((k) => isBS(standard[k].category)),
    customPL: custom.filter((a) => a.category === pl),
    customBS: custom.filter((a) => isBS(a.category)),
  };
}
