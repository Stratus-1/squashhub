// Pure helpers for GoBook Lights top-ups (tested in src/test/gobook-lights-topup.test.ts).
// Only the Lights account is ever paid, and only by GoBook client ID: SquashHub member
// numbers can differ from Court Manager numbers, so membershipNumber is never sent.

export const LIGHTS_ACCOUNT = "Lights" as const;

export function lightsPaymentBody(clientId: number, amount: number, reference: string) {
  if (!Number.isInteger(clientId) || clientId <= 0) throw new Error("A linked GoBook client is required");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be more than zero");
  if (!reference) throw new Error("A unique reference is required");
  return { clientId, accountName: LIGHTS_ACCOUNT, amount: Math.round(amount * 100) / 100, reference };
}

export type GoBookPaymentState = "submitted" | "posted" | "cancelled";

/** GoBook status: Paid = accepted, not yet in Court Manager; Posted; Cancelled (rejected). */
export function mapGoBookPaymentStatus(status: unknown): GoBookPaymentState {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "posted") return "posted";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "submitted";
}

export function lightsReference(id: string): string {
  return `SH-L-${id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/** Journal lines moving the member's paid money to GoBook Lights (account nets to zero). */
export function lightsTransferLines(amount: number) {
  return [
    { account: "debtors", debit: amount, credit: 0, description: "Lights sent to GoBook" },
    { account: "light_fees_income", debit: 0, credit: amount, description: "Lights sent to GoBook" },
  ] as const;
}
