/**
 * Per-tenant PWA identity.
 *
 * IMPORTANT — why this no longer builds a blob: manifest.
 * Chrome only treats a page as installable when the <link rel="manifest">
 * points at a real, same-origin http(s) URL that it can fetch and re-fetch.
 * A `blob:` (or `data:`) manifest injected at runtime is parsed for display
 * purposes at best, and in Chrome/Android it silently kills installability:
 * `beforeinstallprompt` never fires, so the "Install app" / "Add to Home
 * screen" option disappears on club subdomains (reported on
 * nsc.squashapp.co.za, Aug 2026). Every club subdomain is its own origin, so
 * each club already installs as a distinct app; we only need to keep the
 * manifest URL real.
 *
 * What we still personalise safely:
 *  - a `?club=<subdomain>` query on the manifest URL (still the same static
 *    file, still installable, but a distinct manifest URL per tenant);
 *  - the iOS home-screen label (`apple-mobile-web-app-title`), which iOS
 *    reads from the document, not the manifest;
 *  - the document title.
 */
import { getClubSubdomain } from "@/lib/subdomain";
import { getPublicClubBySubdomain } from "@/lib/public-clubs";

const BASE_MANIFEST_URL = "/manifest.webmanifest";

function setManifestHref(href: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) {
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    return;
  }
  const l = document.createElement("link");
  l.rel = "manifest";
  l.href = href;
  document.head.appendChild(l);
}

function setAppleTitle(title: string): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "apple-mobile-web-app-title";
    document.head.appendChild(meta);
  }
  meta.content = title;
}

export async function applyDynamicManifest(): Promise<void> {
  try {
    const sub = getClubSubdomain();
    if (!sub) return; // root host — keep default SquashHub manifest

    // Real, same-origin, per-club manifest generated at build time
    // (/club-manifests/<subdomain>.webmanifest). Point the link at it
    // IMMEDIATELY (synchronously): the browser can read the manifest as soon
    // as the install affordance is used, and awaiting a fetch first left a
    // window in which Chrome/Android captured the generic SquashHub manifest,
    // so installed apps ended up named "SquashHub" instead of the club.
    // We then verify in the background and fall back only if the file is
    // missing (404 / SPA HTML), which keeps installability safe.
    const clubManifestUrl = `/club-manifests/${encodeURIComponent(sub.toLowerCase())}.webmanifest`;
    setManifestHref(clubManifestUrl);
    void (async () => {
      try {
        const res = await fetch(clubManifestUrl, {
          headers: { Accept: "application/manifest+json" },
        });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || type.includes("text/html")) {
          setManifestHref(`${BASE_MANIFEST_URL}?club=${encodeURIComponent(sub)}`);
        }
      } catch {
        /* keep the club manifest; a transient network error is not a 404 */
      }
    })();

    const club = await getPublicClubBySubdomain(sub);
    const clubName = club?.name?.trim();
    if (!clubName) return;

    // iOS reads its home-screen label from the document, not the manifest.
    setAppleTitle(clubName.length > 12 ? clubName.slice(0, 12).trim() : clubName);
    document.title = clubName;
  } catch (err) {
    console.warn("Dynamic manifest failed:", err);
  }
}
