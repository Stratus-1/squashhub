import { useEffect } from "react";
import { readPayReturnCookie, clearPayReturnCookie } from "@/lib/stitch-checkout";

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
    const here = new URL(window.location.href);
    const fallback = "/my-account";

    const to = readPayReturnCookie();
    clearPayReturnCookie();

    if (!to) {
      const fallbackUrl = new URL(fallback, window.location.origin);
      here.searchParams.forEach((v, k) => fallbackUrl.searchParams.set(k, v));
      window.location.replace(fallbackUrl.toString());
      return;
    }

    let target: URL;
    try {
      target = new URL(to);
    } catch {
      window.location.replace(fallback);
      return;
    }

    // Only allow same-brand hosts.
    const host = target.hostname.toLowerCase();
    const allowed =
      host === "squashhub.co.za" ||
      host.endsWith(".squashhub.co.za") ||
      host === "squashhub.lovable.app" ||
      host.endsWith(".lovable.app") ||
      host === "localhost";
    if (!allowed) {
      window.location.replace(fallback);
      return;
    }

    // Forward Stitch-added query params onto the target.
    here.searchParams.forEach((v, k) => {
      if (!target.searchParams.has(k)) target.searchParams.set(k, v);
    });

    window.location.replace(target.toString());
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
