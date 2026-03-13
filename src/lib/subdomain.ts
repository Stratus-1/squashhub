/**
 * Extracts the club subdomain from the current hostname.
 *
 * Supported patterns:
 *   wsc.squashhub.co.za   → "wsc"
 *   wsc.squashhub.app     → "wsc"
 *   wsc.squashhub.lovable.app → "wsc"
 *   localhost / squashhub.co.za (bare) → null
 *
 * The base domains that are considered "root" (no club subdomain):
 */
const ROOT_DOMAINS = [
  "squashhub.co.za",
  "squashhub.app",
  "squashhub.lovable.app",
  "localhost",
  "127.0.0.1",
];

export function getClubSubdomain(): string | null {
  const hostname = window.location.hostname.toLowerCase();

  // Preview / localhost → no subdomain routing
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  // Check each known root domain
  for (const root of ROOT_DOMAINS) {
    if (hostname === root) return null; // exact match = root site
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      // Ignore "www"
      if (sub === "www") return null;
      // Only accept single-level subdomains (no dots)
      if (!sub.includes(".") && sub.length >= 2 && sub.length <= 5) {
        return sub;
      }
      return null;
    }
  }

  // Lovable preview domains (*.lovable.app) — check for double-sub pattern
  if (hostname.endsWith(".lovable.app")) {
    // e.g. id-preview--xxx.lovable.app — this is the preview, not a club
    return null;
  }

  return null;
}
