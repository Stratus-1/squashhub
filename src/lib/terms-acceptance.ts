/**
 * Where SquashHub records agreement to the Terms of Use and Privacy Policy.
 *
 * Every signup path stores the two timestamps on the auth account's metadata:
 * the email registration form passes them at sign-up, and the visitor, league
 * and bulk-registration flows write them server-side. A provider sign-in
 * (Google) is created by the provider and never sees that form, so it arrives
 * with neither key — the onboarding wizard then asks for the tick and writes
 * the same two keys back.
 */

export type AccountMetadata = Record<string, unknown> | undefined | null;

/** True when this account carries no record of agreeing to the terms. */
export function termsPendingFromMetadata(meta: AccountMetadata): boolean {
  return !stampOf(meta?.terms_accepted_at);
}

/**
 * The metadata patch that records acceptance, or null when the account already
 * has one — an earlier acceptance is never overwritten.
 */
export function termsPatch(
  meta: AccountMetadata,
  acceptedAt: string
): { terms_accepted_at: string; privacy_accepted_at: string } | null {
  if (stampOf(meta?.terms_accepted_at)) return null;
  return { terms_accepted_at: acceptedAt, privacy_accepted_at: acceptedAt };
}

function stampOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
