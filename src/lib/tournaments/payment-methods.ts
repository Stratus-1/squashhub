export type TournamentPaymentMethod = "card" | "eft" | "cash" | "account";

export function acceptsAccountCharge(methods: readonly string[] | null | undefined): boolean {
  return Array.isArray(methods) && methods.includes("account");
}

export function accountChargeLabel(amountCents: number): string {
  return `Add R${(Math.max(0, Number(amountCents) || 0) / 100).toFixed(2)} to my account`;
}