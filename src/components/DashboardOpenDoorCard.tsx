import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DoorOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyClub } from "@/hooks/use-club";
import { useClubSecrets } from "@/hooks/use-club-secrets";
import { useMemberContext } from "@/contexts/MemberContext";
import { triggerShellyDoor } from "@/lib/shelly-door";
import { markDoorOpened } from "@/lib/door-open-state";
import { useMyBookings } from "@/hooks/use-data";
import { useMemberAccessGate } from "@/hooks/use-member-access-gate";
import { format } from "date-fns";

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

/**
 * Always-visible "Open Door" tile for clubs whose access control fires
 * through SquashHub (Shelly relay or Fluss remote trigger). Independent of
 * the LiveSessionBanner prompt so members can open the door without an
 * active booking on screen.
 */
export function DashboardOpenDoorCard() {
  const { data: clubData } = useMyClub();
  const club = clubData?.club as { id?: string; visitors_access_control?: boolean } | undefined;
  const { data: clubSecrets } = useClubSecrets(club?.id);
  const { activeMember } = useMemberContext();
  const { data: myBookings } = useMyBookings();
  const gate = useMemberAccessGate();
  const [loading, setLoading] = useState(false);

  const accessType = (clubSecrets as any)?.access_control_type;
  const flussEnabled = accessType === "remote_trigger";
  const shellyEnabled = accessType === "shelly_relay";
  const doorEnabled = flussEnabled || shellyEnabled;
  const doorBlocked = gate.isBlocked("door");
  const isVisitorRole = String((activeMember as any)?.role || "").toLowerCase() === "visitor";
  const visitorBlocked = isVisitorRole && !club?.visitors_access_control;

  if (!club?.id || !doorEnabled || doorBlocked || visitorBlocked) return null;

  const handleOpenDoor = async () => {
    setLoading(true);
    try {
      if (shellyEnabled) {
        const s: any = clubSecrets || {};
        const res = await triggerShellyDoor({
          clubId: club.id!,
          doorName: "Main door",
          clubMemberId: activeMember?.id ?? null,
          ble: {
            enabled: !!s.ble_fallback_enabled,
            mac: s.shelly_door_ble_mac,
            password: s.shelly_ble_control_password,
            channel: s.shelly_door_channel,
            pulseMs: s.shelly_door_pulse_ms,
          },
        });
        toast.success(res.message || "Door opening… 🚪");
      } else {
        const resp = await supabase.functions.invoke("fluss-trigger", {
          body: { club_id: club.id },
        });
        if (resp.error) throw resp.error;
        toast.success("Door opening… 🚪");
      }
      // Mark opened so the LiveSessionBanner door prompt suppresses itself
      // when this member's booking window rolls around.
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const PRE_WINDOW_MS = 15 * 60 * 1000;
      const now = Date.now();
      const upcoming = ((myBookings || []) as any[]).find((b) => {
        if (b.status !== "active" || b.date !== todayStr) return false;
        const start = new Date(`${b.date}T${b.start_time}`).getTime();
        const end = new Date(`${b.date}T${b.end_time}`).getTime();
        return now >= start - PRE_WINDOW_MS && now <= end;
      });
      markDoorOpened(upcoming?.id ?? null);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to open door"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 mt-2">
      <Card className="p-3 flex items-center gap-3 border-primary/30 bg-primary/5">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 shrink-0">
          <DoorOpen className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Club Access</p>
          <p className="text-xs text-muted-foreground">
            Unlock the main door
          </p>
        </div>
        <Button size="sm" onClick={handleOpenDoor} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
          Open Door
        </Button>
      </Card>
    </div>
  );
}
