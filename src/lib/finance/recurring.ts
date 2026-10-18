export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly",
};

/** Next occurrence date (yyyy-MM-dd); month-end dates clamp like Postgres intervals. */
export function nextDueDate(date: string, f: RecurringFrequency): string {
  const [y, m, d] = date.split("-").map(Number);
  if (f === "weekly") {
    const dt = new Date(Date.UTC(y, m - 1, d + 7));
    return dt.toISOString().slice(0, 10);
  }
  const add = f === "monthly" ? 1 : f === "quarterly" ? 3 : 12;
  const tm = m - 1 + add;
  const ty = y + Math.floor(tm / 12);
  const mo = tm % 12;
  const last = new Date(Date.UTC(ty, mo + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, mo, Math.min(d, last))).toISOString().slice(0, 10);
}
