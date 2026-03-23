import { useEffect } from "react";
import { useClubContext } from "@/contexts/ClubContext";

const DEFAULT_NAME = "SquashHub";
const DEFAULT_ICON_192 = "/pwa-192x192.png";
const DEFAULT_ICON_512 = "/pwa-512x512.png";

/**
 * Dynamically overrides the PWA manifest, apple-touch-icon, favicon,
 * and document title so each club's installed app uses the club logo & name.
 * Falls back to SquashHub defaults when no club or no logo.
 */
export function DynamicPwaManifest() {
  const { club } = useClubContext();

  useEffect(() => {
    const name = club?.name || DEFAULT_NAME;
    const hasLogo = !!club?.logo_url;
    const iconSrc = hasLogo ? club.logo_url! : DEFAULT_ICON_192;
    const iconSrc512 = hasLogo ? club.logo_url! : DEFAULT_ICON_512;

    // 1) Update <title> fallback (Helmet may override later)
    document.title = name;

    // 2) Update apple-mobile-web-app-title
    setMeta("apple-mobile-web-app-title", name);

    // 3) Update apple-touch-icon
    setLink("apple-touch-icon", iconSrc);

    // 4) Update favicon
    setLinkBySelector('link[rel="icon"][type="image/png"]', iconSrc);

    // 5) Generate and inject a dynamic manifest blob
    const manifest = {
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: club
        ? `${name} — powered by SquashHub`
        : "The all-in-one platform for squash clubs",
      theme_color: "#1e3a5f",
      background_color: "#f5f6f8",
      display: "standalone",
      orientation: "any",
      start_url: "/",
      icons: [
        {
          src: iconSrc,
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: iconSrc512,
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    };

    const blob = new Blob([JSON.stringify(manifest)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    // Replace the existing manifest link
    let manifestLink = document.querySelector(
      'link[rel="manifest"]'
    ) as HTMLLinkElement | null;
    if (manifestLink) {
      manifestLink.href = url;
    } else {
      manifestLink = document.createElement("link");
      manifestLink.rel = "manifest";
      manifestLink.href = url;
      document.head.appendChild(manifestLink);
    }

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [club]);

  return null;
}

/* ── helpers ── */

function setMeta(name: string, content: string) {
  let el = document.querySelector(
    `meta[name="${name}"]`
  ) as HTMLMetaElement | null;
  if (el) {
    el.content = content;
  } else {
    el = document.createElement("meta");
    el.name = name;
    el.content = content;
    document.head.appendChild(el);
  }
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(
    `link[rel="${rel}"]`
  ) as HTMLLinkElement | null;
  if (el) {
    el.href = href;
  } else {
    el = document.createElement("link");
    el.rel = rel;
    el.href = href;
    document.head.appendChild(el);
  }
}

function setLinkBySelector(selector: string, href: string) {
  const el = document.querySelector(selector) as HTMLLinkElement | null;
  if (el) {
    el.href = href;
  }
}
