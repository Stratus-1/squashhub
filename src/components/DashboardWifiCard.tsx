import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wifi, Copy, QrCode, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyClub } from "@/hooks/use-club";
import { QRCodeSVG } from "qrcode.react";

type ClubWifi = {
  ssid: string;
  password: string | null;
  security: string | null;
  hidden: boolean | null;
  notes: string | null;
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
 * when the club allows it) of that club — never exposed publicly.
 */
export function DashboardWifiCard() {
  const { data: clubData } = useMyClub();
  const clubId = (clubData?.club as { id?: string } | undefined)?.id;
  const [showPassword, setShowPassword] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const { data: wifi } = useQuery({
    enabled: !!clubId,
    queryKey: ["club-wifi", clubId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_club_wifi", { _club_id: clubId });
      if (error) throw error;
      return ((data as ClubWifi[]) || [])[0] ?? null;
    },
  });

  if (!wifi?.ssid) return null;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy — long-press to select instead");
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Wifi className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Club Wi-Fi</p>
          <p className="text-[13px] text-muted-foreground break-words">{wifi.ssid}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowQr(v => !v)}>
          <QrCode className="h-4 w-4 mr-1" />
          {showQr ? "Hide" : "Scan"}
        </Button>
      </div>

      {showQr && (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/40 p-4">
          <div className="rounded-md bg-white p-3">
            <QRCodeSVG value={buildWifiQrPayload(wifi)} size={168} />
          </div>
          <p className="text-[12px] text-muted-foreground text-center">
            Point your phone camera at this code to join automatically.
          </p>
        </div>
      )}

      {wifi.password && (
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

      {wifi.notes && (
        <p className="text-[12px] text-muted-foreground break-words">{wifi.notes}</p>
      )}
    </Card>
  );
}
