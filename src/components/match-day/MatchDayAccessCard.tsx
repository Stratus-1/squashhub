/**
 * Admin-only Match Day Access controls, shared by tournaments and leagues.
 * Enable / copy / QR / print sheet / revoke / regenerate. The token is read
 * through `md_admin_*` functions which check management rights server-side.
 */
import { useEffect, useState } from "react";
import { jsPDF } from "jspdf";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Loader2, Printer, QrCode, RefreshCw, Share2, ShieldOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { matchDayUrl, courtsUsed, type MatchDayKind } from "@/lib/match-day/access";
import { useClubContext } from "@/contexts/ClubContext";
import { loadImageAsDataUrl } from "@/lib/club-qr-poster";

interface Props {
  kind: MatchDayKind;
  competitionId: string;
  competitionName: string;
  subdomain?: string | null;
}

const rpc = (fn: string, args: any) => (supabase as any).rpc(fn, args);

export function MatchDayAccessCard({ kind, competitionId, competitionName, subdomain }: Props) {
  const { club } = useClubContext();
  const [state, setState] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [courts, setCourts] = useState<Array<{ id: number; name: string }>>([]);
  const [qrFor, setQrFor] = useState<{ label: string; url: string } | null>(null);

  const refresh = async () => {
    const { data, error } = await rpc("md_admin_get", { _kind: kind, _id: competitionId });
    if (error) { setState({ error: error.message }); return; }
    setState(data);
    if (data?.token) {
      const { data: ctx } = await rpc("md_context", { _token: data.token });
      const used = courtsUsed(ctx?.matches ?? []);
      const all: any[] = ctx?.courts ?? [];
      const list = used.length ? used.map((id) => all.find((c) => c.id === id) ?? { id, name: `Court ${id}` }) : all;
      setCourts(list);
    }
  };
  useEffect(() => { void refresh(); }, [kind, competitionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: string, args: any, msg: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    const { error } = await rpc(fn, { _kind: kind, _id: competitionId, ...args });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(msg);
    void refresh();
  };

  if (state?.error) return null; // not allowed → render nothing
  const token: string | null = state?.token ?? null;
  const overall = token ? matchDayUrl(token, { subdomain }) : "";
  const courtUrl = (id: number) => (token ? matchDayUrl(token, { court: id, subdomain }) : "");

  const copy = async (u: string) => { await navigator.clipboard.writeText(u); toast.success("Link copied"); };

  const share = async (label: string, u: string) => {
    const text = `${competitionName} – ${label}: ${u}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${competitionName} – ${label}`, text }); } catch { /* user cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
  };

  const print = async () => {
    if (!token) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const qr = (id: string) => (document.getElementById(id) as HTMLCanvasElement).toDataURL("image/png");
    let logoDataUrl: string | null = null;
    if (club?.logo_url) {
      try { logoDataUrl = await loadImageAsDataUrl(club.logo_url); } catch { /* poster still works without it */ }
    }
    let y = 12;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, "PNG", 90, y, 30, 30, undefined, "FAST"); } catch { /* ignore bad logo */ }
      y += 34;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    if (club?.name) { doc.text(club.name, 105, y, { align: "center" }); y += 8; }
    doc.setFontSize(16);
    doc.text(competitionName, 105, y, { align: "center" }); y += 10;
    doc.setFontSize(13); doc.text("All Courts – Scoring, Live & Standings", 105, y, { align: "center" });
    doc.addImage(qr("md-qr-all"), "PNG", 75, y + 4, 60, 60);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(overall, 105, y + 68, { align: "center" });
    const cols = 3, w = 60, h = 72, x0 = 15, y0 = y + 76;
    const courtsOnOwnPage = y0 + 2 * h > 280;
    if (courtsOnOwnPage && courts.length) doc.addPage();
    courts.forEach((c, i) => {
      const page = Math.floor(i / 9);
      if (i > 0 && i % 9 === 0) doc.addPage();
      const k = i % 9, col = k % cols, row = Math.floor(k / cols);
      const x = x0 + col * w, y = (page === 0 && !courtsOnOwnPage ? y0 : 15) + row * h;
      doc.setLineDashPattern([1, 1], 0); doc.rect(x, y, w, h - 4);
      doc.setFont("helvetica", "bold"); doc.setFontSize(14);
      doc.text(c.name || `Court ${c.id}`, x + w / 2, y + 8, { align: "center" });
      doc.addImage(qr(`md-qr-court-${c.id}`), "PNG", x + 10, y + 11, 40, 40);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      doc.text("Scan to score this court", x + w / 2, y + 57, { align: "center" });
    });
    doc.save(`${competitionName.replace(/[^a-z0-9]+/gi, "_")}_Match_Day_QR.pdf`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2"><Smartphone className="w-4 h-4" /> Match Day Access</CardTitle>
        <p className="text-xs text-muted-foreground">
          A no-login link and QR for court tablets, players and spectators: scoring, live games, fixtures, results and standings only. No admin, players, payments or settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state ? <Loader2 className="w-4 h-4 animate-spin" /> : !token ? (
          <Button size="sm" disabled={busy} onClick={() => act("md_admin_enable", { _regenerate: false }, "Match Day Access enabled")}>Enable access</Button>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">Valid {state.starts_on} to {state.ends_on} — follows the competition dates automatically.</p>
            <div className="rounded-md border border-border p-2 space-y-2">
              <div className="text-xs font-medium">All Courts – Scoring, Live &amp; Standings</div>
              <div className="text-[11px] break-all text-muted-foreground">{overall}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(overall)}><Copy className="w-3.5 h-3.5 mr-1" />Copy link</Button>
                <Button size="sm" variant="secondary" onClick={() => setQrFor({ label: "All Courts", url: overall })}><QrCode className="w-3.5 h-3.5 mr-1" />Show QR</Button>
                <Button size="sm" variant="secondary" onClick={() => share("All Courts – Scoring, Live & Standings", overall)}><Share2 className="w-3.5 h-3.5 mr-1" />Share</Button>
              </div>
            </div>
            {courts.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {courts.map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-2 flex items-center justify-between gap-1">
                    <span className="text-xs truncate">{c.name || `Court ${c.id}`}</span>
                    <span className="flex">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy link" onClick={() => copy(courtUrl(c.id))}><Copy className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Show QR" onClick={() => setQrFor({ label: c.name || `Court ${c.id}`, url: courtUrl(c.id) })}><QrCode className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Share link" onClick={() => share(c.name || `Court ${c.id}`, courtUrl(c.id))}><Share2 className="w-3.5 h-3.5" /></Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={print}><Printer className="w-3.5 h-3.5 mr-1" />Print QR codes</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act("md_admin_enable", { _regenerate: true }, "New links created — old links no longer work", "Create new links? All printed QR codes and old links will stop working.")}><RefreshCw className="w-3.5 h-3.5 mr-1" />Regenerate</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act("md_admin_revoke", {}, "Match Day Access turned off", "Turn off Match Day Access? All links stop working.")}><ShieldOff className="w-3.5 h-3.5 mr-1" />Revoke</Button>
            </div>
            <div className="hidden">
              <QRCodeCanvas id="md-qr-all" value={overall} size={600} marginSize={1} />
              {courts.map((c) => <QRCodeCanvas key={c.id} id={`md-qr-court-${c.id}`} value={courtUrl(c.id)} size={400} marginSize={1} />)}
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={!!qrFor} onOpenChange={(v) => !v && setQrFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{qrFor?.label}</DialogTitle></DialogHeader>
          {qrFor && (
            <div className="flex flex-col items-center gap-2">
              <div className="bg-background p-3 rounded-lg border"><QRCodeSVG value={qrFor.url} size={220} /></div>
              <p className="text-[11px] break-all text-center text-muted-foreground">{qrFor.url}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
