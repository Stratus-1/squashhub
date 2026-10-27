type Row = Record<string, unknown>;

function rows(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((v): v is Row => !!v && typeof v === "object");
  if (!value || typeof value !== "object") return [];
  const row = value as Row;
  for (const key of ["balances", "items", "results", "data", "result"]) {
    if (row[key] !== undefined) return rows(row[key]);
  }
  return [row];
}

/** Never return another client's balance, nor interpret absent/invalid amounts as zero. */
export function goBookBalance(value: unknown, clientId: number): { balance: number; asAt: string | null } | null {
  const candidates = rows(value).filter(row => Number(row.clientId) === clientId);
  if (candidates.length !== 1) return null;
  const row = candidates[0];
  if (row.balance === null || row.balance === undefined || row.balance === "") return null;
  const balance = Number(row.balance);
  if (!Number.isFinite(balance)) return null;
  const asAt = typeof row.asAt === "string" && Number.isFinite(Date.parse(row.asAt)) ? row.asAt : null;
  return { balance, asAt };
}

export function goBookBalances(value: unknown, clientId: number, providerId: number) {
  return rows(value).filter(row => Number(row.clientId) === clientId && Number(row.providerId) === providerId)
    .flatMap(row => {
      const result = goBookBalance([row], clientId);
      return result ? [{ ...result, accountName: typeof row.accountName === "string" ? row.accountName : "Court Manager" }] : [];
    });
}