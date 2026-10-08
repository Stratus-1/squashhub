import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, FileImage, Monitor, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";

/** Admin card: create a view-only, full-screen "today's court schedule" link + QR for a club screen. */
export function CourtDisplayCard({ clubId, clubName }: { clubId: string; clubName: string; logoUrl?: string | null }) {
  const qc = useQueryClient();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const key = ["court-display-token", clubId];
  const { data: token, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await fromExt("court_display_tokens").select("id, token")
        .eq("club_id", clubId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string; token: string } | null;
    },
  });

  const create = async (replace: boolean) => {
    try {
      const { data: u } = await supabase.auth.getUser();
      if (replace && token) await fromExt("court_display_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", token.id);
      const { error } = await fromExt("court_display_tokens").insert({ club_id: clubId, created_by: u.user?.id ?? null });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: key });
      toast.success(replace ? "New link created — the old one no longer works" : "Display link created");
    } catch (e: any) { toast.error(e.message || "Could not create link"); }
  };

  const url = token ? `${window.location.origin}/courts-display/${token.token}` : "";
  const copy = async () => { await navigator.clipboard.writeText(url); toast.success("Link copied"); };
  const downloadPng = async () => {
    const svg = svgRef.current; if (!svg) return;
    const blobUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = blobUrl; });
    const c = document.createElement("canvas"); c.width = c.height = 1024;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1024, 1024); ctx.drawImage(img, 0, 0, 1024, 1024);
    URL.revokeObjectURL(blobUrl);
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `${clubName}-court-display-qr.png`; a.click();
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-2"><Monitor className="w-4 h-4" /> Court display screen</h3>
        <p className="text-xs text-muted-foreground">A view-only, full-screen schedule of today's court bookings for a TV or screen at the club. No bookings can be made from it. It refreshes automatically.</p>
      </div>
      {isLoading ? null : !token ? (
        <Button size="sm" onClick={() => create(false)}>Create display link & QR code</Button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="rounded-lg border bg-white p-3"><QRCodeSVG ref={svgRef} value={url} size={150} fgColor="#1E3A5F" level="M" /></div>
          <div className="flex-1 space-y-2 min-w-0">
            <code className="block text-[11px] break-all rounded-md border bg-muted/40 px-2 py-1.5">{url}</code>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => window.open(url, "_blank")}><ExternalLink className="w-3.5 h-3.5" /> Open display</Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={copy}><Copy className="w-3.5 h-3.5" /> Copy link</Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={downloadPng}><FileImage className="w-3.5 h-3.5" /> QR PNG</Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => create(true)}><RefreshCw className="w-3.5 h-3.5" /> New link (disable old)</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
