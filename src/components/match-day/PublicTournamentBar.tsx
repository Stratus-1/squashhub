/**
 * Public QR / Match Day view: a once-per-browser info notice plus a compact,
 * persistent "Open in SquashHub" panel (replaces the old "Exit / Log into App").
 *
 * "Open in SquashHub" is a normal full-page link to the signed-in tournament
 * page. Same browser + signed in → it opens directly (the QR device mode only
 * overrides requests; the member's own session is never touched or logged out).
 * Not signed in → the protected route sends them to sign in and back to the
 * SAME tournament. An installed app may keep its own separate session; we never
 * claim to read it — the OS may hand the link to the app, otherwise the browser
 * flow above is the fallback. No member identity or private data is shown here.
 */
import { useState } from "react";
import { ExternalLink, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PUBLIC_NOTICE_KEY = "sh.qr.publicNotice.v1";
export const PUBLIC_BAR_DISMISSED_KEY = "sh.perm.qrPublicBarDismissed";

const seen = () => { try { return localStorage.getItem(PUBLIC_NOTICE_KEY) === "1"; } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(PUBLIC_NOTICE_KEY, "1"); } catch { /* private mode: show again next time */ } };
const barDismissed = () => { try { return localStorage.getItem(PUBLIC_BAR_DISMISSED_KEY) === "1"; } catch { return false; } };
const markBarDismissed = () => { try { localStorage.setItem(PUBLIC_BAR_DISMISSED_KEY, "1"); } catch { /* private mode: show again next time */ } };

/** Absolute in-app URL for the authenticated view (same host, so club subdomains keep working). */
export function openInAppHref(kind: "tournament" | "league", competitionId?: string | null): string {
  const path = kind === "tournament" && competitionId && /^[0-9a-f-]{36}$/i.test(competitionId)
    ? `/club-champs/${competitionId}` : "/";
  return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
}

export function PublicTournamentBar({ kind, competitionId }: { kind: "tournament" | "league"; competitionId?: string | null }) {
  const [showNotice, setShowNotice] = useState(() => !seen());
  const [barHidden, setBarHidden] = useState(() => barDismissed());
  const href = openInAppHref(kind, competitionId);
  const isT = kind === "tournament";
  const dismiss = () => { markSeen(); setShowNotice(false); };
  const closeBar = () => { markSeen(); markBarDismissed(); setShowNotice(false); setBarHidden(true); };

  if (barHidden) return null;

  return (
    <>
      {/* Spacer so the fixed panel never covers the last matches or controls. */}
      <div aria-hidden className="h-20" style={{ height: "calc(5rem + env(safe-area-inset-bottom, 0px))" }} />
      <div className="fixed inset-x-0 bottom-0 z-50 px-3 pt-2" style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))" }}>
        <div className="mx-auto max-w-3xl space-y-2">
          {showNotice && (
            <div role="status" data-testid="public-view-notice" className="rounded-lg border border-primary/30 bg-card p-3 text-[13px] text-card-foreground shadow-lg">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="flex-1">
                  {isT
                    ? "You're viewing the public tournament page. To see My Games and your personal fixtures, open this tournament in SquashHub."
                    : "You're viewing the public Match Day page. To see your own games, open SquashHub."}
                </p>
                <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={dismiss}>Continue as visitor</Button>
                <Button asChild size="sm"><a href={href} onClick={markSeen}>Open in SquashHub</a></Button>
              </div>
            </div>
          )}
          <div data-testid="public-view-panel" className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-[13px] text-card-foreground shadow-md backdrop-blur">
            <span className="min-w-0 leading-tight">
              <span className="font-semibold">{isT ? "Public tournament view" : "Public Match Day view"}</span>
              <span className="block text-xs text-muted-foreground sm:inline sm:text-[13px]"><span className="hidden sm:inline"> · </span>{isT ? "My Games is available in SquashHub" : "Your games are in SquashHub"}</span>
            </span>
            <Button asChild size="sm" className="shrink-0"><a href={href}><ExternalLink className="mr-1 h-3.5 w-3.5" />Open in SquashHub</a></Button>
          </div>
        </div>
      </div>
    </>
  );
}
