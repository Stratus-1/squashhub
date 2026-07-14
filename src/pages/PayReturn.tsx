import { useEffect } from "react";
import { readPayReturnCookie, clearPayReturnCookie } from "@/lib/stitch-checkout";
import { supabase } from "@/integrations/supabase/client";

/**
 * Canonical Stitch return URL. Stitch's redirect whitelist requires an exact
 * string match and caps at 5 entries, so instead of registering every club
 * subdomain we always send payers to https://squashhub.co.za/pay/return and
 * this page forwards them to their club subdomain. The real destination is
 * stashed in an apex-scoped cookie (`.squashhub.co.za`) before opening Stitch.
 *
 * Any Stitch query params (payment ref, status, etc.) on the current URL are
 * preserved and merged onto the target.
 */
export default function PayReturn() {
  useEffect(() => {
    void (async () => {
      const here = new URL(window.location.href);
      const fallback = "/my-account";
      const fallbackTarget = await buildFallbackTarget(here) || new URL(fallback, window.location.origin);

      const to = readPayReturnCookie();
      clearPayReturnCookie();

      if (!to) {
        here.searchParams.forEach((v, k) => fallbackTarget.searchParams.set(k, v));
        window.location.replace(fallbackTarget.toString());
        return;
      }

      let target: URL;
      try {
        target = new URL(to);
      } catch {
        window.location.replace(fallback);
        return;
      }

      if (!isAllowedTarget(target)) {
        window.location.replace(fallback);
        return;
      }

      // Forward Stitch-added query params onto the target.
      here.searchParams.forEach((v, k) => {
        if (!target.searchParams.has(k)) target.searchParams.set(k, v);
      });

      window.location.replace(target.toString());
    })();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Returning you to your club…
      </div>
    </main>
  );
}

async function buildFallbackTarget(here: URL) {
  const club = (here.searchParams.get("stitch_club") || "").trim().toLowerCase();
  if (isSafeClubSubdomain(club)) return new URL(`/my-account`, `https://${club}.squashhub.co.za`);

  const sessionId = (here.searchParams.get("stitch_session") || "").trim();
  if (!sessionId) return null;

  try {
    const { data } = await supabase.functions.invoke("stitch-return-target", {
      body: { session_id: sessionId },
    });
    const redirectUrl = String((data as any)?.redirect_url || "");
    if (!redirectUrl) return null;
    const target = new URL(redirectUrl);
    return isAllowedTarget(target) ? target : null;
  } catch {
    return null;
  }
}

function isSafeClubSubdomain(club: string) {
  return /^[a-z0-9-]{2,32}$/.test(club) && !["www", "app", "admin"].includes(club);
}

function isAllowedTarget(target: URL) {
  const host = target.hostname.toLowerCase();
  return (
    host === "squashhub.co.za" ||
    host.endsWith(".squashhub.co.za") ||
    host === "squashhub.lovable.app" ||
    host.endsWith(".lovable.app") ||
    host === "localhost"
  );
}
