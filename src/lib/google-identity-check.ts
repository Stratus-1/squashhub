/**
 * Deciding whether a Google sign-in needs a second look before the app treats
 * the person as whoever the Google account says they are.
 *
 * A Google login arrives with only a name and an email, and either can collide
 * with someone else's membership — the classic case being a person who picks
 * the wrong Google account. The check asks instead of assuming, and never
 * blocks: every answer can be overridden by the person signing in.
 */

export type GoogleIdentityQuestion = "none" | "is_that_you" | "new_application";

export function decideGoogleIdentity(input: {
  /** The sign-in came through Google (email/password logins are never asked). */
  providerIsGoogle: boolean;
  /** This login already has its own membership row at this club. */
  alreadyLinked: boolean;
  /** A member at this club holds this exact email. */
  emailMatchesMember: boolean;
  /** A member at this club goes by this name. */
  nameMatchesMember: boolean;
}): GoogleIdentityQuestion {
  if (!input.providerIsGoogle || input.alreadyLinked) return "none";
  if (input.emailMatchesMember || input.nameMatchesMember) return "is_that_you";
  return "new_application";
}

/** The name Google handed over, cleaned up — "" when the account carries none. */
export function googleNameOf(meta: Record<string, unknown> | undefined | null): string {
  const raw = meta?.full_name ?? meta?.name;
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim();
}

/** True only for a sign-in that came through Google. */
export function isGoogleSignIn(appMeta: Record<string, unknown> | undefined | null): boolean {
  const provider = appMeta?.provider;
  if (typeof provider === "string" && provider.toLowerCase() === "google") return true;
  const providers = appMeta?.providers;
  return Array.isArray(providers) && providers.some((p) => String(p).toLowerCase() === "google");
}
