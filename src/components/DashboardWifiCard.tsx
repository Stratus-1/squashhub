import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  wifi_enabled: boolean;
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
export function DashboardWifiCard({ asTile = false }: { asTile?: boolean } = {}) {
  const { data: clubData } = useMyClub();
  const clubId = (clubData?.club as { id?: string } | undefined)?.id;
  const { activeMember } = useMemberContext();
  const memberId = activeMember?.id;
  const { format } = useClubCurrency();
  const qc = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [open, setOpen] = useState(false);
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

  // Announcement toast introducing paid club Wi-Fi.
  // Shown at most once per day until the member actually opens the Wi-Fi dialog.
  useEffect(() => {
    if (asTile === false && window.innerWidth < 768) return; // avoid double-fire across variants
    if (!status?.wifi_enabled) return;
    if (status?.active) return; // already on Wi-Fi — nothing to announce
    const key = `sh.wifi.announced.${clubId ?? "x"}`;
    if (localStorage.getItem(key) === "done") return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(`${key}.day`) === today) return;
    localStorage.setItem(`${key}.day`, today);
    const t = setTimeout(() => {
      toast("Club Wi-Fi is now available", {
        description: status?.charge_enabled
          ? `Get the club Wi-Fi password on your phone for just ${format(Number(status?.monthly_fee || 0))} a month — tap the violet “Club Wi-Fi” tile on your dashboard to activate.`
          : "Tap the violet “Club Wi-Fi” tile on your dashboard to get the password or scan the QR code.",
        duration: 15000,
        action: {
          label: "Open",
          onClick: () => {
            localStorage.setItem(key, "done");
            setOpen(true);
          },
        },
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [asTile, status?.wifi_enabled, status?.active, status?.charge_enabled, status?.monthly_fee, clubId, format]);



  // Hidden entirely unless the club has switched Wi-Fi on in Access Control
  if (status && !status.wifi_enabled) return null;


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
      toast.success(
        (data as any)?.prorata
          ? `Wi-Fi access enabled — ${format(Number((data as any)?.amount || 0))} pro-rata for the rest of this month, then ${format(Number((data as any)?.monthly_fee || 0))} on the 1st of each month`
          : `Wi-Fi access enabled — ${format(Number((data as any)?.amount || 0))} added to your account — repeats monthly`,
      );
      qc.invalidateQueries({ queryKey: ["wifi-access-status", memberId] });
      qc.invalidateQueries({ queryKey: ["club-wifi", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Could not activate Wi-Fi access");
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
      toast.success("Wi-Fi deactivated — no further monthly charges");
      qc.invalidateQueries({ queryKey: ["wifi-access-status", memberId] });
    } catch (e: any) {
      toast.error(e.message || "Could not cancel");
    } finally {
      setBusy(false);
    }
  };

  const periodEnd = status?.current_period_end ? new Date(status.current_period_end) : null;

  return (
    <>
      {asTile ? (
        <Button
          variant="outline"
          className="flex-col h-auto py-3 gap-1.5 bg-card text-foreground border-border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-500/20"
          onClick={() => setOpen(true)}
        >
          {locked ? <Lock className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
          <span className="text-xs font-medium leading-tight text-center">Club Wi-Fi</span>
        </Button>
      ) : (
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
        className="p-4 cursor-pointer transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            {locked ? <Lock className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Club Wi-Fi</p>
            <p className="text-[13px] text-muted-foreground break-words">
              {locked
                ? `Tap to activate — ${format(Number(status?.monthly_fee || 0))} per month`
                : status?.charge_enabled && !status?.auto_renew
                  ? "Tap to view or reactivate"
                  : `${wifi?.ssid ?? "Tap to view"} · tap for password & QR`}
            </p>
          </div>
        </div>
      </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {locked ? <Lock className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
              Club Wi-Fi
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
            You're charged pro-rata for the days left this month, then {format(Number(status?.monthly_fee || 0))} on the
            1st of every month until you deactivate — no need to renew.
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
        <div className="space-y-1.5">
        <p className="text-[12px] font-medium">
          Wi-Fi password — tap the eye to reveal, then the copy icon to copy it
        </p>
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
        <p className="text-[12px] text-muted-foreground">
          Or tap <span className="font-medium">Scan</span> above to show the QR code and join with your phone camera — no typing needed.
        </p>
        </div>
      )}


      {!locked && wifi?.notes && (
        <p className="text-[12px] text-muted-foreground break-words">{wifi.notes}</p>
      )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

