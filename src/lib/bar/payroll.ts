/** Bar staff payroll input rules — mirror the server checks in bar_confirm_payroll_run. */
export function isPayrollAmountInput(value: string): boolean {
  return value === "" || /^\d{1,7}(\.\d{0,2})?$/.test(value);
}

export function payrollAmount(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

/** Returns an error message, or null when the line may be confirmed. */
export function payrollLineError(salary: string, tips: string, maxTips: number): string | null {
  const s = payrollAmount(salary);
  const t = payrollAmount(tips);
  if (Number.isNaN(s) || Number.isNaN(t)) return "Amounts must be zero or more";
  if (t > maxTips + 0.004) return "Tips exceed the unpaid tip balance";
  if (s === 0 && t === 0) return "Nothing to pay on this line";
  return null;
}

export type PayBasis = "monthly" | "shift" | "hourly";

export interface PayrollReview { quantity: string; rate: string; salary: string; tips: string; total: string }
export function editPayrollReview(current: PayrollReview, field: keyof PayrollReview, value: string, basis: PayBasis): PayrollReview {
  const next = { ...current, [field]: value };
  if (field === "quantity" || field === "rate") {
    next.salary = (basis === "monthly" ? Number(next.rate) : Math.round(Number(next.quantity) * Number(next.rate) * 100) / 100).toFixed(2);
  }
  if (field === "total") next.salary = (Math.round((Number(value) - Number(next.tips)) * 100) / 100).toFixed(2);
  else next.total = (Number(next.salary) + Number(next.tips)).toFixed(2);
  return next;
}

/** Pay suggested for a period: fixed monthly salary, or shift rate × shifts worked (rounded to cents). */
export function suggestedPay(basis: PayBasis, monthlySalary: number, shiftRate: number, shifts: number, hourlyRate = 0, hours = 0): number {
  if (basis === "hourly") return Math.round(hourlyRate * Math.max(0, hours) * 100) / 100;
  if (basis === "shift") return Math.round(shiftRate * Math.max(0, Math.floor(shifts)) * 100) / 100;
  return Math.round(monthlySalary * 100) / 100;
}
