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
