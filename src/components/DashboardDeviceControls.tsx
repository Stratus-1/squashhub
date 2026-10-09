import { useEffect, useState } from "react";
import { resolveAge, checkAgeGate } from "@/lib/member-age";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { DoorOpen, Loader2, MapPin, Power, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useHasCapability } from "@/hooks/use-club-capabilities";
import { useClubDevices, useDeviceControl } from "@/hooks/use-club-devices";
import { useDoorControl, type DoorControl } from "@/hooks/use-door-control";
import { useClubSecrets } from "@/hooks/use-club-secrets";
import { useMemberContext } from "@/contexts/MemberContext";
import { pulseAccessDeviceBle } from "@/lib/shelly-door";
import { formatLatLngDM } from "@/lib/geo-format";
import { useGeofenceAutoUnlock } from "@/hooks/use-geofence-auto-unlock";
import { DoorCompatibilityCheck } from "@/components/DoorCompatibilityCheck";
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
export function DashboardDeviceControls({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { data: clubData } = useMyClub();
  const clubId = (clubData?.club as { id?: string } | undefined)?.id;

  const door = useDoorControl();
  const { data: devices } = useClubDevices(clubId);
  const courtLightsOn = useHasCapability("lights", clubId);

  const grouped = groupDevices((devices || []) as ClubDevice[]);
  // Dashboard actions are only for direct-access devices and staff gadgets.
  // Court lights are intentionally booking-driven so light fees stay billable.
  // "Show on dashboard" is the admin's switch for whether a configured device
  // gets a manual control here at all. RLS + can_operate_device enforce who may
  // actually use it; this only decides what we draw.
  const enabledIn = (c: DeviceCategory) =>
    grouped[c].filter((d) => d.enabled && d.show_on_dashboard !== false);


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

      <div className={compact ? "flex flex-wrap items-start gap-x-2 gap-y-2" : "space-y-3"}>
      {visibleGroups.map((group) => {
        const Icon = group.icon;
        const rows = group.slug === "lights"
          ? []
          : enabledIn(group.slug).filter((device) => {
              if (group.slug !== "access" || !door.available) return true;
              return !/^main\s+door$/i.test(device.name.trim());
            });
        return (
          <div key={group.slug} className={cn("space-y-1.5", compact && (group.slug === "lights" ? "order-last basis-full" : "contents"))}>
            <div className={cn("flex items-center gap-1.5", compact && group.slug !== "lights" && "sr-only")}>
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

            <div className={compact ? "contents" : "space-y-1.5"}>
              {group.slug === "access" && door.available && <DoorRow door={door} compact={compact} />}
              {rows.map((device) => (
                <DeviceRow key={device.id} device={device} clubId={clubId} compact={compact} />
              ))}
            </div>

            {group.slug === "lights" && courtLightsOn && (
              <p className="text-[11px] text-muted-foreground pl-0.5">
                Court lights switch on from your booking, so the per-hour light fee is billed
                correctly.
              </p>
            )}
          </div>
        );
      })}
      </div>
    </section>
  );
}

