/**
 * Build a public URL for a club that works on production subdomains,
 * preview hosts, and localhost.
 *
 * Production canonical root is derived from `window.location.origin`.
 * If the current origin is the root domain, we return a real subdomain URL.
 * On preview/localhost we keep the `/c/:subdomain` path format so the link
 * still works inside the sandbox.
 */
export function buildClubPublicUrl(subdomain: string, path = ""): string {
  if (typeof window === "undefined") return "";

  const origin = window.location.origin;
  const hostname = window.location.hostname;
  const isPreview = hostname.includes("lovable.app") || hostname === "localhost" || hostname.includes("localhost");

  if (isPreview) {
    return `${origin}/c/${subdomain}${path}`;
  }

  // Production: canonical root domain for SquashHub.
  // For known *.squashhub.co.za hosts the root is always squashhub.co.za
  // (not co.za). For unknown/custom domains, strip exactly one subdomain
  // level as a safe fallback.
  const knownRoot = "squashhub.co.za";
  const isKnownDomain = hostname === knownRoot || hostname.endsWith(`.${knownRoot}`);
  const rootDomain = isKnownDomain
    ? knownRoot
    : hostname.includes(".")
      ? hostname.split(".").slice(1).join(".")
      : hostname;
  return `https://${subdomain}.${rootDomain}${path}`;
}
