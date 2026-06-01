/**
 * Dynamic PWA manifest per tenant subdomain.
 *
 * Looks up the active club by subdomain and rewrites the <link rel="manifest">
 * to a blob-URL manifest whose `name`/`short_name` reflect the club name.
 * That's the label shown under the icon on the home screen.
 *
 * IMPORTANT: Browsers PIN manifest fields at install time. Already-installed
 * PWAs will keep the old "SquashHub" label until the user removes and
 * re-installs the app. New installs pick up the club name immediately.
 */
import { supabase } from "@/integrations/supabase/client";
import { getClubSubdomain } from "@/lib/subdomain";

const BASE_MANIFEST_URL = "/manifest.webmanifest";

export async function applyDynamicManifest(): Promise<void> {
  try {
    const sub = getClubSubdomain();
    if (!sub) return; // root host — keep default SquashHub manifest

    // Fetch base manifest + club name in parallel
    const [baseRes, clubRes] = await Promise.all([
      fetch(BASE_MANIFEST_URL, { cache: "no-cache" }),
      supabase
        .from("clubs")
        .select("name, subdomain")
        .eq("subdomain", sub)
        .maybeSingle(),
    ]);

    if (!baseRes.ok) return;
    const base = await baseRes.json();
    const clubName = (clubRes.data as { name?: string } | null)?.name?.trim();
    if (!clubName) return;

    // short_name has ~12 char practical limit on Android launchers
    const shortName = clubName.length > 12 ? clubName.slice(0, 12).trim() : clubName;

    const overridden = {
      ...base,
      name: clubName,
      short_name: shortName,
      // Unique id per tenant so the OS treats each club's PWA as distinct
      id: `/?source=pwa&club=${sub}`,
      start_url: `/?source=pwa&club=${sub}`,
    };

    const blob = new Blob([JSON.stringify(overridden)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);

    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) {
      link.href = url;
    } else {
      const l = document.createElement("link");
      l.rel = "manifest";
      l.href = url;
      document.head.appendChild(l);
    }
  } catch (err) {
    console.warn("Dynamic manifest failed:", err);
  }
}
