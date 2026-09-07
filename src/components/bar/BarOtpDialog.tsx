/**
 * Approval step for posting a bar charge to a member's account.
 *
 * There is no stored PIN any more: the cashier sends a one-time code to the
 * member's registered mobile number (WhatsApp or SMS) and types the code the
 * member reads back. These codes are system messages — they are sent whether
 * or not the club has switched member messaging on, and the usage is logged
 * and billed to the club like any other message.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Delete, Loader2, MessageCircle, MessageSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubMemberId: string;
  memberName: string;
  /** Formatted amount, e.g. "R120.00". */
  amountLabel?: string;
  /** Counter mode adds till wording. */
  mode?: "self" | "counter";
  /** Unlocked till session token — lets the counter request a code. */
  counterToken?: string | null;
  /** Open guest-tab token — lets the QR flow request a code. */
  tabToken?: string | null;
  onVerified: (args: { secret: string; method: "otp" }) => Promise<void>;
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

export function BarOtpDialog({
  open,
  onOpenChange,
  clubMemberId,
  memberName,
  amountLabel,
  mode = "counter",
  counterToken,
  tabToken,
  onVerified,
}: Props) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState<"whatsapp" | "sms" | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentVia, setSentVia] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDigits("");
      setSentTo(null);
      setSentVia(null);
    }
  }, [open]);

  const sendCode = async (channel: "whatsapp" | "sms") => {
    setSending(channel);
    try {
      const { data, error } = await supabase.functions.invoke("bar-otp", {
        body: {
          club_member_id: clubMemberId,
          channel,
          counter_token: counterToken ?? null,
          tab_token: tabToken ?? null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setDigits("");
      setSentTo((data as any)?.sent_to || "their registered number");
      setSentVia((data as any)?.channel || channel);
      toast.success("Verification code sent.");
    } catch (err: any) {
      toast.error(err.message || "Could not send a verification code");
    } finally {
      setSending(null);
    }
  };

  const submit = async () => {
    if (digits.length !== 6) return;
    setBusy(true);
    try {
      await onVerified({ secret: digits, method: "otp" });
      setDigits("");
    } catch (err: any) {
      setDigits("");
      toast.error(err?.message || "That verification code is not valid");
    } finally {
      setBusy(false);
    }
  };

  const channelName = sentVia === "sms" ? "SMS" : sentVia === "email" ? "email" : "WhatsApp";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" /> Verify this account charge
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "counter"
              ? `Send ${memberName} a one-time code, then type the code they read back to you.`
              : `Send a one-time code to ${memberName} to approve this charge.`}
            {amountLabel ? ` Amount: ${amountLabel}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11 gap-2" disabled={!!sending || busy} onClick={() => sendCode("sms")}>
            {sending === "sms" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            SMS
          </Button>
          <Button variant="outline" className="h-11 gap-2" disabled={!!sending || busy} onClick={() => sendCode("whatsapp")}>
            {sending === "whatsapp" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            WhatsApp
          </Button>
        </div>


        <p className="text-[11px] text-muted-foreground">
          {sentTo
            ? `Code sent by ${channelName} to ${sentTo}. It expires in 10 minutes.`
            : "Choose how to send the six-digit code. Codes are always sent, even if the club's member messaging is switched off."}
        </p>

        <div className="flex justify-center gap-2 py-1">
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
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Charge to member account"}
        </Button>

        <Separator />
        <p className="text-[11px] text-muted-foreground text-center">
          The charge is only posted once the code is verified, and every charge is logged against the member's account.
        </p>
      </DialogContent>
    </Dialog>
  );
}
