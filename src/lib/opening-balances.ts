import { STANDALONE_FALLBACK_ACCOUNT, type ClubGLAccount, type GLCategory } from "@/hooks/use-club-gl-accounts";

export interface OpeningAccountMeta {
  label: string;
  type: "BS" | "IS";
  category: GLCategory;
  normal: "Dr" | "Cr";
}

export const OB_PREFIX = "Opening balance:";
export const OB_BALANCING_DESC = "Opening balances – balancing entry";

export function openingBalanceAccounts(accounts: Record<string, OpeningAccountMeta>, custom: ClubGLAccount[], clubId: string) {
  const standard = Object.entries(accounts).map(([code, meta]) => ({ code, account: code, custom_account_id: null as string | null, meta }));
  const clubAccounts = custom.filter(a => a.club_id === clubId).map(a => ({
    code: `custom:${a.id}`,
    account: a.base_account ?? STANDALONE_FALLBACK_ACCOUNT[a.category],
    custom_account_id: a.id,
    meta: {
      label: a.name,
      type: a.category === "Asset" || a.category === "Liability" ? "BS" as const : "IS" as const,
      category: a.category,
      normal: a.category === "Asset" || a.category === "Expense" ? "Dr" as const : "Cr" as const,
    },
  }));
  return (["Asset", "Liability", "Income", "Expense"] as const).flatMap(category =>
    [...standard, ...clubAccounts].filter(a => a.meta.category === category)
  );
}

export type OpeningAccount = ReturnType<typeof openingBalanceAccounts>[number];

export function openingBalanceValues(rows: { account: string; custom_account_id?: string | null; debit: number | string; credit: number | string; description: string | null }[], accounts: OpeningAccount[]) {
  const next: Record<string, string> = {};
  for (const row of rows) {
    if (row.description === OB_BALANCING_DESC) continue;
    const key = row.custom_account_id ? `custom:${row.custom_account_id}` : row.account;
    const meta = accounts.find(a => a.code === key)?.meta;
    if (!meta) continue;
    const signed = meta.normal === "Dr" ? Number(row.debit) - Number(row.credit) : Number(row.credit) - Number(row.debit);
    next[key] = String(Number(next[key] || 0) + signed);
  }
  return next;
}

export function openingBalanceRows(accounts: OpeningAccount[], values: Record<string, string>, clubId: string, journalRef: string, createdAt: string) {
  const rows = accounts.flatMap(({ code, account, custom_account_id, meta }) => {
    if (code === "opening_balance_equity") return [];
    const value = Number(values[code] || 0);
    if (!Number.isFinite(value)) throw new Error(`Enter a valid amount for ${meta.label}`);
    if (!value) return [];
    const debit = (meta.normal === "Dr" ? value : -value);
    return [{ club_id: clubId, journal_ref: journalRef, created_at: createdAt, account, custom_account_id,
      debit: Math.max(debit, 0), credit: Math.max(-debit, 0), description: `${OB_PREFIX} ${meta.label}` }];
  });
  const diff = rows.reduce((sum, row) => sum + row.debit - row.credit, 0);
  if (diff !== 0) rows.push({ club_id: clubId, journal_ref: journalRef, created_at: createdAt,
    account: "opening_balance_equity", custom_account_id: null, debit: diff < 0 ? -diff : 0,
    credit: diff > 0 ? diff : 0, description: OB_BALANCING_DESC });
  return rows;
}