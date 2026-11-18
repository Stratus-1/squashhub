/**
 * Bar purchases paid at the time (card / cash / online) as statement lines.
 *
 * They never touch the member's account balance (not GL control entries), but
 * the member's My Account statement and the admin Member Statement must both
 * show them identically: each item is a debit, and each actual payment (one per
 * tab / payment reference) is ONE credit for the combined total, so they net to
 * zero. Member-account purchases ("account") are already GL lines and unpaid
 * open-tab items are not transactions yet, so both are skipped here.
 */
export type DirectBarPurchase = {
  id: string;
  created_at: string;
  item_name: string;
  quantity: number;
  total: number | string;
  method: string;
  payment_group?: string | null;
};

export type DirectBarLine = {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  paidLabel?: string;
};

const METHOD_NAME: Record<string, string> = { card: "Card", cash: "Cash", online: "Online", eft: "EFT" };

export function directBarStatementLines(purchases: DirectBarPurchase[] | null | undefined): DirectBarLine[] {
  const lines: DirectBarLine[] = [];
  const payments = new Map<string, { method: string; total: number; last: string; count: number }>();
  for (const p of purchases || []) {
    const total = Number(p.total || 0);
    if (total <= 0 || p.method === "unpaid" || p.method === "account") continue;
    lines.push({
      id: `barpaid-${p.id}`,
      date: p.created_at,
      description: `Bar purchase: ${p.quantity}× ${p.item_name}`,
      debit: total,
      credit: 0,
    });
    const key = `${p.method}|${p.payment_group ?? p.id}`;
    const g = payments.get(key) ?? { method: p.method, total: 0, last: p.created_at, count: 0 };
    g.total += total;
    g.count += 1;
    if (new Date(p.created_at) > new Date(g.last)) g.last = p.created_at;
    payments.set(key, g);
  }
  for (const [key, g] of payments) {
    lines.push({
      id: `barpay-${key}`,
      date: new Date(new Date(g.last).getTime() + 1).toISOString(),
      description: `${METHOD_NAME[g.method] ?? g.method} payment (${g.count} item${g.count === 1 ? "" : "s"})`,
      debit: 0,
      credit: Math.round(g.total * 100) / 100,
      paidLabel: `paid by ${g.method}`,
    });
  }
  return lines;
}
