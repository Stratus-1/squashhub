import { useEffect, useRef, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { drawNoticeMode, type DrawNoticeMode } from "@/lib/smart-builder/draw-notice";
import { dismissFixtureNotices, flushQueuedWhatsApp, loadOpenFixtureNotices, sendFixtureNotices, splitOpenNotices, type OpenFixtureNotice } from "@/lib/tournaments/fixture-draw-notice";

/**
 * Per-fixture draw notices for newly CONFIRMED matches (both players known).
 * Prompt mode: approve sending, or Later (stays listed, send any time). Corrections are listed separately.
 * Automatic mode: nothing to approve; queued WhatsApp/SMS is dispatched once here. Off: renders nothing.
 */
export function FixtureDrawNoticePrompt({ clubId, tournamentId, reloadKey }: { clubId: string; tournamentId: string; reloadKey?: number }) {
  const [mode, setMode] = useState<DrawNoticeMode | null>(null);
  const [open, setOpen] = useState<OpenFixtureNotice[]>([]);
  const [busy, setBusy] = useState(false);
  const flushed = useRef(false);
  const load = async () => {
    const { data } = await (supabase as any).from("tournaments").select("beta_lifecycle").eq("id", tournamentId).maybeSingle();
    const m = drawNoticeMode((data as any)?.beta_lifecycle);
    setMode(m);
    if (m === "off") { setOpen([]); return; }
    const r = await loadOpenFixtureNotices(tournamentId);
    setOpen(r.open);
    if (m === "auto" && r.waQueued && !flushed.current) {
      flushed.current = true;
      const n = await flushQueuedWhatsApp(clubId, tournamentId).catch(() => 0);
      if (n) toast.success(`Sent ${n} queued WhatsApp/SMS draw notice${n === 1 ? "" : "s"}.`);
    }
  };
  useEffect(() => { load().catch(() => {}); }, [tournamentId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mode || mode === "off" || !open.length) return null;
  const { fresh, later } = splitOpenNotices(open);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); await load(); } catch (e: any) { toast.error(e?.message ?? "Could not update draw notices"); } finally { setBusy(false); } };
  const send = (ids: string[]) => run(async () => {
    const r = await sendFixtureNotices(clubId, tournamentId, ids);
    toast.success(`Draw notices sent (${r.sent} in-app/email${r.waSent ? `, ${r.waSent} WhatsApp/SMS` : ""}).`);
  });
  const row = (n: OpenFixtureNotice) => (
    <li key={n.id} className="flex flex-wrap gap-x-2 text-xs">
      <span className="font-medium">{n.a} v {n.b}</span>
      <span className="text-muted-foreground">· {n.label}{n.group ? ` · Cat ${n.group}` : ""} · {n.when}</span>
      {n.state === "correction" && <span className="font-semibold text-destructive">Players changed — correction</span>}
    </li>
  );
  return (
    <section className="rounded border border-primary/40 bg-primary/5 p-3 space-y-2" data-testid="fixture-draw-notice-prompt" aria-label="Draw notices to send">
      {fresh.length > 0 && <>
        <p className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4 text-primary" />{fresh.length} newly confirmed match{fresh.length === 1 ? "" : "es"} — send draw notices to these players?</p>
        <ul className="space-y-0.5">{fresh.map(row)}</ul>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => send(fresh.map((n) => n.id))}>{busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Send to players</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => dismissFixtureNotices(tournamentId, fresh.map((n) => n.id)))}>Later</Button>
        </div>
      </>}
      {later.length > 0 && <details className="text-xs">
        <summary className="cursor-pointer">{later.length} confirmed match{later.length === 1 ? "" : "es"} not yet notified (you chose Later)</summary>
        <ul className="mt-1 space-y-0.5">{later.map(row)}</ul>
        <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => send(later.map((n) => n.id))}>Send these now</Button>
      </details>}
    </section>
  );
}
