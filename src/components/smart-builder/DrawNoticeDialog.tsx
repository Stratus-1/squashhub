import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWhatsAppEnabled } from "@/hooks/use-whatsapp-enabled";
import { DrawNoticeEditor, useDrawNoticeSettings } from "./DrawNoticeEditor";
import { drawNoticeKey, drawScopeTitle, loadDrawNoticeRecipients, recordDrawNotice, sendDrawNotice, type DrawScope } from "@/lib/smart-builder/draw-notice";
import "./draw-notice-dialog.css";

export const laterRoundNotice = (round: number) =>
  `Your Round ${round} match has been drawn. Open the tournament to view the draw, check your opponent and match details, score your match live, or submit your result afterwards.`;

/**
 * Wording editor + channels + recipient picker + explicit Send/Resend for ONE category's round.
 * Shared by the post-draw prompt and the permanent Player Notifications section. Never sends automatically;
 * with no fixtures yet the wording can be edited/saved/previewed but sending stays disabled.
 */
export function DrawNoticeComposer({ active = true, clubId, tournamentId, tournamentName, scope, hasFixtures = true, sentBefore, onSent, onCancel, cancelLabel = "Later", confirmSend = false, modalLayout = false, introduction }: {
  active?: boolean; clubId: string; tournamentId: string; tournamentName: string; scope: DrawScope | null; hasFixtures?: boolean;
  sentBefore?: { at: string; sent: number } | null; onSent?: () => void; onCancel?: () => void; cancelLabel?: string; confirmSend?: boolean;
  modalLayout?: boolean; introduction?: ReactNode;
}) {
  const waEnabled = useWhatsAppEnabled(clubId);
  const fallback = laterRoundNotice(scope?.round ?? 1);
  const notice = useDrawNoticeSettings(active && scope ? tournamentId : null, scope ? drawNoticeKey(scope) : "none", fallback);
  const msg = notice.value.message;
  const [ch, setCh] = useState({ app: true, email: false, wa: false });
  const [recips, setRecips] = useState<Array<{ id: string; name: string }> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!active || !scope) return;
    if (!hasFixtures) { setRecips([]); setPicked(new Set()); return; }
    setRecips(null);
    loadDrawNoticeRecipients(tournamentId, scope).then((r) => { setRecips(r); setPicked(new Set(r.map((x) => x.id))); })
      .catch((e) => { setRecips([]); toast.error(String(e.message ?? e)); });
  }, [active, hasFixtures, scope?.round, scope?.groupNumber, scope?.stageKey, tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const channels = [...(ch.app ? ["in_app" as const] : []), ...(ch.email ? ["email" as const] : []), ...(ch.wa && waEnabled ? ["whatsapp" as const] : [])];
  const send = async () => {
    if (!scope || !hasFixtures) return;
    if (!channels.length) { toast.error("Choose at least one channel."); return; }
    if (notice.dirty && !confirm("Your wording has unsaved changes. Send the wording shown on screen anyway? (It is not saved.)")) return;
    if (sentBefore && !confirm(`This draw was already sent on ${new Date(sentBefore.at).toLocaleString()}. Send it again?`)) return;
    const chLabel = channels.map((c) => c === "in_app" ? "In-app" : c === "email" ? "Email" : "WhatsApp").join(", ");
    if (confirmSend && !confirm(`Send ${drawScopeTitle(scope)}${scope.label ? ` (${scope.label})` : ""} notice to ${picked.size} player${picked.size === 1 ? "" : "s"} by ${chLabel}? This sends real messages now.`)) return;
    setSending(true);
    try {
      const { dispatched } = await sendDrawNotice(clubId, tournamentId, tournamentName, msg, channels, [...picked], true, scope, { include: true, intro: notice.value.activationIntro });
      if (dispatched?.failed) throw new Error(`${dispatched.failed} delivery attempts failed. Check Communications delivery history before sending again.`);
      await recordDrawNotice(tournamentId, drawNoticeKey(scope), dispatched?.sent ?? 0).catch(() => {});
      toast.success(`${drawScopeTitle(scope)} draw sent: ${dispatched?.sent ?? 0} deliveries.`);
      onSent?.();
    } catch (e: any) { toast.error(`Players weren't notified: ${e.message ?? e}`); }
    finally { setSending(false); }
  };

  return (
    <div className={modalLayout ? "draw-notice-modal-composer" : "space-y-3"} data-testid="draw-notice-composer">
      <div className={modalLayout ? "draw-notice-modal-body space-y-3" : "space-y-3"} data-testid={modalLayout ? "draw-notice-modal-body" : undefined}>
      {introduction}
      <DrawNoticeEditor notice={notice} disabled={sending} clubId={clubId} recipientIds={[...picked]} tournamentId={tournamentId} tournamentName={tournamentName} scope={scope} />
      {!hasFixtures ? (
        <p className="rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground" data-testid="draw-notice-no-fixtures">
          No draw for this category yet. You can edit, save and preview the wording now; match details show as "To be confirmed". Sending unlocks once fixtures exist.
        </p>
      ) : <>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><Checkbox checked={ch.app} onCheckedChange={(v) => setCh((c) => ({ ...c, app: !!v }))} />In-app</label>
          <label className="flex items-center gap-2"><Checkbox checked={ch.email} onCheckedChange={(v) => setCh((c) => ({ ...c, email: !!v }))} />Email</label>
          {waEnabled && <label className="flex items-center gap-2"><Checkbox checked={ch.wa} onCheckedChange={(v) => setCh((c) => ({ ...c, wa: !!v }))} />WhatsApp</label>}
        </div>
        <div className="space-y-1 text-sm" data-testid="draw-recipient-picker">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Send to {picked.size} of {recips?.length ?? 0} players</span>
            <span className="flex gap-2 text-xs">
              <button type="button" className="text-primary underline" onClick={() => setPicked(new Set((recips ?? []).map((r) => r.id)))}>All</button>
              <button type="button" className="text-primary underline" onClick={() => setPicked(new Set())}>None</button>
            </span>
          </div>
          {!recips ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading players…</div> : !recips.length ? <p className="text-xs text-muted-foreground">No players still to play in this round.</p> : (
            <div className={`grid grid-cols-1 gap-1 rounded border border-border p-2 sm:grid-cols-2 ${modalLayout ? "" : "max-h-48 overflow-auto overscroll-contain"}`}>
              {recips.map((r) => <label key={r.id} className="flex items-center gap-2 text-xs"><Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} />{r.name}</label>)}
            </div>
          )}
        </div>
      </>}
      </div>
      <div className={modalLayout ? "draw-notice-modal-footer flex flex-wrap justify-end gap-2 border-t border-border bg-background" : "flex flex-wrap justify-end gap-2"} data-testid="draw-notice-actions">
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={sending}>{cancelLabel}</Button>}
        <Button onClick={send} disabled={!hasFixtures || sending || !msg.trim() || !picked.size || !channels.length} data-testid="draw-notice-send">
          {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{sentBefore ? "Resend notifications" : "Send notifications"}
        </Button>
      </div>
    </div>
  );
}

