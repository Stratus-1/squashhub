/**
 * Share the club's Honesty Bar menu QR code.
 *
 * Any club member can open this from the Honesty Bar page, show the QR on
 * screen for a visitor to scan, copy the link, or share it via the native
 * share sheet / WhatsApp.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Copy, Share2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildScanUrl } from "@/lib/qr-shortcodes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubId?: string;
  clubName?: string | null;
  subdomain?: string | null;
}

export function BarMenuQrDialog({ open, onOpenChange, clubId, clubName, subdomain }: Props) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

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
      setUrl(buildScanUrl(data as string, subdomain));
    })();
    return () => { cancelled = true; };
  }, [open, clubId, subdomain, url]);

  const shareText = `${clubName || "Our club"} Honesty Bar — browse the menu and pay: `;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Honesty Bar menu", text: shareText, url });
        return;
      } catch { /* user cancelled */ }
    }
    void copy();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Honesty Bar QR code</DialogTitle>
          <DialogDescription>
            Let a visitor scan this with their phone camera to open the full bar menu and pay.
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
