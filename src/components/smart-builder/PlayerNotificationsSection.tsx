import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadNotificationScopes, type NotificationScope } from "@/lib/smart-builder/notification-scopes";
import { DrawNoticeComposer } from "./DrawNoticeDialog";

/**
 * Permanent "Player Notifications" section under Tournament Running (admin screen).
 * Per category / round: edit + save wording, choose recipients, preview the exact email for a real player,
 * send a test to yourself, and explicitly Send / Resend. Never sends automatically.
 */
export function PlayerNotificationsSection({ clubId, tournamentId, tournamentName }: { clubId: string; tournamentId: string; tournamentName: string }) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<NotificationScope[] | null>(null);
  const [cat, setCat] = useState<string>("");
  const [key, setKey] = useState<string>("");
  const reload = () => loadNotificationScopes(tournamentId).then(setScopes).catch(() => setScopes([]));
  useEffect(() => { if (open) reload(); }, [open, tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => [...new Set((scopes ?? []).map((s) => s.categoryLabel))], [scopes]);
  useEffect(() => { if (cats.length && !cats.includes(cat)) setCat(cats[0]); }, [cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const inCat = (scopes ?? []).filter((s) => s.categoryLabel === cat);
  useEffect(() => { if (inCat.length && !inCat.some((s) => s.key === key)) setKey((inCat.find((s) => s.hasFixtures && !s.sent) ?? inCat[inCat.length - 1]).key); }, [cat, scopes]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = inCat.find((s) => s.key === key) ?? null;

  return (
    <section className="tournament-primary-panel rounded border border-border" data-testid="player-notifications">
      <button type="button" className="tournament-notification-heading flex w-full items-center gap-2 p-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Bell className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Player Notifications</span>
        <span className="text-xs text-muted-foreground">Draw &amp; round messages per category — edit, preview, test, send or resend</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3 text-xs">
          {!scopes ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading categories…</div>
            : !scopes.length ? <p className="text-muted-foreground">No categories found for this tournament.</p> : <>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Category">
              {cats.map((c) => (
                <button key={c} type="button" role="tab" aria-selected={c === cat} onClick={() => setCat(c)}
                  className={cn("rounded-full border px-2.5 py-1", c === cat ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>{c}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Round or stage">
              {inCat.map((s) => (
                <button key={s.key} type="button" role="tab" aria-selected={s.key === key} onClick={() => setKey(s.key)}
                  className={cn("rounded border px-2 py-1 text-left", s.key === key ? "border-primary ring-2 ring-primary/50" : "border-border hover:bg-muted")}>
                  <span className="font-medium">{s.title}</span>
                  <span className="ml-1 text-muted-foreground">· {s.hasFixtures ? `${s.games} game${s.games === 1 ? "" : "s"}` : "no draw yet"} · {s.sent ? `Sent ${new Date(s.sent.at).toLocaleDateString()} (${s.sent.sent})` : "Not sent"}</span>
                </button>
              ))}
            </div>
            {sel && (
              <div className="rounded border border-border p-3">
                <p className="mb-2 text-muted-foreground">{sel.categoryLabel} · {sel.title}{sel.sent ? ` — already sent ${new Date(sel.sent.at).toLocaleString()} (${sel.sent.sent} deliveries).` : " — not sent yet."} Only players in this {sel.scope.stageName ? "stage" : "round"} are listed.</p>
                <DrawNoticeComposer key={sel.key} clubId={clubId} tournamentId={tournamentId} tournamentName={tournamentName} scope={sel.scope}
                  hasFixtures={sel.hasFixtures} sentBefore={sel.sent} confirmSend onSent={reload} />
              </div>
            )}
          </>}
        </div>
      )}
    </section>
  );
}
