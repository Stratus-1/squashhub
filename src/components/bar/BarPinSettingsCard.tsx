/**
 * Member account setting — "Bar PIN".
 *
 * The six-digit PIN approves bar and shop charges to the member's account.
 * It is stored hashed and never returned to the client; a forgotten PIN is
 * reset with a one-time code sent to the member's registered mobile number.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useMemberContext } from "@/contexts/MemberContext";
import { KeyRound, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

export function BarPinSettingsCard() {
  const qc = useQueryClient();
  const { activeMember } = useMemberContext();
  const memberId = activeMember?.id;

  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [otp, setOtp] = useState("");
  const [useOtp, setUseOtp] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["bar-pin-status", memberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_bar_pin_status", { _club_member_id: memberId });
      if (error) throw error;
      return data as { has_pin: boolean; locked: boolean; has_phone: boolean };
    },
    enabled: !!memberId,
  });

  if (!memberId) return null;

  const sendCode = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("bar-otp", { body: { club_member_id: memberId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setUseOtp(true);
      toast.success(`Verification code sent to ${(data as any)?.sent_to || "your registered number"}.`);
    } catch (err: any) {
      toast.error(err.message || "Could not send a code");
    } finally {
      setSending(false);
    }
  };

  const save = async () => {
    if (!/^\d{6}$/.test(pin)) return toast.error("Your Bar PIN must be six digits");
    if (pin !== confirmPin) return toast.error("The two PINs do not match");
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("set_my_bar_pin", {
        _club_member_id: memberId,
        _pin: pin,
        _current_pin: useOtp ? null : currentPin || null,
        _otp: useOtp ? otp : null,
      });
      if (error) throw error;
      toast.success("Your Bar PIN has been saved.");
      setOpen(false);
      setPin(""); setConfirmPin(""); setCurrentPin(""); setOtp(""); setUseOtp(false);
      qc.invalidateQueries({ queryKey: ["bar-pin-status", memberId] });
    } catch (err: any) {
      toast.error(err.message || "Could not save your Bar PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Bar PIN
          </p>
          <p className="text-[11px] text-muted-foreground">
            A six-digit PIN you enter to approve bar and shop charges to your member account.
          </p>
        </div>
        <Badge variant={status?.has_pin ? "secondary" : "outline"} className="shrink-0 text-[10px]">
          {status?.locked ? "Locked" : status?.has_pin ? "Active" : "Not set"}
        </Badge>
      </div>

      {!open ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
          {status?.has_pin ? "Change my Bar PIN" : "Create my Bar PIN"}
        </Button>
      ) : (
        <div className="space-y-2">
          {status?.has_pin && !useOtp && (
            <div className="space-y-1">
              <Label className="text-xs">Current PIN</Label>
              <Input
                inputMode="numeric" type="password" maxLength={6} className="h-9"
                value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          {status?.has_pin && useOtp && (
            <div className="space-y-1">
              <Label className="text-xs">Verification code</Label>
              <Input
                inputMode="numeric" maxLength={6} className="h-9"
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">New six-digit PIN</Label>
            <Input
              inputMode="numeric" type="password" maxLength={6} className="h-9"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirm new PIN</Label>
            <Input
              inputMode="numeric" type="password" maxLength={6} className="h-9"
              value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save PIN"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {status?.has_pin && (
            <Button size="sm" variant="ghost" className="w-full gap-1.5 text-xs" disabled={sending} onClick={sendCode}>
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
              I've forgotten my PIN — send a code instead
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
