const PRODUCTION_SITE_URL = "https://squashhub.co.za";
const PRODUCTION_ROOT = "squashhub.co.za";

function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return PRODUCTION_SITE_URL;
  return trimmed.replace(/\/+$/, "");
}

/**
 * Marketing/public site URL — never a Lovable preview URL.
 * Always returns the production domain (or VITE_PUBLIC_SITE_URL override).
 */
export function getSiteUrl(): string {
  const fromEnv =
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ||
    (import.meta.env.VITE_SITE_URL as string | undefined);
  return normalizeSiteUrl(fromEnv || PRODUCTION_SITE_URL);
}

/**
 * Base URL used for auth/email redirects (signup confirmation, password reset,
 * OAuth callback). Prefers the current tenant origin when the user is on a
 * `*.squashhub.co.za` subdomain so confirmation links return them to their
 * club. Falls back to the production root domain — NEVER to a `*.lovable.app`
 * preview URL.
 */
export function getAuthRedirectBase(): string {
  const envOverride = (import.meta.env.VITE_PUBLIC_URL as string | undefined)
    ?.trim()
    ?.replace(/\/+$/, "");
  if (envOverride) return envOverride;

  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    if (
      hostname === PRODUCTION_ROOT ||
      hostname.endsWith(`.${PRODUCTION_ROOT}`)
    ) {
      return origin.replace(/\/+$/, "");
    }
  }
  return PRODUCTION_SITE_URL;
}

export function absoluteUrl(pathOrUrl: string): string {
  const value = (pathOrUrl || "").trim();
  if (!value) return getSiteUrl();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const base = getSiteUrl();
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}
