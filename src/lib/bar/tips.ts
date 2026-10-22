export type TipMode = "none" | "percent" | "amount" | "total";
export interface TipChoice { mode: TipMode; value: string; staffId: string }
export const emptyTip: TipChoice = { mode: "none", value: "", staffId: "" };

/** Blank is editable; a minus sign is never a valid paid-tip input. */
export const isTipPayoutInput = (value: string) => /^\d*(\.\d{0,2})?$/.test(value);
export function validTipPayout(value: string, remaining: number, allowZero = false) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && amount <= remaining;
}

export function tipQuote(subtotal: number, choice: TipChoice) {
  const cents = Math.round(subtotal * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("The sale amount must be positive.");
  let tipCents = 0;
  if (choice.mode === "percent") tipCents = Math.round(cents / 10);
  if (choice.mode === "amount" || choice.mode === "total") {
    if (!/^\d+(\.\d{1,2})?$/.test(choice.value.trim())) throw new Error("Enter a valid amount with up to two decimals.");
    const entered = Math.round(Number(choice.value) * 100);
    if (!Number.isSafeInteger(entered)) throw new Error("Invalid amount.");
    tipCents = choice.mode === "total" ? entered - cents : entered;
    if (tipCents < 0) throw new Error("The total cannot be less than the sale amount.");
  }
  if (tipCents > 0 && !choice.staffId) throw new Error("Choose the serving staff person.");
  return { subtotal: cents / 100, tip: tipCents / 100, total: (cents + tipCents) / 100 };
}

export function remainingTips(earned: number, paid: number, payout = 0) {
  const balance = Math.round(earned * 100) - Math.round(paid * 100);
  const withdrawal = Math.round(payout * 100);
  if (withdrawal < 0 || withdrawal > balance) throw new Error("Cash payout exceeds unpaid tips.");
  return (balance - withdrawal) / 100;
}