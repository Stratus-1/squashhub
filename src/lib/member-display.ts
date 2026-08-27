/**
 * Display-name guard.
 *
 * Some imported placeholder members have a phone number stored in the `name`
 * column. Never render a phone-like string as a person's name — it leaks PII
 * on public/club-facing pages (tournament draws, fixtures, ladders).
 */

/** True when a string looks like a phone number rather than a name. */
export function looksLikePhone(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  // e.g. 0823233570, +27834603007, 082 323 3570
  return /^\+?[0-9][0-9 ()-]{7,}$/.test(trimmed);
}

/** Safe display name: masks phone-like values with the given fallback. */
export function displayName(
  value: string | null | undefined,
  fallback = "Player",
): string {
  if (!value || looksLikePhone(value)) return fallback;
  return value;
}
