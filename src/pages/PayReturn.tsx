import { useEffect } from "react";

/**
 * Canonical Stitch return URL. Stitch's redirect whitelist only allows exact
 * matches and has a 5-URL cap, so instead of registering every club subdomain
 * we always send payers back to https://squashhub.co.za/pay/return?to=<target>
 * and this page forwards them to their club subdomain (validated same-suffix).
 *
 * Any Stitch query params (payment ref, status, etc.) are preserved and merged
 * onto the target URL.
 */
export default function PayReturn() {
  useEffect(() => {
    const here = new URL(window.location.href);
    const to = here.searchParams.get("to");

    const fallback = "/";
    if (!to) {
      window.location.replace(fallback);
      return;
    }

    let target: URL;
    try {
      target = new URL(to);
    } catch {
      window.location.replace(fallback);
      return;
    }

    // Only allow same-brand hosts. Everything else falls back to root.
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

    // Forward every Stitch-added query param onto the target, except our own `to`.
    here.searchParams.forEach((v, k) => {
      if (k === "to") return;
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
