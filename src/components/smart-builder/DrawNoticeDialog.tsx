import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWhatsAppEnabled } from "@/hooks/use-whatsapp-enabled";
import { DrawNoticeEditor } from "./DrawNoticeEditor";
import { drawNoticeKey, loadDrawNoticeRecipients, recordDrawNotice, sendDrawNotice, type DrawScope } from "@/lib/smart-builder/draw-notice";

export const laterRoundNotice = (round: number) =>
  `Your Round ${round} match has been drawn. Open the tournament to view the draw, check your opponent and match details, score your match live, or submit your result afterwards.`;

/**
 * "Send draw to players now?" for ONE category's round. Explicit send only — never automatic.
 * Recipients are only the players in that category's round; each send is logged for Sent / Resend.
 */
export function DrawNoticeDialog({ open, onClose, clubId, tournamentId, tournamentName, scope, sentBefore, onSent }: {
  open: boolean; onClose: () => void; clubId: string; tournamentId: string; tournamentName: string;
  scope: DrawScope | null; sentBefore?: { at: string; sent: number } | null; onSent?: () => void;
}) {
  const waEnabled = useWhatsAppEnabled(clubId);
  const [msg, setMsg] = useState("");
  const [ch, setCh] = useState({ app: true, email: false, wa: false });
  const [recips, setRecips] = useState<Array<{ id: string; name: string }> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!open || !scope) return;
    setMsg(laterRoundNotice(scope.round)); setRecips(null);
    loadDrawNoticeRecipients(tournamentId, scope).then((r) => { setRecips(r); setPicked(new Set(r.map((x) => x.id))); })
      .catch((e) => { setRecips([]); toast.error(String(e.message ?? e)); });
  }, [open, scope?.round, scope?.groupNumber, tournamentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!scope) return;
    const channels = [...(ch.app ? ["in_app" as const] : []), ...(ch.email ? ["email" as const] : []), ...(ch.wa && waEnabled ? ["whatsapp" as const] : [])];
    if (!channels.length) { toast.error("Choose at least one channel."); return; }
    if (sentBefore && !confirm(`This draw was already sent on ${new Date(sentBefore.at).toLocaleString()}. Send it again?`)) return;
    setSending(true);
    try {
      const { dispatched } = await sendDrawNotice(clubId, tournamentId, tournamentName, msg, channels, [...picked], true, scope);
      if (dispatched?.failed) throw new Error(`${dispatched.failed} delivery attempts failed. Check Communications delivery history before sending again.`);
      await recordDrawNotice(tournamentId, drawNoticeKey(scope), dispatched?.sent ?? 0).catch(() => {});
      toast.success(`Round ${scope.round} draw sent: ${dispatched?.sent ?? 0} deliveries.`);
      onSent?.(); onClose();
    } catch (e: any) { toast.error(`Players weren't notified: ${e.message ?? e}`); }
    finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send draw to players now?</DialogTitle>
          <DialogDescription>
            {scope?.label ? `${scope.label} · ` : ""}Round {scope?.round} — only players in this round get it, with a button to the draw and match details. Nothing has been sent yet.
            {sentBefore ? ` Already sent ${new Date(sentBefore.at).toLocaleString()} (${sentBefore.sent} deliveries).` : ""}
          </DialogDescription>
        </DialogHeader>
        <DrawNoticeEditor value={msg} onChange={setMsg} disabled={sending} />
        <div className="space-y-2 text-sm">
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
          {!recips ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading players…</div> : (
            <div className="grid max-h-48 grid-cols-1 gap-1 overflow-auto rounded border border-border p-2 sm:grid-cols-2">
              {recips.map((r) => <label key={r.id} className="flex items-center gap-2 text-xs"><Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n; })} />{r.name}</label>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Later</Button>
          <Button onClick={send} disabled={sending || !msg.trim() || !picked.size || (!ch.app && !ch.email && !(ch.wa && waEnabled))}>{sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Send now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
