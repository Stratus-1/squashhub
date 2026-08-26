const PRODUCTION_SITE_URL = "https://www.squashhub.co.za";
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
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return origin.replace(/\/+$/, "");
    }
    if (
      hostname === PRODUCTION_ROOT ||
      hostname.endsWith(`.${PRODUCTION_ROOT}`)
    ) {
      return origin.replace(/\/+$/, "");
    }
  }
  return PRODUCTION_SITE_URL;
}

/**
 * Builds an auth-email redirect URL that lands on the local dev origin when
 * running on localhost, or on the production root otherwise. The active tenant
 * subdomain is encoded as `?tenant=<sub>` so the bootstrap script in
 * `index.html` can re-route production auth flows back to the club they were
 * using while localhost dev stays on the local origin.
 */
export function getTenantAwareAuthRedirect(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  let tenant: string | null = null;
  let base = PRODUCTION_SITE_URL;

  const envOverride = (import.meta.env.VITE_PUBLIC_URL as string | undefined)
    ?.trim()
    ?.replace(/\/+$/, "");
  if (envOverride) {
    base = envOverride;
  } else if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      base = origin.replace(/\/+$/, "");
    }
  }

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    if (hostname.endsWith(`.${PRODUCTION_ROOT}`) && hostname !== `www.${PRODUCTION_ROOT}`) {
      const sub = hostname.slice(0, hostname.length - PRODUCTION_ROOT.length - 1);
      if (sub && !sub.includes(".") && sub !== "www") tenant = sub;
    }
  }

  const url = new URL(`${base}${cleanPath}`);
  if (tenant) url.searchParams.set("tenant", tenant);
  return url.toString();
}

export function absoluteUrl(pathOrUrl: string): string {
  const value = (pathOrUrl || "").trim();
  if (!value) return getSiteUrl();
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const base = getSiteUrl();
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}
