import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useClubSecrets } from "@/hooks/use-club-secrets";
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
import { useHasCapability } from "@/hooks/use-club-capabilities";

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

export interface DoorControl {
  /** Whether the main-door control should be rendered at all. */
  available: boolean;
  /** Member is close enough (or is an admin overriding the geofence). */
  nearDoor: boolean;
  /** Admin is opening remotely, from outside the geofence. */
  adminOverride: boolean;
  loading: boolean;
  openDoor: () => Promise<void>;
  proximity: ReturnType<typeof useDoorProximity>;
  club:
    | {
        id?: string;
        door_geofence_radius_m?: number | null;
        door_latitude?: number | null;
        door_longitude?: number | null;
      }
    | undefined;
}

/**
 * Everything the main clubhouse door needs: eligibility, GPS geofence,
 * auto-unlock and the actual pulse.
 *
 * Split out of the old DashboardOpenDoorCard so the grouped device section can
 * ask "is there a door to show?" before drawing the Access heading, without a
 * second component instance registering its own geolocation watcher.
 */
export function useDoorControl(): DoorControl {
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

  const accessOn = useHasCapability("access_control", club?.id);
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

  const configured =
    !!club?.id && accessOn && doorEnabled && !doorBlocked && !visitorBlocked;
  // Geofenced clubs only surface the control once the member is actually at
  // the door; admins and staff keep remote access.
  const available = configured && !(proximity.active && !nearDoor);

  const openDoor = async () => {
    if (!club?.id) return;
    setLoading(true);
    try {
      if (shellyEnabled) {
        const s: any = merged;
        const res = await triggerShellyDoor({
          clubId: club.id,
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

  // ---- Auto-unlock at the door ------------------------------------------
  // The outer ring only arms the control. The door pulses automatically once
  // the member reaches the tight inner ring (default 5 m, right at the
  // Shelly), and re-arms only after they've clearly left the outer ring.
  const autoEnabled = !!(club as any)?.door_auto_unlock_enabled && !!club?.door_geofence_enabled && configured;
  const openRef = useRef<null | (() => Promise<void>)>(null);
  openRef.current = openDoor;
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

  return {
    available,
    nearDoor,
    adminOverride: !proximity.allowed && isClubAdmin && proximity.active,
    loading,
    openDoor,
    proximity,
    club,
  };
}