/** Main clubhouse door — geofence state, auto-unlock, admin remote override. */
function DoorRow({ door, compact }: { door: DoorControl; compact: boolean }) {
  const { proximity, nearDoor, adminOverride, loading, club } = door;

  if (compact) return (
    <CompactDeviceButton name="Main door" action="Open" busy={loading} icon={DoorOpen}
      onActivate={() => door.openDoor("manual")} />
  );

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
            : (club as any)?.door_auto_unlock_enabled && proximity.active
            ? "Unlock the clubhouse door · opens automatically when you arrive"
            : "Unlock the clubhouse door"}
        </p>
        <DoorCompatibilityCheck className="mt-1.5" />
        {proximity.active && (
          <>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 tabular-nums">
              GPS: {proximity.state}
              {proximity.distance != null && ` · ${Math.round(proximity.distance)} m from door`}
              {proximity.accuracy != null && ` · ±${Math.round(proximity.accuracy)} m accuracy`}
              {` · geofence ${club?.door_geofence_radius_m ?? 150} m`}
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
        onClick={() => door.openDoor("manual")}
        disabled={loading}
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
function DeviceRow({ device, clubId, compact }: { device: ClubDevice; clubId: string; compact: boolean }) {
  const control = useDeviceControl(clubId);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [bleBusy, setBleBusy] = useState(false);
  const [compactState, setCompactState] = useState<boolean | null>(null);
  const [compactUnavailable, setCompactUnavailable] = useState(false);
  const Icon = deviceIcon(device);
  const { data: clubSecrets } = useClubSecrets(clubId);
  const { activeMember } = useMemberContext();
  const d = device as any;

  const minAge = device.category === "access" ? Number(d.min_age) || null : null;

  /** Age-gate feedback: underage gets a plain refusal, unknown age a path to fix it. */
  const showAgeDenied = (code: string, message?: string) => {
    if (code === "age_unknown") {
      toast.error(
        message || "We don't have your age information yet. Please complete your ID/date-of-birth information in your profile to access this area.",
        { duration: 10000, action: { label: "Complete profile", onClick: () => window.location.assign("/profile") } },
      );
    } else {
      toast.error(message || `Access restricted. You must be ${minAge} or older to enter this area.`, { duration: 8000 });
    }
  };

  // The switch flips immediately so it feels responsive, but any fresh reading
  // from the relay wins — otherwise a device that reported a different state
  // (or was switched by someone else) would keep showing our guess.
  const serverReadingAt = device.last_state_at;
  useEffect(() => {
    setOptimistic(null);
    setCompactState(null);
    setCompactUnavailable(false);
  }, [serverReadingAt, device.last_state, device.last_error]);

  const isPulse = device.control_mode === "pulse";
  const state = (compact ? compactState : optimistic) ?? device.last_state ?? false;
  const behaviour = describeDeviceSchedule(device) ?? describeDeviceBehaviour(device);
  const busy = control.isPending || bleBusy;

  /**
   * Access relays get the same Bluetooth rescue as the main door: when the
   * club's internet (or the relay's Wi-Fi) is down, a member standing at the
   * door still opens it over BLE. Other categories deliberately don't — a
   * geyser can wait for the network.
   */
  /**
   * Bluetooth rescue for every access door and light: when the club's internet
   * (or the relay's Wi-Fi) is down, a member at the club still works the relay
   * over BLE. Only attempted after the internet path fails.
   */
  const bleCapable = device.category === "access" || device.category === "lights";
  const bleRescue = async (
    cloudError: string,
    trigger: "manual" | "geofence" = "manual",
    action: "on" | "off" | "pulse" = "pulse",
  ) => {
    const secrets: any = clubSecrets || {};
    if (!bleCapable || !secrets.ble_fallback_enabled) {
      toast.error(cloudError);
      return false;
    }
    if (minAge) {
      const m: any = activeMember || {};
      const gate = checkAgeGate(minAge, resolveAge({ dob: m.date_of_birth ?? null, idNumbers: [m.id_number] }));
      if (!gate.allowed) {
        showAgeDenied((gate as { reason?: string }).reason === "underage" ? "age_restricted" : "age_unknown");
        return false;
      }
    }
    const autoOff = Number(d.auto_off_seconds) || 0;
    setBleBusy(true);
    try {
      await pulseAccessDeviceBle({
        clubId,
        doorName: device.name,
        clubMemberId: activeMember?.id ?? null,
        mac: d.ble_mac,
        shellyDeviceId: d.shelly_device_id,
        password: secrets.shelly_ble_control_password,
        channel: d.shelly_channel ?? 0,
        turn: action === "off" ? "off" : "on",
        pulseMs:
          action === "off" ? 0
          : action === "on" ? (autoOff > 0 ? autoOff * 1000 : 0)
          : trigger === "geofence"
            ? Math.min(120, Math.max(1, Number(d.auto_unlock_seconds ?? 12))) * 1000
            : d.pulse_ms ?? 3000,
        cloudError,
      });
      if (action !== "pulse") {
        if (compact) { setCompactState(action === "on"); setCompactUnavailable(false); }
        else setOptimistic(action === "on");
      }
      toast.success(
        action === "pulse"
          ? `${device.name} opened over Bluetooth (club internet is down)`
          : `${device.name} switched ${action} over Bluetooth (club internet is down)`,
      );
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : cloudError);
      return false;
    } finally {
      setBleBusy(false);
    }
  };

  const run = async (action: "on" | "off" | "pulse", trigger: "manual" | "geofence" = "manual") => {
    if (action !== "pulse" && !compact) setOptimistic(action === "on");
    try {
      const res = await control.mutateAsync({ deviceId: device.id, action, trigger });
      if (action === "pulse") {
        if (res && res.ok === false) {
          return await bleRescue(`${device.name} is offline.`, trigger);
        }
        toast.success(
          trigger === "geofence"
            ? `You've arrived — ${device.name} unlocked automatically`
            : `${device.name} triggered`,
        );
      } else {
        if (compact) {
          if (res?.ok === false || res?.online === false) {
            if (bleCapable) return await bleRescue(`${device.name} is unavailable.`, trigger, action);
            setCompactUnavailable(true);
            toast.error(`${device.name} is unavailable.`);
            return false;
          }
          setCompactState(typeof res?.state === "boolean" ? res.state : null);
        }
        toast.success(
          `${device.name} switched ${action}${
            action === "on" && res?.auto_off_seconds
              ? ` — off again in ${Math.round(res.auto_off_seconds / 60)} min`
              : ""
          }`,
        );
      }
      return true;
    } catch (e) {
      setOptimistic(null);
      const msg = e instanceof Error ? e.message : `Could not switch ${device.name}`;
      const code = (e as any)?.code;
      if (code === "age_restricted" || code === "age_unknown") {
        showAgeDenied(code, msg);
        return false;
      }
      if (bleCapable) {
        return await bleRescue(msg, trigger, action);
      }
      toast.error(msg);
      return false;
    }
  };

  // Geofence auto-unlock for access devices. The manual Open button below is
  // unaffected — it stays available per the member's access permissions.
  const autoOn =
    device.category === "access" &&
    isPulse &&
    device.enabled !== false &&
    !!device.geofence_enabled &&
    !!device.auto_unlock_enabled &&
    device.geofence_latitude != null &&
    device.geofence_longitude != null;
  const hasFence =
    device.category === "access" &&
    !!device.geofence_enabled &&
    device.geofence_latitude != null &&
    device.geofence_longitude != null;
  const nearOnly = hasFence && !!(device as any).button_near_door_only;
  const isAdmin = useIsClubAdmin();
  const proximity = useGeofenceAutoUnlock({
    id: `device-${device.id}`,
    enabled: autoOn,
    watch: nearOnly,
    fence: {
      enabled: hasFence,
      latitude: device.geofence_latitude ?? null,
      longitude: device.geofence_longitude ?? null,
      radiusM: device.geofence_radius_m ?? 50,
    },
    onEnter: async () => { await run("pulse", "geofence"); },
  });
  if (nearOnly && !isAdmin && proximity.active && !proximity.allowed) return null;

  if (compact) {
    const action = isPulse ? (device.category === "access" ? "Open" : "Trigger") : state ? "Turn Off" : "Turn On";
    return <CompactDeviceButton name={device.name} action={action} busy={busy} icon={Icon}
      error={device.last_error || (compactUnavailable ? "Unavailable" : null)} isOn={isPulse ? undefined : state}
      onActivate={() => run(isPulse ? "pulse" : state ? "off" : "on")} />;
  }

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

/**
 * Mobile-only manual entry point; automatic and desktop commands stay unchanged.
 *
 * Compact smart-home style control: a round push/toggle button on top with the
 * device name directly below, so several controls sit side by side and wrap.
 * Stateful devices colour the button by real state (green = on, red = off,
 * grey = unreachable); momentary devices flash green briefly on success and
 * then return to rest — a door is never "on".
 */
function CompactDeviceButton({ name, action, busy, icon: Icon, error, isOn, onActivate }: {
  name: string; action: string; busy: boolean; icon: typeof DoorOpen;
  error?: string | null; isOn?: boolean; onActivate: () => Promise<void | boolean>;
}) {
  const [pressing, setPressing] = useState(false);
  const [justSucceeded, setJustSucceeded] = useState(false);
  const isToggle = typeof isOn === "boolean";
  const unavailable = !!error;

  const handleActivate = async () => {
    if (pressing || busy || unavailable) return;
    setPressing(true);
    try {
    const succeeded = await onActivate();
    if (!isToggle && succeeded === true) {
      setJustSucceeded(true);
      window.setTimeout(() => setJustSucceeded(false), 2500);
    }
    } finally { setPressing(false); }
  };

  const buttonClass = unavailable
    ? "border-border bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground"
    : isToggle
      ? isOn
        ? "border-win bg-win/15 text-win hover:bg-win/15 hover:text-win"
        : "border-destructive bg-destructive/15 text-destructive hover:bg-destructive/15 hover:text-destructive"
      : justSucceeded
        ? "border-win bg-win/15 text-win hover:bg-win/15 hover:text-win"
        : "border-primary/50 bg-primary/5 text-primary hover:bg-primary/5 hover:text-primary";

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5" data-device-control>
      <Button
        type="button"
        variant="outline"
        disabled={busy || pressing || unavailable}
        onClick={() => { void handleActivate(); }}
        aria-label={`${name}: ${unavailable ? "Unavailable" : action}`}
        aria-busy={busy || pressing}
        aria-pressed={isToggle ? isOn : undefined}
        title={`${name}: ${unavailable ? "Unavailable" : action}`}
        className={cn(
          "member-device-push flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 p-0",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-100",
          buttonClass,
        )}
      >
        {busy || pressing ? <Loader2 className="h-5 w-5 animate-spin" /> : isToggle ? <Power className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </Button>
      <span className="w-full text-center text-[11px] font-medium leading-tight text-foreground">
        {name}
      </span>
      {unavailable && <span className="text-center text-[10px] leading-tight text-muted-foreground">Unavailable</span>}
    </div>
  );
}
