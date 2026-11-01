import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { OfflineStatus } from "@/lib/device-scoring/offlineScoring";

export function ScoreModeChoice({
  onLive, onOffline, busy, error,
}: { onLive: () => void; onOffline: () => void; busy: boolean; error: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">How do you want to score this match?</p>
      <Button className="w-full justify-start gap-2 h-auto py-3" onClick={onLive} disabled={busy}>
        <Wifi className="h-4 w-4" />
        <span className="text-left">
          <span className="block font-semibold">Score live</span>
          <span className="block text-xs opacity-80">As always — every point shows immediately.</span>
        </span>
      </Button>
      <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3" onClick={onOffline} disabled={busy}>
        <WifiOff className="h-4 w-4" />
        <span className="text-left">
          <span className="block font-semibold">{busy ? "Reserving…" : "Score offline"}</span>
          <span className="block text-xs text-muted-foreground">
            Only this phone scores the match. Scores save here and send when the internet is back.
          </span>
        </span>
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function OfflineScoringBanner({
  status, attention, onRetry,
}: { status: OfflineStatus; attention: string | null; onRetry: () => void }) {
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
  return (
    <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs flex items-center gap-1.5">
      {waiting ? <WifiOff className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
      <span className="font-semibold">Score offline</span>
      <span className="text-muted-foreground">
        {waiting ? "· saved on this phone, will send when online" : "· all scores sent"}
      </span>
    </div>
  );
}
