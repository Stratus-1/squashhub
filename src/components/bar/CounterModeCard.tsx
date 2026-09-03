/**
 * Counter mode setup — lets a club admin / bar-permission user set the short
 * staff PIN that unlocks a bar tablet from the menu QR code (no login needed),
 * and sign out every unlocked device.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Store, Loader2 } from "lucide-react";

export function CounterModeCard({ clubId }: { clubId?: string | null }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["bar-counter-status", clubId],
    enabled: !!clubId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bar_counter_status", { _club_id: clubId } as any);
      if (error) throw error;
      return data as any;
    },
  });

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("bar_counter_set_pin", {
        _club_id: clubId, _pin: pin, _label: "Bar counter",
      } as any);
      if (error) throw error;
      setPin("");
      qc.invalidateQueries({ queryKey: ["bar-counter-status"] });
      toast.success("Counter PIN saved — unlocked devices were signed out");
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the counter PIN");
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    try {
      const { error } = await supabase.rpc("bar_counter_revoke_devices", { _club_id: clubId } as any);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["bar-counter-status"] });
      toast.success("All counter devices signed out");
    } catch (e: any) {
      toast.error(e.message ?? "Could not sign devices out");
    }
  }

  if (!clubId) return null;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Store className="w-4 h-4" /> Counter mode (no login)
        </div>
        {status?.has_pin && (
          <Badge variant="secondary" className="text-[11px]">
            {status.unlocked_devices} device{status.unlocked_devices === 1 ? "" : "s"} unlocked
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Whoever is behind the bar scans the club menu QR code, opens “Counter mode” and enters this PIN.
        They can then run guest tabs for the evening without a SquashHub login. Charging a member's account
        still needs that member's own Bar PIN.
      </p>
      <div className="text-[11px] flex items-center gap-1.5">
        {status?.has_pin ? (
          <span className="text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Counter PIN is set
            {status.pin_updated_at
              ? ` · last changed ${new Date(status.pin_updated_at).toLocaleString()}`
              : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">No counter PIN set yet.</span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <Label className="text-[11px]">{status?.has_pin ? "New counter PIN" : "Counter PIN"} (4–8 digits)</Label>
          <Input
            inputMode="numeric" value={pin} maxLength={8}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="h-10 tracking-widest"
            placeholder="••••"
          />
        </div>
        <Button className="self-end h-10" disabled={pin.length < 4 || saving} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => navigate("/bar/counter")}>
          Open counter mode
        </Button>
        {status?.has_pin && (
          <Button variant="outline" size="sm" onClick={revoke}>
            Sign out all counter devices
          </Button>
        )}
      </div>
    </Card>
  );
}

