/**
 * Share the club's bar Menu QR code (self-service bar & POS).
 *
 * Any club member can open this from the Honesty Bar page, show the QR on
 * screen for a visitor to scan, copy the link, or share it via the native
 * share sheet / WhatsApp.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { buildBarPoster, barPosterPaymentMethods, loadImageAsDataUrlWithSize, loadSquashHubBrandLogo } from "@/lib/bar/bar-poster";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy, Share2, MessageCircle, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildScanUrl } from "@/lib/qr-shortcodes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId?: string;
  clubName?: string | null;
  subdomain?: string | null;
  /** Admin view: pass the club row to enable the printable A4 poster. */
  posterClub?: any;
}

export function BarMenuQrDialog({ open, onOpenChange, clubId, clubName, subdomain, posterClub }: Props) {
  const [venue, setVenue] = useState<"bar" | "shop" | "bar-shop">("bar-shop");
  const [poster, setPoster] = useState<Blob | null>(null);
  const [posterError, setPosterError] = useState<string | null>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<{ clubId: string; subdomain?: string | null; url: string } | null>(null);
  const url = resolved?.clubId === clubId && resolved.subdomain === subdomain ? resolved.url : null;
  const accountEnabled = posterClub?.bar_account_tab_enabled !== false;
  const cardOnlineEnabled = posterClub?.bar_pay_online_enabled !== false
    && ["stitch", "yoco", "payfast"].includes(String(posterClub?.payment_gateway || "").toLowerCase());
  const swipeEnabled = posterClub?.bar_card_swipe_enabled !== false;
  const cashEnabled = posterClub?.bar_cash_enabled === true;
  const paymentMethods = barPosterPaymentMethods({ accountEnabled, cardOnlineEnabled, swipeEnabled, cashEnabled });

  useEffect(() => {
    if (!open || !clubId || url) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).rpc("get_or_create_venue_qr_code", { _club_id: clubId });
      if (cancelled) return;
      setLoading(false);
      if (error || !data) {
        toast.error("Could not load the bar QR code");
        return;
      }
      setResolved({ clubId, subdomain, url: buildScanUrl(data as string, subdomain) });
    })();
    return () => { cancelled = true; };
  }, [open, clubId, subdomain, url]);

  const shareText = `${clubName || "Our club"} bar — browse the menu and pay: `;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bar menu", text: shareText, url });
        return;
      } catch { /* user cancelled */ }
    }
    void copy();
  };

  const logoUrl = posterClub?.logo_url;
  const posterName = clubName || posterClub?.name || "Club";
  useEffect(() => {
    setPoster(null);
    setPosterError(null);
    if (!open || !url || !posterClub) return;
    let cancelled = false;
    (async () => {
      try {
        const logo = logoUrl ? await loadImageAsDataUrlWithSize(logoUrl) : null;
        const canvas = qrRef.current;
        if (!canvas || cancelled) return;
        const brandLogo = await loadSquashHubBrandLogo();
        if (cancelled) return;
        const doc = buildBarPoster({
        clubName: posterName,
        url,
        qrDataUrl: canvas.toDataURL("image/png"),
        logoDataUrl: logo?.dataUrl ?? null,
        logoWidth: logo?.width,
        logoHeight: logo?.height,
        brandLogoDataUrl: brandLogo,
        accountEnabled, cardOnlineEnabled, swipeEnabled, cashEnabled, venue,
      });
        if (!cancelled) setPoster(doc.output("blob"));
      } catch {
        if (!cancelled) setPosterError("Could not create the poster. Please close and reopen this window.");
      }
    })();
    return () => { cancelled = true; };
  }, [open, url, posterClub, posterName, logoUrl, accountEnabled, cardOnlineEnabled, swipeEnabled, cashEnabled, venue]);

  const downloadPoster = () => {
    if (!poster) return;
    const objectUrl = URL.createObjectURL(poster);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${posterName.replace(/[^a-z0-9]+/gi, "_")}_${venue}_Scan_to_Pay.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Menu QR code</DialogTitle>
          <DialogDescription>
            Scan to open the club's bar/shop menu and choose from its available payment options.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {loading || !url ? (
            <div className="h-[220px] flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="bg-white p-3 rounded-lg border">
                <QRCodeSVG value={url} size={200} />
              </div>
              <p className="text-[11px] text-muted-foreground break-all text-center">{url}</p>
              <div className="grid grid-cols-3 gap-2 w-full">
                <Button variant="secondary" size="sm" className="gap-1" onClick={copy}>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </Button>
                <Button variant="secondary" size="sm" className="gap-1" onClick={share}>
                  <Share2 className="w-3.5 h-3.5" /> Share
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText + url)}`, "_blank")}
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </Button>
              </div>
              {posterClub && (
                <>
                  <div className="hidden"><QRCodeCanvas ref={qrRef} value={url} size={1024} marginSize={4} level="M" /></div>
                  <div className="w-full space-y-2">
                    <Label htmlFor="bar-poster-heading">Poster heading</Label>
                    <Select value={venue} onValueChange={(value: "bar" | "shop" | "bar-shop") => setVenue(value)}>
                      <SelectTrigger id="bar-poster-heading"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bar-shop">Bar & Shop</SelectItem>
                        <SelectItem value="bar">Bar</SelectItem>
                        <SelectItem value="shop">Shop</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs font-medium">Accepted payment methods</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {paymentMethods.map(method => <li key={method}>{method}</li>)}
                      {!paymentMethods.length && <li>No payment methods enabled.</li>}
                    </ul>
                    {posterError && <p role="alert" className="text-xs text-destructive">{posterError}</p>}
                  </div>
                  <Button size="sm" className="w-full gap-1" onClick={downloadPoster} disabled={!poster}>
                    {!poster && !posterError ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                    Download A4 poster (PDF)
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
