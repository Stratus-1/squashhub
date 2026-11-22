import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SignatureValue =
  | { kind: "saved" }
  | { kind: "image"; dataUrl: string; save: boolean }
  | null;

/** Draw with finger/mouse, upload an image, or reuse a saved signature. */
export function SignaturePad({ savedUrl, onChange, allowSave = true }: {
  savedUrl?: string | null; onChange: (v: SignatureValue) => void; allowSave?: boolean;
}) {
  const [mode, setMode] = useState<"saved" | "draw" | "upload">(savedUrl ? "saved" : "draw");
  const [save, setSave] = useState(!savedUrl);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => { if (savedUrl && mode === "draw" && !hasInk.current) setMode("saved"); }, [savedUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === "saved") onChange({ kind: "saved" });
    else if (mode === "upload") onChange(uploaded ? { kind: "image", dataUrl: uploaded, save } : null);
    else onChange(hasInk.current && canvasRef.current ? { kind: "image", dataUrl: canvasRef.current.toDataURL("image/png"), save } : null);
  }, [mode, save, uploaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const c = canvasRef.current; if (!c || mode !== "draw") return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!; ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0f172a";
    hasInk.current = false;
  }, [mode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d")!; const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true;
  };
  const up = () => {
    if (!drawing.current) return; drawing.current = false;
    if (hasInk.current && canvasRef.current) onChange({ kind: "image", dataUrl: canvasRef.current.toDataURL("image/png"), save });
  };
  const clear = () => {
    const c = canvasRef.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false; onChange(null);
  };
  const onFile = (f?: File) => {
    if (!f) return; if (f.size > 3_000_000) return;
    const rd = new FileReader(); rd.onload = () => setUploaded(String(rd.result)); rd.readAsDataURL(f);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {savedUrl && <Button type="button" size="sm" variant={mode === "saved" ? "default" : "outline"} onClick={() => setMode("saved")}>Use my saved signature</Button>}
        <Button type="button" size="sm" variant={mode === "draw" ? "default" : "outline"} onClick={() => setMode("draw")}>Sign by hand</Button>
        <Button type="button" size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}>Upload signature</Button>
      </div>
      {mode === "saved" && savedUrl && (
        <div className="rounded-md border bg-card p-2"><img src={savedUrl} alt="Saved signature" className="h-20 object-contain bg-background rounded" /></div>
      )}
      {mode === "draw" && (
        <div className="space-y-1">
          <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            className="w-full h-36 rounded-md border bg-background touch-none" style={{ backgroundColor: "#ffffff" }} aria-label="Signature area" />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Sign inside the box</span>
            <button type="button" className="underline" onClick={clear}>Clear</button>
          </div>
        </div>
      )}
      {mode === "upload" && (
        <div className="space-y-1">
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onFile(e.target.files?.[0])} className="text-xs" />
          {uploaded && <img src={uploaded} alt="Uploaded signature" className={cn("h-20 object-contain rounded border")} style={{ backgroundColor: "#ffffff" }} />}
        </div>
      )}
      {allowSave && mode !== "saved" && (
        <div className="flex items-center gap-2">
          <Checkbox id="save-sig" checked={save} onCheckedChange={(v) => setSave(!!v)} />
          <Label htmlFor="save-sig" className="text-xs font-normal">{savedUrl ? "Replace my saved signature with this one" : "Save as my signature for next time"}</Label>
        </div>
      )}
    </div>
  );
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}