/** "Send draw to players now?" prompt after a draw. Explicit send only — never automatic. */
export function DrawNoticeDialog({ open, onClose, clubId, tournamentId, tournamentName, scope, sentBefore, onSent }: {
  open: boolean; onClose: () => void; clubId: string; tournamentId: string; tournamentName: string;
  scope: DrawScope | null; sentBefore?: { at: string; sent: number } | null; onSent?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="draw-notice-modal" aria-describedby="draw-notice-dialog-description">
        <DialogHeader className="draw-notice-modal-header border-b border-border bg-background">
          <DialogTitle>Send draw to players now?</DialogTitle>
          <DialogDescription className="sr-only" id="draw-notice-dialog-description">Review the message and recipients. Nothing sends until you confirm.</DialogDescription>
        </DialogHeader>
        <DrawNoticeComposer active={open} clubId={clubId} tournamentId={tournamentId} tournamentName={tournamentName} scope={scope} sentBefore={sentBefore}
          modalLayout confirmSend introduction={<p className="text-sm text-muted-foreground">
            {scope?.label ? `${scope.label} · ` : ""}{scope ? drawScopeTitle(scope) : ""} — only players in this {scope?.stageName ? "stage" : "round"} get it, with a button to the draw and match details. Nothing has been sent yet. You can also send it later from Player Notifications.
            {sentBefore ? ` Already sent ${new Date(sentBefore.at).toLocaleString()} (${sentBefore.sent} deliveries).` : ""}
          </p>} onSent={() => { onSent?.(); onClose(); }} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
