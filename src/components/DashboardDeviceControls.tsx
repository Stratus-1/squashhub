import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DoorOpen, Loader2, MapPin, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useMyClub } from "@/hooks/use-club";
import { useHasCapability } from "@/hooks/use-club-capabilities";
import { useClubDevices, useDeviceControl } from "@/hooks/use-club-devices";
import { useDoorControl, type DoorControl } from "@/hooks/use-door-control";
import { formatLatLngDM } from "@/lib/geo-format";
import {
  DEVICE_CATEGORY_LIST,
  DEVICE_CATEGORY_META,
  type ClubDevice,
  type DeviceCategory,
  describeDeviceSchedule,
  deviceIcon,
  describeDeviceBehaviour,
  groupDevices,
} from "@/lib/devices";

/**
 * "Club Controls" — the single place every switchable thing at the club is
 * rendered, grouped by what a member calls it: Court lights, Access, Gadgets.
 *
 * Before this existed the door was a standalone card under the tile grid, the
 * court lights only appeared inside a live booking banner, and mobile and
 * desktop drew the same devices in different orders. Both dashboards now
 * render this one component.
 */
export function DashboardDeviceControls({ className }: { className?: string }) {
  const { data: clubData } = useMyClub();
  const clubId = (clubData?.club as { id?: string } | undefined)?.id;

  const door = useDoorControl();
  const { data: devices } = useClubDevices(clubId);
  const courtLightsOn = useHasCapability("lights", clubId);

  const grouped = groupDevices((devices || []) as ClubDevice[]);
  // Dashboard actions are only for direct-access devices and staff gadgets.
  // Court lights are intentionally booking-driven so light fees stay billable.
  const enabledIn = (c: DeviceCategory) => grouped[c].filter((d) => d.enabled);

  const groupHasContent = (c: DeviceCategory) => {
    if (c === "lights") return courtLightsOn;
    if (enabledIn(c).length > 0) return true;
    if (c === "access") return door.available;
    return false;
  };

  const visibleGroups = DEVICE_CATEGORY_LIST.filter((g) => groupHasContent(g.slug));
  if (!clubId || visibleGroups.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)} aria-label="Club controls">
      <div className="flex items-center gap-1.5">
        <Zap className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold font-heading">Club Controls</h2>
      </div>

      {visibleGroups.map((group) => {
        const Icon = group.icon;
        const rows = group.slug === "lights"
          ? []
          : enabledIn(group.slug).filter((device) => {
              if (group.slug !== "access" || !door.available) return true;
              return !/^main\s+door$/i.test(device.name.trim());
            });
        return (
          <div key={group.slug} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Icon className={cn("w-3.5 h-3.5", group.accent)} />
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h3>
              {group.restricted && (
                <Badge variant="outline" className="h-4 px-1 text-[9px] gap-0.5 font-normal">
                  <ShieldCheck className="w-2.5 h-2.5" />
                  Staff
                </Badge>
              )}
            </div>

            {/* The main clubhouse door keeps its richer GPS presentation. */}
            {group.slug === "access" && door.available && <DoorRow door={door} />}

            {rows.map((device) => (
              <DeviceRow key={device.id} device={device} clubId={clubId} />
            ))}

            {group.slug === "lights" && courtLightsOn && (
              <p className="text-[11px] text-muted-foreground pl-0.5">
                Court lights switch on from your booking, so the per-hour light fee is billed
                correctly.
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Main clubhouse door — geofence state, auto-unlock, admin remote override. */
function DoorRow({ door }: { door: DoorControl }) {
  const { proximity, nearDoor, adminOverride, loading, club } = door;

  return (
    <Card className="p-3 flex items-center gap-3 border-primary/30 bg-primary/5">
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 shrink-0">
        {nearDoor ? (
          <DoorOpen className="w-5 h-5 text-primary" />
        ) : (
          <MapPin className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Main door</p>
        <p className="text-xs text-muted-foreground">
          {adminOverride
            ? "Remote unlock (admin) — you're not at the club"
            : nearDoor
            ? "Unlock the clubhouse door"
            : proximity.hint}
        </p>
        {proximity.active && (
          <>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">
              GPS: {proximity.state}
              {proximity.distance != null && ` · ${Math.round(proximity.distance)} m from door`}
              {proximity.accuracy != null && ` · ±${Math.round(proximity.accuracy)} m accuracy`}
              {` · radius ${club?.door_geofence_radius_m ?? 150} m · auto ${proximity.triggerRadiusM} m`}
            </p>
            {proximity.coords && (
              <p className="text-[11px] text-muted-foreground/80 tabular-nums">
                You: {formatLatLngDM(proximity.coords.lat, proximity.coords.lng)}
              </p>
            )}
            {club?.door_latitude != null && club?.door_longitude != null && (
              <p className="text-[11px] text-muted-foreground/80 tabular-nums">
                Door: {formatLatLngDM(club.door_latitude, club.door_longitude)}
              </p>
            )}
          </>
        )}
      </div>
      <Button
        size="sm"
        onClick={door.openDoor}
        disabled={loading || !nearDoor}
        variant={adminOverride ? "outline" : "default"}
        className="gap-1.5 shrink-0"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <DoorOpen className="w-3.5 h-3.5" />
        )}
        Open
      </Button>
    </Card>
  );
}

/**
 * One registry device.
 *
 * The control matches what the relay actually does: a `toggle` device gets a
 * switch (it stays on until switched off), a `pulse` device gets a button
 * (it closes the relay momentarily). Using a switch for a pulse device would
 * show an "on" state that isn't real a second later.
 */
function DeviceRow({ device, clubId }: { device: ClubDevice; clubId: string }) {
  const control = useDeviceControl(clubId);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const Icon = deviceIcon(device);

  // The switch flips immediately so it feels responsive, but any fresh reading
  // from the relay wins — otherwise a device that reported a different state
  // (or was switched by someone else) would keep showing our guess.
  const serverReadingAt = device.last_state_at;
  useEffect(() => {
    setOptimistic(null);
  }, [serverReadingAt]);

  const isPulse = device.control_mode === "pulse";
  const state = optimistic ?? device.last_state ?? false;
  const behaviour = describeDeviceSchedule(device) ?? describeDeviceBehaviour(device);
  const busy = control.isPending;

  const run = async (action: "on" | "off" | "pulse") => {
    if (action !== "pulse") setOptimistic(action === "on");
    try {
      const res = await control.mutateAsync({ deviceId: device.id, action });
      if (action === "pulse") {
        toast.success(`${device.name} triggered`);
      } else {
        toast.success(
          `${device.name} switched ${action}${
            action === "on" && res?.auto_off_seconds
              ? ` — off again in ${Math.round(res.auto_off_seconds / 60)} min`
              : ""
          }`,
        );
      }
    } catch (e) {
      setOptimistic(null);
      toast.error(e instanceof Error ? e.message : `Could not switch ${device.name}`);
    }
  };

  return (
    <Card className="p-3 flex items-center gap-3">
      <div
        className={cn(
          "flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors",
          !isPulse && state ? "bg-amber-500/20" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "w-4 h-4",
            !isPulse && state
              ? "text-amber-600 dark:text-amber-400"
              : DEVICE_CATEGORY_META[device.category].accent,
          )}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{device.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {[device.location, behaviour].filter(Boolean).join(" · ") || " "}
        </p>
        {device.last_error ? (
          <p className="text-[11px] text-destructive truncate">{device.last_error}</p>
        ) : (
          !isPulse &&
          device.last_state_at && (
            <p className="text-[11px] text-muted-foreground/70">
              {state ? "On" : "Off"} · updated{" "}
              {formatDistanceToNow(new Date(device.last_state_at), { addSuffix: true })}
            </p>
          )
        )}
      </div>

      {isPulse ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 shrink-0"
          disabled={busy}
          onClick={() => run("pulse")}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {device.category === "access" ? "Open" : "Trigger"}
        </Button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={state}
            disabled={busy}
            aria-label={`Switch ${device.name} ${state ? "off" : "on"}`}
            onCheckedChange={(next) => run(next ? "on" : "off")}
          />
        </div>
      )}
    </Card>
  );
}
