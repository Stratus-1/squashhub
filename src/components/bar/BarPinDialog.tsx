/**
 * Member approval step for a bar charge.
 *
 * Nothing is posted to a member account until the member themselves has
 * entered their own six-digit Bar PIN here (or a one-time code sent to their
 * registered mobile number when the PIN is unset, forgotten or locked).
 * Staff never see the digits: the pad masks every entry.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Delete, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";

export type BarVerificationMethod = "pin" | "otp";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubMemberId: string;
  memberName: string;
  /** Formatted amount, e.g. "R120.00". */
  amountLabel?: string;
  /** Counter mode adds the private-entry wording and optional signature. */
  mode?: "self" | "counter";
  captureSignature?: boolean;
  onVerified: (args: {
    secret: string;
    method: BarVerificationMethod;
    signature?: string | null;
  }) => Promise<void>;
}

function Keypad({ onDigit, onBack, disabled }: { onDigit: (d: string) => void; onBack: () => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <Button key={d} type="button" variant="outline" className="h-14 text-lg" disabled={disabled} onClick={() => onDigit(d)}>
          {d}
        </Button>
      ))}
      <span />
      <Button type="button" variant="outline" className="h-14 text-lg" disabled={disabled} onClick={() => onDigit("0")}>
        0
      </Button>
      <Button type="button" variant="ghost" className="h-14" disabled={disabled} onClick={onBack} aria-label="Delete">
        <Delete className="w-5 h-5" />
      </Button>
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  return (
    <div className="space-y-1">
      <canvas
        ref={ref}
        width={520}
        height={140}
        className="w-full h-[110px] rounded-md border bg-background touch-none"
        onPointerDown={(e) => {
          drawing.current = true;
          const ctx = ref.current!.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#111827";
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
          onChange(ref.current?.toDataURL("image/png") || null);
        }}
        onPointerLeave={() => { drawing.current = false; }}
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Optional receipt signature — it does not authorise the charge.</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-[11px]"
          onClick={() => {
            const c = ref.current;
            if (!c) return;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            onChange(null);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

export function BarPinDialog({
  open,
  onOpenChange,
  clubMemberId,
  memberName,
  amountLabel,
  mode = "self",
  captureSignature = false,
  onVerified,
}: Props) {
  const [method, setMethod] = useState<BarVerificationMethod>("pin");
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [status, setStatus] = useState<{ has_pin: boolean; locked: boolean; has_phone: boolean } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDigits("");
      setMethod("pin");
      setSentTo(null);
      setSignature(null);
      return;
    }
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_bar_pin_status", { _club_member_id: clubMemberId });
      if (error) return;
      const s = data as any;
      setStatus({ has_pin: !!s?.has_pin, locked: !!s?.locked, has_phone: !!s?.has_phone });
      if (!s?.has_pin || s?.locked) setMethod("otp");
    })();
  }, [open, clubMemberId]);

  const sendCode = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("bar-otp", { body: { club_member_id: clubMemberId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setMethod("otp");
      setDigits("");
      setSentTo((data as any)?.sent_to || "your registered number");
      toast.success("Verification code sent.");
    } catch (err: any) {
      toast.error(err.message || "Could not send a verification code");
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    if (digits.length !== 6) return;
    setBusy(true);
    try {
      await onVerified({ secret: digits, method, signature });
      setDigits("");
    } catch (err: any) {
      setDigits("");
      toast.error(err?.message || "Verification failed");
      if (String(err?.message || "").toLowerCase().includes("locked")) setMethod("otp");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" />
            {method === "pin" ? "Enter your Bar PIN" : "Enter your verification code"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "counter"
              ? `Please hand the device to ${memberName} — only they may approve this charge.`
              : `Approving a charge to ${memberName}'s member account.`}
            {amountLabel ? ` Amount: ${amountLabel}.` : ""}
          </DialogDescription>
        </DialogHeader>

        {method === "otp" && (
          <p className="text-[11px] text-muted-foreground -mt-1">
            {sentTo
              ? `We sent a six-digit code to ${sentTo}. It expires in 10 minutes.`
              : status && !status.has_pin
                ? "No Bar PIN has been set up yet — request a one-time code to continue."
                : "Request a one-time code to continue."}
          </p>
        )}

        <div className="flex justify-center gap-2 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className={`w-8 h-10 rounded-md border flex items-center justify-center text-lg ${
                i < digits.length ? "bg-muted font-bold" : ""
              }`}
            >
              {i < digits.length ? "•" : ""}
            </span>
          ))}
        </div>

        <Keypad
          disabled={busy}
          onDigit={(d) => setDigits((prev) => (prev.length >= 6 ? prev : prev + d))}
          onBack={() => setDigits((prev) => prev.slice(0, -1))}
        />

        <Button className="w-full h-11" disabled={digits.length !== 6 || busy} onClick={submit}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Approve charge"}
        </Button>

        {captureSignature && (
          <>
            <Separator />
            <SignaturePad onChange={setSignature} />
          </>
        )}

        <Separator />
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-1.5 text-xs"
          disabled={sending || busy}
          onClick={() => (method === "otp" ? sendCode() : sendCode())}
        >
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
          {method === "pin" ? "I've forgotten my PIN — send me a code" : "Send another code"}
        </Button>
        {method === "otp" && status?.has_pin && !status.locked && (
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setMethod("pin"); setDigits(""); }}>
            Use my Bar PIN instead
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
