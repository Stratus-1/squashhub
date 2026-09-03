/**
 * ProductScanDialog — scan a product's printed barcode / QR with the phone
 * camera (native BarcodeDetector) to add it to the current basket. Includes a
 * manual code-entry fallback for devices without BarcodeDetector support.
 *
 * The dialog keeps scanning after each match so staff can scan several items
 * in a row; a short cooldown prevents the same code firing twice instantly.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ScanBarcode, CameraOff, Keyboard } from "lucide-react";

export interface ScannableItem {
  id: string;
  name: string;
  price: number;
  barcode?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ScannableItem[];
  onItem: (item: ScannableItem) => void;
  /**
   * Raw-code capture mode: when provided, scanned/typed codes are returned
   * verbatim (no item matching) and the dialog closes after one code.
   * Used by the item editor to capture a barcode into the form.
   */
  onCode?: (code: string) => void;
}

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

export function ProductScanDialog({ open, onOpenChange, items, onItem, onCode }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualMode, setManualMode] = useState(false);

  const supported = typeof window !== "undefined" && !!window.BarcodeDetector;

  const playSuccessBeep = () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
      setTimeout(() => ctx.close(), 250);
    } catch {
      /* ignore audio failures */
    }
  };


  const match = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    if (lastRef.current.code === code && now - lastRef.current.at < 1500) return;
    lastRef.current = { code, at: now };
    if (onCode) {
      // Raw capture: stop the camera immediately, hand the code back, and close.
      stopCamera();
      onOpenChange(false);
      onCode(code);
      return;
    }
    const item = items.find((i) => (i.barcode ?? "").trim() === code);
    if (item) {
      onItem(item);
      toast.success(`Added ${item.name}`);
    } else {
      toast.error(`No item with barcode ${code}`);
    }
  };

  useEffect(() => {
    if (!open) return;
    setCameraError(null);
    setManualMode(false);
    lastRef.current = { code: "", at: 0 };

    if (!supported) {
      setManualMode(true);
      return;
    }

    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length && codes[0].rawValue) match(codes[0].rawValue);
          } catch {
            /* detector hiccup — keep scanning */
          }
          timerRef.current = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        if (!cancelled) {
          setCameraError("Camera not available — enter the barcode manually below.");
          setManualMode(true);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supported, items]);

  const stopCamera = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) stopCamera();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5" /> Scan product barcode
          </DialogTitle>
          <DialogDescription>
            {onCode
              ? "Point the camera at the product's barcode to capture its code."
              : "Point the camera at the product's barcode — matching items are added automatically. Scan as many as you like, then close."}
          </DialogDescription>
        </DialogHeader>

        {!manualMode && (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-x-8 top-1/2 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] pointer-events-none" />
          </div>
        )}

        {cameraError && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CameraOff className="w-4 h-4 shrink-0" /> {cameraError}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Type barcode digits"
            inputMode="numeric"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                match(manual);
                setManual("");
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              match(manual);
              setManual("");
            }}
          >
            Add
          </Button>
        </div>

        {supported && !manualMode && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => { stopCamera(); setManualMode(true); }}>
            <Keyboard className="w-3.5 h-3.5" /> Enter code manually instead
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
