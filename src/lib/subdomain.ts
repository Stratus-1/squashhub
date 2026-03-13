/**
 * Resolves active club subdomain from (in order):
 * 1) ?club= query param (for path-based auth flow)
 * 2) /c/:subdomain path (path-based routing)
 * 3) host subdomain (wsc.squashhub.co.za)
 */
const ROOT_DOMAINS = [
  "squashhub.co.za",
  "squashhub.app",
  "squashhub.lovable.app",
  "localhost",
  "127.0.0.1",
];

const RESERVED_SUBDOMAIN_LABELS = new Set(["www"]);

function isValidClubSubdomain(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[a-z0-9][a-z0-9-]{1,31}$/.test(value);
}

export function getClubSubdomain(): string | null {
  const url = new URL(window.location.href);
  const hostname = url.hostname.toLowerCase();

  // 1) Query param override: /auth?club=wsc
  const fromQuery = url.searchParams.get("club")?.toLowerCase().trim();
  if (isValidClubSubdomain(fromQuery) && !RESERVED_SUBDOMAIN_LABELS.has(fromQuery)) {
    return fromQuery;
  }

  // 2) Path-based routing: /c/wsc
  const pathMatch = url.pathname.toLowerCase().match(/^\/c\/([a-z0-9][a-z0-9-]{1,31})(?:\/|$)/);
  const fromPath = pathMatch?.[1] ?? null;
  if (isValidClubSubdomain(fromPath) && !RESERVED_SUBDOMAIN_LABELS.has(fromPath)) {
    return fromPath;
  }

  // 3) Host-based routing
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  for (const root of ROOT_DOMAINS) {
    if (hostname === root) return null;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, hostname.length - root.length - 1);
      if (RESERVED_SUBDOMAIN_LABELS.has(sub)) return null;
      if (!sub.includes(".") && isValidClubSubdomain(sub)) {
        return sub;
      }
      return null;
    }
  }

  // Ignore Lovable preview hosts (not club hosts)
  if (hostname.endsWith(".lovable.app") || hostname.endsWith(".lovableproject.com")) {
    return null;
  }

  // Custom domains: infer first label when clearly subdomain-style host is used
  const labels = hostname.split(".");
  if (labels.length >= 4) {
    const candidate = labels[0];
    if (!RESERVED_SUBDOMAIN_LABELS.has(candidate) && isValidClubSubdomain(candidate)) {
      return candidate;
    }
  }
  if (labels.length === 3 && !["co", "com", "org", "net", "gov", "ac"].includes(labels[1])) {
    const candidate = labels[0];
    if (!RESERVED_SUBDOMAIN_LABELS.has(candidate) && isValidClubSubdomain(candidate)) {
      return candidate;
    }
  }

  return null;
}
