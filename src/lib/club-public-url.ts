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

  // Already on this club's own subdomain -> just reuse the current origin.
  const firstLabel = hostname.split(".")[0];
  if (firstLabel === subdomain) {
    return `${origin}${path}`;
  }

  // Production: canonical root domain for SquashHub.
  const knownRoot = "squashhub.co.za";
  const isKnownDomain = hostname === knownRoot || hostname.endsWith(`.${knownRoot}`);

  let rootDomain = hostname;
  if (isKnownDomain) {
    rootDomain = knownRoot;
  } else {
    const labels = hostname.split(".");
    // Multi-part public suffixes (co.za, org.za, co.uk, com.au, ...) need 3
    // labels to form a registrable domain; never strip down to just "co.za".
    const suffix = labels.slice(-2).join(".");
    const multiPartSuffix = /^(co|org|net|gov|ac|web|edu|com)\.[a-z]{2}$/.test(suffix);
    const minLabels = multiPartSuffix ? 3 : 2;
    rootDomain = labels.length > minLabels ? labels.slice(labels.length - minLabels).join(".") : hostname;
  }
  return `https://${subdomain}.${rootDomain}${path}`;
}

