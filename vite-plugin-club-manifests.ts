import type { Plugin } from "vite";

/**
 * Emits a real, same-origin manifest file per club subdomain:
 *   /club-manifests/<subdomain>.webmanifest
 *
 * Chrome only treats a page as installable when <link rel="manifest"> points
 * at a fetchable static http(s) file, so we generate them at build time from
 * the list of public clubs instead of injecting a blob: manifest at runtime.
 * Icons stay the SquashHub PNGs (guaranteed 192/512 px) so installability is
 * never broken by an odd-sized club logo — only the app NAME/label changes.
 */

interface ClubRow {
  name: string | null;
  subdomain: string | null;
}

const BASE = {
  description: "Court bookings, ladders, leagues and challenges for your squash club.",
  scope: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "any",
  background_color: "#1e3a5f",
  theme_color: "#1e3a5f",
  lang: "en-ZA",
  dir: "ltr",
  prefer_related_applications: false,
  categories: ["sports", "lifestyle", "productivity"],
  icons: [
    { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/pwa-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

function shortName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 12 ? trimmed.slice(0, 12).trim() : trimmed;
}

export function buildClubManifest(name: string): string {
  return JSON.stringify(
    {
      name,
      short_name: shortName(name),
      id: "/?source=pwa",
      start_url: "/?source=pwa",
      ...BASE,
    },
    null,
    2,
  );
}

async function fetchClubs(env: Record<string, string>): Promise<ClubRow[]> {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/rest/v1/rpc/list_public_clubs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: "{}",
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as ClubRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function clubManifestsPlugin(): Plugin {
  let env: Record<string, string> = {};
  return {
    name: "squashhub-club-manifests",
    apply: () => true,
    configResolved(config) {
      env = config.env as unknown as Record<string, string>;
    },
    // Dev: serve the manifests on the fly so subdomain previews behave the same.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/club-manifests\/([a-z0-9-]+)\.webmanifest/i);
        if (!match) return next();
        const clubs = await fetchClubs(env);
        const club = clubs.find((c) => (c.subdomain || "").toLowerCase() === match[1].toLowerCase());
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(buildClubManifest(club?.name?.trim() || "SquashHub"));
      });
    },
    async generateBundle() {
      const clubs = await fetchClubs(env);
      for (const club of clubs) {
        const sub = (club.subdomain || "").trim().toLowerCase();
        const name = (club.name || "").trim();
        if (!sub || !name || !/^[a-z0-9-]+$/.test(sub)) continue;
        this.emitFile({
          type: "asset",
          fileName: `club-manifests/${sub}.webmanifest`,
          source: buildClubManifest(name),
        });
      }
    },
  };
}
