import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wifi, Copy, QrCode, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyClub } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useClubCurrency } from "@/hooks/use-currency";
import { QRCodeSVG } from "qrcode.react";

type ClubWifi = {
  ssid: string;
  password: string | null;
  security: string | null;
  hidden: boolean | null;
  notes: string | null;
};

type WifiStatus = {
  charge_enabled: boolean;
  monthly_fee: number;
  has_access: boolean;
  active: boolean;
  auto_renew: boolean;
  current_period_end: string | null;
  unpaid_amount: number;
};

/** Escape per the Wi-Fi QR spec (MECARD-style): \ ; , : must be escaped. */
const esc = (v: string) => v.replace(/([\\;,:"])/g, "\\$1");

export function buildWifiQrPayload(w: ClubWifi) {
  const type = (w.security || "WPA").toUpperCase() === "NOPASS" ? "nopass" : (w.security || "WPA");
  const parts = [`T:${type}`, `S:${esc(w.ssid)}`];
  if (type !== "nopass" && w.password) parts.push(`P:${esc(w.password)}`);
  if (w.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

/**
 * Club Wi-Fi tile. Credentials live in the protected club_secrets table and are
 * only returned by the `get_club_wifi` RPC to signed-in members (and visitors,
 * when the club allows it) who hold a current, paid-up monthly Wi-Fi pass when
 * the club charges for Wi-Fi.
 */
export function DashboardWifiCard() {
  const { data: clubData } = useMyClub();
  const clubId = (clubData?.club as { id?: string } | undefined)?.id;
  const { activeMember } = useMemberContext();
  const memberId = activeMember?.id;
  const { format } = useClubCurrency();
  const qc = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: status } = useQuery({
    enabled: !!memberId,
    queryKey: ["wifi-access-status", memberId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_wifi_access_status", {
        _club_member_id: memberId,
      });
      if (error) throw error;
      return ((data as WifiStatus[]) || [])[0] ?? null;
    },
  });

  const { data: wifi } = useQuery({
    enabled: !!clubId,
    queryKey: ["club-wifi", clubId, status?.has_access],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_club_wifi", { _club_id: clubId });
      if (error) throw error;
      return ((data as ClubWifi[]) || [])[0] ?? null;
    },
  });

  const locked = !!status?.charge_enabled && !status?.has_access;

  // Nothing to show: no Wi-Fi configured and nothing to buy
  if (!wifi?.ssid && !locked) return null;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy — long-press to select instead");
    }
  };

  const request = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("request_wifi_access", {
        _club_member_id: memberId,
      });
      if (error) throw error;
      toast.success(`Wi-Fi access enabled — ${format(Number((data as any)?.amount || 0))} added to your account`);
      qc.invalidateQueries({ queryKey: ["wifi-access-status", memberId] });
      qc.invalidateQueries({ queryKey: ["club-wifi", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Could not request Wi-Fi access");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("cancel_wifi_access", { _club_member_id: memberId });
      if (error) throw error;
      toast.success("Monthly Wi-Fi renewal cancelled");
      qc.invalidateQueries({ queryKey: ["wifi-access-status", memberId] });
    } catch (e: any) {
      toast.error(e.message || "Could not cancel");
    } finally {
      setBusy(false);
    }
  };

  const periodEnd = status?.current_period_end ? new Date(status.current_period_end) : null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          {locked ? <Lock className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Club Wi-Fi</p>
          <p className="text-[13px] text-muted-foreground break-words">
            {locked
              ? `${format(Number(status?.monthly_fee || 0))} per month — charged to your club account`
              : wifi?.ssid}
          </p>
        </div>
        {!locked && wifi?.ssid && (
          <Button size="sm" variant="outline" onClick={() => setShowQr(v => !v)}>
            <QrCode className="h-4 w-4 mr-1" />
            {showQr ? "Hide" : "Scan"}
          </Button>
        )}
      </div>

      {locked && (
        <div className="space-y-2">
          {Number(status?.unpaid_amount || 0) > 0 && (
            <p className="text-[12px] text-destructive">
              {format(Number(status?.unpaid_amount))} in unpaid Wi-Fi fees on your account — settle it to restore access.
            </p>
          )}
          <Button size="sm" className="w-full" disabled={busy} onClick={request}>
            {status?.active ? "Reactivate Wi-Fi access" : "Activate Wi-Fi access"}
          </Button>
          <p className="text-[12px] text-muted-foreground">
            {format(Number(status?.monthly_fee || 0))} is charged to your club account now and automatically every month
            until you deactivate — no need to renew.
          </p>
        </div>
      )}

      {!locked && status?.charge_enabled && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
          <p className="text-[12px] text-muted-foreground break-words">
            {status.auto_renew
              ? `Active · ${format(Number(status.monthly_fee || 0))}/month charged automatically${periodEnd ? ` · next ${periodEnd.toLocaleDateString()}` : ""}`
              : `Deactivated · access ends ${periodEnd ? periodEnd.toLocaleDateString() : "—"}`}
          </p>
          {status.auto_renew && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={cancel}>
              Deactivate
            </Button>
          )}
        </div>
      )}


      {!locked && showQr && wifi && (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/40 p-4">
          <div className="rounded-md bg-white p-3">
            <QRCodeSVG value={buildWifiQrPayload(wifi)} size={168} />
          </div>
          <p className="text-[12px] text-muted-foreground text-center">
            Point your phone camera at this code to join automatically.
          </p>
        </div>
      )}

      {!locked && wifi?.password && (
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-[13px] break-all">
            {showPassword ? wifi.password : "•".repeat(Math.min(wifi.password.length, 16))}
          </div>
          <Button size="icon" variant="ghost" onClick={() => setShowPassword(v => !v)} aria-label="Toggle password">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => copy(wifi.password!, "Password")} aria-label="Copy password">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}

      {!locked && wifi?.notes && (
        <p className="text-[12px] text-muted-foreground break-words">{wifi.notes}</p>
      )}
    </Card>
  );
}
