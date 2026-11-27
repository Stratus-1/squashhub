import { supabase } from "@/integrations/supabase/client";

/**
 * Root-host → club-subdomain session hand-off.
 * Sessions are stored per origin, so a member who signs in on the main
 * SquashHub page is sent to their club's own address with the session in
 * the URL fragment (never sent to any server) and signed in there once.
 */
export const KNOWN_ROOTS = ["squashhub.co.za", "squashhub.app"];
const KEY = "sh_handoff";

/** Root apex host (no club subdomain), or null when not on production. */
export function productionRootHost(hostname: string): string | null {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return KNOWN_ROOTS.includes(h) ? h : null;
}

export function isSafeSubdomain(sub: unknown): sub is string {
  return typeof sub === "string" && /^[a-z0-9-]{2,40}$/.test(sub) && sub !== "www";
}

export function buildHandoffUrl(protocol: string, root: string, subdomain: string, accessToken: string, refreshToken: string): string {
  const payload = new URLSearchParams({ at: accessToken, rt: refreshToken }).toString();
  return `${protocol}//${subdomain}.${root}/#${KEY}=${encodeURIComponent(payload)}`;
}

export function parseHandoffHash(hash: string): { at: string; rt: string } | null {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get(KEY);
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  const at = p.get("at"), rt = p.get("rt");
  return at && rt ? { at, rt } : null;
}

/** Call once at startup on every host; consumes and strips the fragment. */
export async function consumeSessionHandoff(): Promise<void> {
  if (typeof window === "undefined") return;
  const tokens = parseHandoffHash(window.location.hash);
  if (!tokens) return;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  try {
    await supabase.auth.setSession({ access_token: tokens.at, refresh_token: tokens.rt });
  } catch {
    // Fall back to the normal club sign-in page.
  }
}
