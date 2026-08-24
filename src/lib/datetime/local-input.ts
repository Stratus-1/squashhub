/**
 * Helpers for <input type="datetime-local"> values.
 *
 * A datetime-local input holds a LOCAL wall-clock string ("2026-08-17T09:00").
 * Reading a stored UTC timestamp with `new Date(iso).toISOString().slice(0,16)`
 * puts the UTC clock time into a local-time field; saving it back with
 * `new Date(value).toISOString()` then re-interprets it as local time and the
 * timestamp drifts by the UTC offset on every open/save cycle (e.g. -2h per
 * save in South Africa). Always pair these two helpers.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC/ISO timestamp -> value for a datetime-local input (local wall clock). */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value -> UTC ISO timestamp for storage. */
export function fromLocalInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** True when a round-trip through the input would change the stored instant. */
export function localInputRoundTripsCleanly(iso: string | null | undefined): boolean {
  if (!iso) return true;
  const back = fromLocalInputValue(toLocalInputValue(iso));
  if (!back) return false;
  // Inputs only carry minute precision.
  return Math.abs(new Date(back).getTime() - new Date(iso).getTime()) < 60_000;
}
