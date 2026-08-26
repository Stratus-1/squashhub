import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Download, FileImage, FileText, QrCode, Share2, Copy } from "lucide-react";
import { buildClubPublicUrl } from "@/lib/club-public-url";
import { generateClubQrPoster } from "@/lib/club-qr-poster";

export type QrTarget = "landing" | "apply";

interface Props {
  clubId: string;
  clubName: string;
  subdomain: string;
  logoUrl?: string | null;
}

const TARGET_META: Record<
  QrTarget,
  { label: string; path: string; cta: string; description: string }
> = {
  landing: {
    label: "Landing page",
    path: "",
    cta: "Scan to visit our club page",
    description: "Opens the public club landing page with fees, rules and contact details.",
  },
  apply: {
    label: "New membership application",
    path: "/auth?intent=apply",
    cta: "Scan to apply for membership",
    description: "Takes a prospective member straight to the sign-up flow for this club.",
  },
};

export function ClubQrShareCard({ clubName, subdomain, logoUrl }: Props) {
  const [target, setTarget] = useState<QrTarget>("landing");
  const [posterLoading, setPosterLoading] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const url = useMemo(() => buildClubPublicUrl(subdomain, TARGET_META[target].path), [subdomain, target]);
  const meta = TARGET_META[target];

  const imageSettings = logoUrl
    ? {
        src: logoUrl,
        height: 40,
        width: 40,
        excavate: true,
      }
    : undefined;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const share = async () => {
    const shareData = {
      title: clubName,
      text: meta.cta,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch { /* user cancelled */ }
    }
    void copyUrl();
  };

  const downloadPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const urlBlob = URL.createObjectURL(svgBlob);

    const img = new Image();
    const scale = 4;
    const size = 512;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = urlBlob;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size * scale;
    canvas.height = size * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(urlBlob);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${subdomain}-${target}-qr.png`;
    a.click();
    toast.success("QR code downloaded");
  };

  const downloadPoster = async () => {
    setPosterLoading(true);
    try {
      const svg = svgRef.current;
      if (!svg) throw new Error("QR code not ready");
      await generateClubQrPoster({
        clubName,
        subdomain,
        url,
        cta: meta.cta,
        svg,
      });
      toast.success("Printable poster downloaded");
    } catch (err: any) {
      toast.error(err.message || "Could not generate poster");
    } finally {
      setPosterLoading(false);
    }
  };

  return (
    <Card className="p-4 md:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <QrCode className="w-4 h-4" /> Share & QR Code
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Generate a branded QR code the club can print, email, or share on social media.
          </p>
        </div>
      </div>

      <Tabs value={target} onValueChange={(v) => setTarget(v as QrTarget)}>
        <TabsList className="w-full">
          <TabsTrigger value="landing" className="flex-1 text-xs">
            Landing page
          </TabsTrigger>
          <TabsTrigger value="apply" className="flex-1 text-xs">
            Apply for membership
          </TabsTrigger>
        </TabsList>
        <TabsContent value="landing" className="mt-3">
          <p className="text-xs text-muted-foreground">{TARGET_META.landing.description}</p>
        </TabsContent>
        <TabsContent value="apply" className="mt-3">
          <p className="text-xs text-muted-foreground">{TARGET_META.apply.description}</p>
        </TabsContent>
      </Tabs>

      <div className="flex flex-col items-center gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <QRCodeSVG
            value={url}
            size={200}
            bgColor="#ffffff"
            fgColor="#1E3A5F"
            level="M"
            imageSettings={imageSettings}
            ref={svgRef}
          />
        </div>

        <div className="w-full space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Public link</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] break-all rounded-md border bg-muted/40 px-2 py-1.5">
              {url}
            </code>
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copyUrl}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={copyUrl}>
            <Copy className="w-3.5 h-3.5" /> Copy link
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={share}>
            <Share2 className="w-3.5 h-3.5" /> Share
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={downloadPng}>
            <FileImage className="w-3.5 h-3.5" /> QR PNG
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={downloadPoster} disabled={posterLoading}>
            <FileText className="w-3.5 h-3.5" /> {posterLoading ? "Generating…" : "Poster"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
