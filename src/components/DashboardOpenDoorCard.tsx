import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DoorOpen, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useClubSecrets } from "@/hooks/use-club-secrets";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useMemberContext } from "@/contexts/MemberContext";
import { triggerShellyDoor } from "@/lib/shelly-door";
import {
  markDoorOpened,
  autoUnlockFired,
  markAutoUnlockFired,
  rearmAutoUnlock,
} from "@/lib/door-open-state";

import { useMyBookings } from "@/hooks/use-data";
import { useMemberAccessGate } from "@/hooks/use-member-access-gate";
import { useDoorProximity } from "@/hooks/use-door-proximity";
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
  const club = clubData?.club as {
    id?: string;
    visitors_access_control?: boolean;
    door_geofence_enabled?: boolean;
    door_latitude?: number | null;
    door_longitude?: number | null;
    door_geofence_radius_m?: number | null;
    door_auto_unlock_radius_m?: number | null;
  } | undefined;
  const { data: clubSecrets } = useClubSecrets(club?.id);
  const { data: accessPublic } = useQuery({
    enabled: !!club?.id,
    queryKey: ["club-access-public", club?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await fromExt("club_access_public")
        .select("*")
        .eq("club_id", club!.id!)
        .maybeSingle();
      return data as any;
    },
  });
  const { activeMember } = useMemberContext();
  const { data: myBookings } = useMyBookings();
  const gate = useMemberAccessGate();
  const isClubAdmin = useIsClubAdmin();
  const [loading, setLoading] = useState(false);

  // GPS geofence — members must be near the door; admins/staff can override.
  const proximity = useDoorProximity({
    enabled: !!club?.door_geofence_enabled,
    latitude: club?.door_latitude ?? null,
    longitude: club?.door_longitude ?? null,
    radiusM: club?.door_geofence_radius_m ?? 150,
    triggerRadiusM: club?.door_auto_unlock_radius_m ?? 5,
  });
  const nearDoor = proximity.allowed || isClubAdmin;

  const merged: any = { ...(accessPublic || {}), ...(clubSecrets || {}) };
  const accessType = merged.access_control_type;
  const flussEnabled = accessType === "remote_trigger";
  const shellyEnabled = accessType === "shelly_relay";
  const doorEnabled = flussEnabled || shellyEnabled;
  const doorBlocked = gate.isBlocked("door");
  const isVisitorRole = String((activeMember as any)?.role || "").toLowerCase() === "visitor";
  const visitorBlocked = isVisitorRole && !club?.visitors_access_control;

  // ---- Auto-unlock at the door ------------------------------------------
  // The outer ring only arms the tile. The door pulses automatically once the
  // member reaches the tight inner ring (default 5 m, right at the Shelly),
  // and re-arms only after they've clearly left the outer ring (or 30 min).
  const autoEnabled =
    !!(club as any)?.door_auto_unlock_enabled &&
    !!club?.door_geofence_enabled &&
    doorEnabled &&
    !doorBlocked &&
    !visitorBlocked;
  const openRef = useRef<null | (() => Promise<void>)>(null);
  const radiusM = club?.door_geofence_radius_m ?? 150;

  useEffect(() => {
    if (!autoEnabled || !club?.id) return;
    if (proximity.atDoor) {
      if (autoUnlockFired(club.id, 30 * 60 * 1000)) return;
      markAutoUnlockFired(club.id);
      void openRef.current?.();
    } else if (
      proximity.state === "outside" &&
      proximity.distance != null &&
      proximity.distance > radiusM + 40
    ) {
      rearmAutoUnlock(club.id);
    }
  }, [autoEnabled, club?.id, proximity.atDoor, proximity.state, proximity.distance, radiusM]);

  if (!club?.id || !doorEnabled || doorBlocked || visitorBlocked) return null;

  // Geofenced clubs: only surface the tile once the member is actually at the
  // door (admins/staff keep remote access). Hides while locating / far away.
  if (proximity.active && !nearDoor) return null;


  const handleOpenDoor = async () => {
    setLoading(true);
    try {
      if (shellyEnabled) {
        const s: any = merged;
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

  // Keep the auto-unlock effect pointed at the latest handler.
  openRef.current = async () => {
    try {
      await handleOpenDoor();
    } finally {
      // handleOpenDoor toasts its own errors; nothing extra to do.
    }
  };

  const adminOverride = !proximity.allowed && isClubAdmin && proximity.active;


  return (
    <div className="px-4 mt-2">
      <Card className="p-3 flex items-center gap-3 border-primary/30 bg-primary/5">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 shrink-0">
          {nearDoor ? (
            <DoorOpen className="w-5 h-5 text-primary" />
          ) : (
            <MapPin className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Club Access</p>
          <p className="text-xs text-muted-foreground">
            {adminOverride
              ? "Remote unlock (admin) — you're not at the club"
              : nearDoor
              ? "Unlock the main door"
              : proximity.hint}
          </p>
          {proximity.active && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">
              GPS: {proximity.state}
              {proximity.distance != null && ` · ${Math.round(proximity.distance)} m from door`}
              {proximity.accuracy != null && ` · ±${Math.round(proximity.accuracy)} m accuracy`}
              {` · radius ${club?.door_geofence_radius_m ?? 150} m · auto ${proximity.triggerRadiusM} m`}
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={handleOpenDoor}
          disabled={loading || !nearDoor}
          variant={adminOverride ? "outline" : "default"}
          className="gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DoorOpen className="w-3.5 h-3.5" />}
          Open Door
        </Button>
      </Card>
    </div>
  );
}
