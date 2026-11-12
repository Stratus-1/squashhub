// Unpaid card Lights top-ups expire after 24 hours: the member cannot return to
// the same card checkout, so the request is closed as "abandoned" (Not paid).
// EFT requests are not expired here (bank transfers can take days to clear).
export const CARD_TOPUP_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function cardTopupExpiryCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - CARD_TOPUP_EXPIRY_MS).toISOString();
}

export function isExpiredCardTopup(
  row: { method?: string | null; status?: string | null; created_at: string },
  now: Date = new Date(),
): boolean {
  return row.method === "card" && row.status === "awaiting_payment"
    && new Date(row.created_at).getTime() < now.getTime() - CARD_TOPUP_EXPIRY_MS;
}
