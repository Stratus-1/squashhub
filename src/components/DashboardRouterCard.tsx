import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Router, Wifi, WifiOff } from "lucide-react";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import {
import { useHasCapability } from "@/hooks/use-club-capabilities";
  computeUsage,
  formatData,
  useActiveBundle,
  useRouterConfig,
} from "@/hooks/use-router-monitor";

/**
 * Compact internet / data bundle widget. Only shown to club admins of clubs
 * that have router monitoring switched on.
 */
export function DashboardRouterCard() {
  const { data: clubData } = useMyClub();
  const clubId = (clubData?.club as { id?: string } | undefined)?.id;
  const isAdmin = useIsClubAdmin();
  const wifiOn = useHasCapability("wifi", clubId);
  const { data: config } = useRouterConfig(isAdmin && wifiOn ? clubId : undefined);
  const { data: bundle } = useActiveBundle(isAdmin && config?.enabled ? clubId : undefined);

  if (!isAdmin || !wifiOn || !config?.enabled) return null;

  const status = (config.last_status || {}) as Record<string, any>;
  const online = Boolean(status.online);
  const usage = computeUsage(bundle);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Router className="w-4 h-4 text-primary" /> Club internet
          </div>
          <Badge variant={online ? "default" : "destructive"} className="gap-1">
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
        </div>

        {usage ? (
          <>
            <Progress value={usage.percentUsed} />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{formatData(usage.usedMb)} used</span>
              <span>{formatData(usage.remainingMb)} left</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {usage.daysLeft != null
                ? `Roughly ${usage.daysLeft} day${usage.daysLeft === 1 ? "" : "s"} of data left`
                : "Estimating days left…"}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">No active data bundle captured yet.</p>
        )}

        <Link to="/club-admin?tab=router" className="text-[11px] text-primary hover:underline">
          Manage router &amp; bundle
        </Link>
      </CardContent>
    </Card>
  );
}
