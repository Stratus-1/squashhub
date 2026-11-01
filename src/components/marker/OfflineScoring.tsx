import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { OfflineStatus } from "@/lib/device-scoring/offlineScoring";

export function ScoreModeChoice({
  onLive, onOffline, busy, error,
}: { onLive: () => void; onOffline: () => void; busy: boolean; error: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">How do you want to score this match?</p>
      <Button className="w-full justify-start items-start gap-2 h-auto py-3 whitespace-normal" onClick={onLive} disabled={busy}>
        <Wifi className="h-4 w-4 mt-0.5 shrink-0" />
        <span className="text-left min-w-0 flex-1">
          <span className="block font-semibold">Score live</span>
          <span className="block text-xs opacity-80">
            Use when the internet connection is good. Every point is synced automatically as you score.
          </span>
        </span>
      </Button>
      <Button variant="outline" className="w-full justify-start items-start gap-2 h-auto py-3 whitespace-normal" onClick={onOffline} disabled={busy}>
        <WifiOff className="h-4 w-4 mt-0.5 shrink-0" />
        <span className="text-left min-w-0 flex-1">
          <span className="block font-semibold">{busy ? "Reserving…" : "Score offline"}</span>
          <span className="block text-xs text-muted-foreground">
            Use when the internet connection is not stable. Only this phone scores the match; it auto-syncs
            regularly wherever possible and sends everything when the internet is back.
          </span>
        </span>
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function OfflineScoringBanner({
  status, attention, onRetry, onHandOver,
}: { status: OfflineStatus; attention: string | null; onRetry: () => void; onHandOver?: () => void }) {
  if (status === "attention") {
    return (
      <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Score offline: not accepted</p>
        <p className="text-xs text-muted-foreground break-words">The score is kept on this phone. {attention}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  }
  const waiting = status === "waiting";
  // Fixed single-line height: the status text changes with every point scored,
  // and wrapping to a second line made the scoreboard jump up and down.
  return (
    <div className="mb-3 flex h-9 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-muted/40 px-3 text-xs">
      {waiting ? <WifiOff className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
      <span className="shrink-0 font-semibold">Score offline</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {waiting ? "· saved on phone — syncs when online" : "· all scores sent"}
      </span>
      {onHandOver && (
        <Button size="sm" variant="outline" className="ml-auto h-7 shrink-0 px-2 text-xs" disabled={waiting} onClick={onHandOver}
          title={waiting ? "Available once all scores are sent" : "Let another phone carry on marking"}>
          Hand over
        </Button>
      )}
    </div>
  );
}
