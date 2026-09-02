import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ChevronRight, CircleCheck, CircleDashed, Eye, Loader2, Pencil, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromExt } from "@/lib/supabase-ext";
import {
  DEVICE_CATEGORY_LIST,
  DEVICE_CATEGORY_META,
  DEVICE_ICONS,
  type ClubDevice,
  type DeviceCategory,
  deviceIcon,
  describeDeviceBehaviour,
} from "@/lib/devices";
import {
  useClubDevices,
  useDeleteDevice,
  useDeviceControl,
  useSaveDevice,
} from "@/hooks/use-club-devices";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { triggerShellyDoor } from "@/lib/shelly-door";

type DeviceSource = "registry" | "court" | "main-access";

type IoTDevice = ClubDevice & {
  source: DeviceSource;
  configured: boolean;
  court_id?: number;
  server_url?: string | null;
  auth_key?: string | null;
};

type CourtRow = {
  id: number;
  name: string;
  club_id: string;
  relay_device_id: string | null;
  relay_channel?: number | null;
  relay_ble_mac?: string | null;
  relay_server?: string | null;
};

type DeviceForm = {
  id?: string;
  source: DeviceSource;
  court_id?: number;
  category: DeviceCategory;
  name: string;
  icon: string;
  location: string;
  notes: string;
  enabled: boolean;
  control_mode: "toggle" | "pulse";
  provider: "shelly" | "other";
  shelly_device_id: string;
  shelly_channel: string;
  pulse_ms: string;
  ble_mac: string;
  auto_off_minutes: string;
  sort_order: string;
  server_url: string;
  auth_key: string;
};

const emptyForm = (category: DeviceCategory): DeviceForm => ({
  source: "registry",
  category,
  name: "",
  icon: "",
  location: "",
  notes: "",
  enabled: true,
  control_mode: DEVICE_CATEGORY_META[category].defaultControlMode,
  provider: "shelly",
  shelly_device_id: "",
  shelly_channel: "0",
  pulse_ms: "3000",
  ble_mac: "",
  auto_off_minutes: "",
  sort_order: "0",
  server_url: "",
  auth_key: "",
});

const toForm = (d: IoTDevice): DeviceForm => ({
  id: d.id,
  source: d.source,
  court_id: d.court_id,
  category: d.category,
  name: d.name,
  icon: d.icon || "",
  location: d.location || "",
  notes: d.notes || "",
  enabled: d.enabled,
  control_mode: d.control_mode,
  provider: d.provider,
  shelly_device_id: d.shelly_device_id || "",
  shelly_channel: String(d.shelly_channel ?? 0),
  pulse_ms: String(d.pulse_ms ?? 3000),
  ble_mac: d.ble_mac || "",
  auto_off_minutes: d.auto_off_minutes == null ? "" : String(d.auto_off_minutes),
  sort_order: String(d.sort_order ?? 0),
  server_url: d.server_url || "",
  auth_key: d.auth_key || "",
});

const ADD_OPTIONS: Array<{ category: DeviceCategory; title: string; description: string }> = [
  {
    category: "lights",
    title: "Set up court lights",
    description: "Configure the next court from the club's existing court list.",
  },
  {
    category: "access",
    title: "Add access device",
    description: "Add another door, gate or turnstile beyond the main entrance.",
  },
  {
    category: "gadgets",
    title: "Add a gadget",
    description: "Geysers, air conditioners, pumps, heaters, signage and other equipment.",
  },
];

const ADD_OPTION_STYLES: Record<DeviceCategory, { icon: string; surface: string; ring: string }> = {
  lights: {
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    surface: "hover:border-amber-400/70 hover:bg-amber-500/[0.06]",
    ring: "group-focus-visible:ring-amber-400/60",
  },
  access: {
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    surface: "hover:border-emerald-400/70 hover:bg-emerald-500/[0.06]",
    ring: "group-focus-visible:ring-emerald-400/60",
  },
  gadgets: {
    icon: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    surface: "hover:border-sky-400/70 hover:bg-sky-500/[0.06]",
    ring: "group-focus-visible:ring-sky-400/60",
  },
};

const CATEGORY_THUMBNAIL_BG: Record<DeviceCategory, string> = {
  lights: "from-amber-500/30 via-amber-400/20 to-transparent",
  access: "from-emerald-500/30 via-emerald-400/20 to-transparent",
  gadgets: "from-sky-500/30 via-sky-400/20 to-transparent",
};

/**
 * Admin surface for the club device registry.
 *
 * Devices are added under the group a member would look for them in.
 * Court lights are generated from the court list; access and gadgets are
 * managed alongside them without losing their separate operational meaning.
 */
export function DevicesTab({ clubId }: { clubId: string }) {
  const queryClient = useQueryClient();
  const { data: devices, isLoading, error: devicesError } = useClubDevices(clubId);
  const { data: secrets, isLoading: secretsLoading } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const { data: courts = [], isLoading: courtsLoading } = useQuery({
    queryKey: ["iot-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts")
        .select("id, name, club_id, relay_device_id, relay_channel, relay_ble_mac, relay_server")
        .eq("club_id", clubId)
        .eq("is_external", false)
        .order("name");
      if (error) throw error;
      return (data || []) as CourtRow[];
    },
    enabled: !!clubId,
  });
  const save = useSaveDevice();
  const del = useDeleteDevice(clubId);
  const control = useDeviceControl(clubId);

  const [form, setForm] = useState<DeviceForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IoTDevice | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<IoTDevice | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [mobileCategory, setMobileCategory] = useState<DeviceCategory>("lights");

  const allDevices = useMemo(() => {
    // Court lights belong to court records so bookings, billing and relay
    // automation always refer to the same source of truth.
    const doorId = secrets?.shelly_door_device_id || null;
    const registered = ((devices || []) as ClubDevice[])
      .filter((device) => device.category !== "lights")
      .filter((device) => !(doorId && device.category === "access" && device.shelly_device_id === doorId))
      .map((device): IoTDevice => ({
        ...device,
        source: "registry",
        configured: device.provider !== "shelly" || !!device.shelly_device_id,
        auth_key: secrets?.shelly_auth_key || null,
        server_url: secrets?.shelly_server_url || null,
      }));
    const infrastructure: IoTDevice[] = [];

    infrastructure.push({
        id: `legacy-door-${clubId}`,
        club_id: clubId,
        category: "access",
        name: "Main door",
        icon: "door",
        location: "Main entrance",
        notes: doorId
          ? "Main entrance Shelly relay."
          : "Set up the Shelly relay used for the club's main entrance.",
        enabled: true,
        sort_order: -100,
        control_mode: "pulse",
        provider: "shelly",
        shelly_device_id: doorId,
        shelly_channel: Number(secrets?.shelly_door_channel ?? 0),
        pulse_ms: Math.max(Number(secrets?.shelly_door_pulse_ms ?? 3000), 200),
        ble_mac: secrets?.shelly_door_ble_mac || null,
        auto_off_minutes: null,
        last_state: null,
        last_state_at: null,
        last_error: null,
        created_at: "",
        updated_at: "",
        source: "main-access",
        configured: !!doorId,
        server_url: secrets?.shelly_server_url || null,
        auth_key: secrets?.shelly_auth_key || null,
    });

    for (const court of courts) {
      const deviceId = court.relay_device_id;
      infrastructure.push({
        id: `legacy-court-light-${court.id}`,
        club_id: clubId,
        category: "lights",
        name: `${court.name} court lights`,
        icon: "lightbulb",
        location: court.name,
        notes: deviceId
          ? "Court light relay used by booking automation and light-fee billing."
          : `Shelly court-light relay still needs to be configured for ${court.name}.`,
        enabled: true,
        sort_order: court.id,
        control_mode: "toggle",
        provider: "shelly",
        shelly_device_id: deviceId,
        shelly_channel: Number(court.relay_channel ?? 0),
        pulse_ms: 3000,
        ble_mac: court.relay_ble_mac || null,
        auto_off_minutes: null,
        last_state: null,
        last_state_at: null,
        last_error: null,
        created_at: "",
        updated_at: "",
        source: "court",
        configured: !!deviceId,
        court_id: court.id,
        server_url: court.relay_server || null,
        auth_key: secrets?.shelly_auth_key || null,
      });
    }

    return [...infrastructure, ...registered];
  }, [clubId, courts, devices, secrets]);

  const grouped = useMemo(() => {
    const result: Record<DeviceCategory, IoTDevice[]> = { lights: [], access: [], gadgets: [] };
    for (const device of allDevices) result[device.category].push(device);
    for (const rows of Object.values(result)) {
      rows.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }
    return result;
  }, [allDevices]);

  const set = <K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) =>
    setForm((p) => (p ? { ...p, [key]: value } : p));

  const openEditor = (device: IoTDevice) => {
    setSelectedDevice(null);
    setForm(toForm(device));
  };

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error("Give the device a name members will recognise.");
      return;
    }
    if (form.provider === "shelly" && !form.shelly_device_id.trim()) {
      toast.error("A Shelly device needs its device ID, or SquashHub can't switch it.");
      return;
    }
    if (form.provider === "shelly" && !form.auth_key.trim()) {
      toast.error("Enter the club's Shelly Cloud auth key.");
      return;
    }
    const pulseMs = Number(form.pulse_ms);
    if (form.control_mode === "pulse" && (!Number.isFinite(pulseMs) || pulseMs < 200)) {
      toast.error("Pulse length must be at least 200 ms.");
      return;
    }
    const autoOff = form.auto_off_minutes.trim() === "" ? null : Number(form.auto_off_minutes);
    if (autoOff != null && (!Number.isFinite(autoOff) || autoOff < 1 || autoOff > 1440)) {
      toast.error("Auto-off must be between 1 and 1440 minutes.");
      return;
    }

    setSavingForm(true);
    try {
      if (form.source === "court") {
        if (!form.court_id) throw new Error("This court could not be identified.");
        if (form.auth_key.trim() !== (secrets?.shelly_auth_key || "")) {
          await updateSecrets.mutateAsync({
            club_id: clubId,
            shelly_auth_key: form.auth_key.trim(),
          });
        }
        const { error } = await fromExt("courts")
          .update({
            relay_device_id: form.shelly_device_id.trim(),
            relay_channel: Number(form.shelly_channel) || 0,
            relay_ble_mac: form.ble_mac.trim().toUpperCase() || null,
            relay_server: form.server_url.trim() || null,
          })
          .eq("id", form.court_id)
          .eq("club_id", clubId);
        if (error) throw error;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["iot-courts", clubId] }),
          queryClient.invalidateQueries({ queryKey: ["club-courts", clubId] }),
        ]);
        toast.success(`${form.name} setup saved`);
        setForm(null);
        return;
      }

      if (form.source === "main-access") {
        await updateSecrets.mutateAsync({
          club_id: clubId,
          shelly_auth_key: form.auth_key.trim(),
          shelly_door_device_id: form.shelly_device_id.trim(),
          shelly_door_channel: Number(form.shelly_channel) || 0,
          shelly_door_pulse_ms: Number.isFinite(pulseMs) ? pulseMs : 3000,
          shelly_door_ble_mac: form.ble_mac.trim().toUpperCase() || undefined,
          shelly_server_url: form.server_url.trim() || undefined,
        });
        toast.success("Main entrance setup saved");
        setForm(null);
        return;
      }

      if (
        form.provider === "shelly" &&
        (form.auth_key.trim() !== (secrets?.shelly_auth_key || "") ||
          form.server_url.trim() !== (secrets?.shelly_server_url || ""))
      ) {
        await updateSecrets.mutateAsync({
          club_id: clubId,
          shelly_auth_key: form.auth_key.trim(),
          shelly_server_url: form.server_url.trim() || undefined,
        });
      }

      await save.mutateAsync({
        id: form.id,
        club_id: clubId,
        category: form.category,
        name: form.name.trim(),
        icon: form.icon || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        enabled: form.enabled,
        control_mode: form.control_mode,
        provider: form.provider,
        shelly_device_id: form.shelly_device_id.trim() || null,
        shelly_channel: Number(form.shelly_channel) || 0,
        pulse_ms: Number.isFinite(pulseMs) ? pulseMs : 3000,
        ble_mac: form.ble_mac.trim() || null,
        auto_off_minutes: form.control_mode === "pulse" ? null : autoOff,
        sort_order: Number(form.sort_order) || 0,
      });
      toast.success(form.id ? "Device updated" : "Device added");
      setForm(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the device");
    } finally {
      setSavingForm(false);
    }
  };

  const handleTest = async (device: IoTDevice) => {
    setTesting(device.id);
    try {
      if (device.source === "main-access") {
        const result = await triggerShellyDoor({ clubId, doorName: "Admin test" });
        toast.success(result.message);
        return;
      }
      const res = await control.mutateAsync({
        deviceId: device.id,
        action: device.control_mode === "pulse" ? "pulse" : "status",
      });
      toast.success(
        device.control_mode === "pulse"
          ? `${device.name} pulsed`
          : `${device.name} is ${res?.online === false ? "offline" : res?.state === true ? "on" : res?.state === false ? "off" : "unknown"}`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Test failed");
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-3 md:mt-4 md:space-y-4">
      <Card className="border-0 shadow-none md:border md:shadow-sm">
        <CardHeader className="px-1 pb-2 pt-1 md:px-6 md:pb-3 md:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> IoT / Shelly Connections
              </CardTitle>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground md:text-sm">
                Configure one Shelly relay per court, manage club access, and add other connected
                equipment such as geysers, air conditioners and pumps.
              </p>
            </div>
            <Button
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-3"
              onClick={() => setAddPickerOpen(true)}
              aria-label="Add an IoT device"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
      </Card>

      {(isLoading || secretsLoading || courtsLoading) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading devices…
        </div>
      )}

      {devicesError && allDevices.length === 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-destructive">The IoT device registry could not be loaded.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Existing Shelly setup is still being checked from the legacy configuration. If this
              message remains, the database migration needs to be applied.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs
        value={mobileCategory}
        onValueChange={(value) => setMobileCategory(value as DeviceCategory)}
        className="md:hidden"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl p-1">
          {DEVICE_CATEGORY_LIST.map((group) => {
            const Icon = group.icon;
            return (
              <TabsTrigger key={group.slug} value={group.slug} className="gap-1.5 px-2 py-2 text-xs">
                <Icon className={cn("size-3.5", group.accent)} />
                <span className="truncate">{group.label}</span>
                <span className="text-[10px] text-muted-foreground">{grouped[group.slug].length}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="overflow-hidden rounded-xl border bg-card md:grid md:grid-cols-3 md:items-start md:gap-4 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent">
        {DEVICE_CATEGORY_LIST.map((group) => {
        const Icon = group.icon;
        const rows = grouped[group.slug];
        const configuredCount = rows.filter((device) => device.configured).length;
        return (
          <Card
            key={group.slug}
            className={cn(
              "h-full rounded-none border-0 shadow-none md:block md:rounded-xl md:border md:shadow-sm",
              mobileCategory !== group.slug && "hidden",
            )}
          >
            <CardHeader className="px-3 pb-2 pt-3 md:px-6 md:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", group.accent)} />
                    {group.label}
                    {group.restricted && (
                      <Badge variant="outline" className="hidden h-5 gap-1 text-[10px] font-normal sm:inline-flex">
                        <ShieldCheck className="w-3 h-3" /> Admin & staff only
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="mt-1 hidden text-xs text-muted-foreground md:block">{group.description}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {rows.length === 0 ? "No devices" : `${configuredCount}/${rows.length} set up`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 px-2 pb-3 md:space-y-3 md:px-6 md:pb-6">
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{group.emptyHint}</p>
              ) : (
                rows.map((device) => {
                  const DeviceIcon = deviceIcon(device);
                  const behaviour = describeDeviceBehaviour(device);
                  return (
                    <div
                      key={device.id}
                      className="relative overflow-hidden rounded-lg border-0 bg-card/80 md:rounded-xl md:border md:shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedDevice(device)}
                        className="absolute inset-0 z-10 md:hidden"
                        aria-label={`Open ${device.name}`}
                      />
                      <div className="grid min-h-14 grid-cols-[40px_minmax(0,1fr)_16px] items-center gap-2.5 px-1 py-1.5 md:grid-cols-[64px_1fr] md:items-start md:gap-3 md:p-3">
                        <button
                          type="button"
                          onClick={() => setSelectedDevice(device)}
                          aria-label={`View details for ${device.name}`}
                          title={`View ${device.name}`}
                          className={cn(
                            "relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border md:h-14 md:w-14 md:rounded-2xl",
                            "bg-gradient-to-br from-muted/80 to-muted/40",
                            "transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          )}
                        >
                          <div
                            className={cn(
                              "absolute inset-0 opacity-100 bg-gradient-to-br",
                              CATEGORY_THUMBNAIL_BG[device.category],
                            )}
                          />
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_60%)]" />
                          <div className="absolute inset-x-1 bottom-1 hidden rounded-full bg-background/80 px-1 py-0.5 text-center text-[8px] font-medium uppercase tracking-wide text-muted-foreground md:block">
                            {group.label}
                          </div>
                          <DeviceIcon className="relative z-10 h-5 w-5 text-foreground drop-shadow-sm md:h-7 md:w-7" />
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className="min-w-0 flex-1 truncate text-sm font-semibold">{device.name}</p>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "h-5 shrink-0 gap-1 px-1.5 text-[9px]",
                                    device.configured
                                      ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                                      : "border-amber-500/30 text-amber-700 dark:text-amber-400",
                                  )}
                                >
                                  {device.configured ? <CircleCheck className="size-3" /> : <CircleDashed className="size-3" />}
                                  {device.configured ? "Ready" : "Not set up"}
                                </Badge>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                {[
                                  device.location,
                                  device.control_mode === "pulse" ? "Momentary" : "On / off",
                                  behaviour,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              <p className="hidden text-[11px] text-muted-foreground md:block md:truncate">
                                {device.configured && device.shelly_device_id
                                  ? `Shelly ${device.shelly_device_id}:${device.shelly_channel}`
                                  : "Shelly relay details required"}
                              </p>
                            </div>

                            <div className="hidden shrink-0 items-center gap-1 sm:flex">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setSelectedDevice(device)}
                                aria-label={`View ${device.name}`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEditor(device)}
                                aria-label={`Edit ${device.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              {device.source === "registry" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() => setConfirmDelete(device)}
                                  aria-label={`Delete ${device.name}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 hidden items-center gap-2 md:flex">
                            {device.configured ? <Button
                              size="sm"
                              variant="outline"
                              className="h-8 shrink-0 gap-1.5 px-3"
                              disabled={testing === device.id || device.provider !== "shelly"}
                              onClick={() => handleTest(device)}
                            >
                              {testing === device.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Test"
                              )}
                            </Button> : (
                              <Button size="sm" onClick={() => openEditor(device)}>Set up</Button>
                            )}
                            {device.last_error && (
                              <p className="text-[11px] text-destructive truncate">
                                {device.last_error}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground md:hidden" />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
        })}
      </div>

      {/* ── Add / edit ─────────────────────────────────────────────── */}
      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-4 sm:p-6">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {form.source === "court"
                    ? `Set up ${form.name}`
                    : form.source === "main-access"
                      ? "Set up main entrance"
                      : form.id ? "Edit device" : "Add device"}
                </DialogTitle>
                <DialogDescription>
                  {form.source === "court"
                    ? "This relay stays linked to the court for booking automation and light-fee billing."
                    : DEVICE_CATEGORY_META[form.category].description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Group</Label>
                    <Select
                      value={form.category}
                      disabled={form.source !== "registry"}
                      onValueChange={(v) => {
                        const category = v as DeviceCategory;
                        setForm((p) =>
                          p
                            ? {
                                ...p,
                                category,
                                control_mode: p.id
                                  ? p.control_mode
                                  : DEVICE_CATEGORY_META[category].defaultControlMode,
                              }
                            : p,
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICE_CATEGORY_LIST.map((g) => (
                          <SelectItem key={g.slug} value={g.slug}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Icon</Label>
                    <Select value={form.icon} onValueChange={(v) => set("icon", v)} disabled={form.source !== "registry"}>
                      <SelectTrigger>
                        <SelectValue placeholder="Group default" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICE_ICONS.map((i) => (
                          <SelectItem key={i.value} value={i.value}>
                            <span className="flex items-center gap-2">
                              <i.icon className="w-3.5 h-3.5" />
                              {i.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    disabled={form.source !== "registry"}
                    placeholder="Clubhouse geyser"
                    onChange={(e) => set("name", e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {form.source === "court"
                      ? "Court names are managed under Courts & Bookings."
                      : form.source === "main-access"
                        ? "The primary entrance is created automatically for every club."
                        : "This is what appears on the dashboard — use the name members already say."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Location (optional)</Label>
                  <Input
                    value={form.location}
                    disabled={form.source !== "registry"}
                    placeholder="Men's change room"
                    onChange={(e) => set("location", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>How it switches</Label>
                  <Select
                    value={form.control_mode}
                    disabled={form.source !== "registry"}
                    onValueChange={(v) => set("control_mode", v as "toggle" | "pulse")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="toggle">
                        On / off — stays on until switched off
                      </SelectItem>
                      <SelectItem value="pulse">
                        Momentary — closes briefly, then releases
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {form.control_mode === "pulse"
                      ? "Shown as a button. Right for gates, door strikes and anything that self-closes."
                      : "Shown as a switch. Right for court lights and gadgets such as geysers, pumps and heaters."}
                  </p>
                </div>

                {form.control_mode === "pulse" ? (
                  <div className="space-y-1.5">
                    <Label>Pulse length (ms)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={200}
                      max={3600000}
                      step={100}
                      value={form.pulse_ms}
                      onChange={(e) => set("pulse_ms", e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Switch itself off after (minutes)</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1440}
                      placeholder="Leave blank to stay on until switched off"
                      value={form.auto_off_minutes}
                      onChange={(e) => set("auto_off_minutes", e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Set on a geyser. The relay counts down itself, so it still switches off if the
                      phone, the app or the network drops out.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Controlled by</Label>
                  <Select
                    value={form.provider}
                    onValueChange={(v) => set("provider", v as "shelly" | "other")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shelly">Shelly relay (via Shelly Cloud)</SelectItem>
                      <SelectItem value="other">Other / not connected yet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.provider === "shelly" ? (
                  <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label>Shelly Cloud auth key</Label>
                      <Input
                        type="password"
                        value={form.auth_key}
                        placeholder="Paste the club's Shelly Cloud auth key"
                        className="font-mono text-xs"
                        onChange={(e) => set("auth_key", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Shelly device ID</Label>
                      <Input
                        value={form.shelly_device_id}
                        placeholder="e8db84xxxxxx"
                        className="font-mono text-xs"
                        onChange={(e) => set("shelly_device_id", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Channel</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={form.shelly_channel}
                        onChange={(e) => set("shelly_channel", e.target.value)}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground sm:col-span-3">
                      Uses the club's Shelly Cloud auth key. The key is stored once and is never shown in device details.
                    </p>
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label>Server URL (optional)</Label>
                      <Input
                        value={form.server_url}
                        placeholder="https://shelly-44-eu.shelly.cloud"
                        className="font-mono text-xs"
                        onChange={(e) => set("server_url", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label>BLE MAC (optional)</Label>
                      <Input
                        value={form.ble_mac}
                        placeholder="AA:BB:CC:DD:EE:FF"
                        className="font-mono text-xs"
                        onChange={(e) => set("ble_mac", e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    The device is listed on the dashboard but can't be switched yet. SquashHub only
                    talks to Shelly relays at the moment.
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    placeholder="Breaker 4 in the DB board"
                    onChange={(e) => set("notes", e.target.value)}
                  />
                </div>

                {form.source === "registry" && <div className="grid items-end gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Order</Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={form.sort_order}
                      onChange={(e) => set("sort_order", e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <Label className="text-sm">Show on dashboard</Label>
                      <p className="text-[11px] text-muted-foreground">Hide without deleting</p>
                    </div>
                    <Switch
                      checked={form.enabled}
                      onCheckedChange={(v) => set("enabled", v)}
                    />
                  </div>
                </div>}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={savingForm}>
                  {savingForm && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {form.source === "registry"
                    ? (form.id ? "Save changes" : "Add device")
                    : "Save setup"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The device disappears from the dashboard and can no longer be switched from SquashHub.
              The relay itself is untouched. To take it off the dashboard temporarily, switch off
              "Show on dashboard" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!confirmDelete) return;
                try {
                  await del.mutateAsync(confirmDelete.id);
                  toast.success("Device removed");
                } catch (e: any) {
                  toast.error(e?.message || "Could not remove the device");
                } finally {
                  setConfirmDelete(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addPickerOpen} onOpenChange={setAddPickerOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Plus className="h-5 w-5" />
              </span>
              Add an IoT device
            </DialogTitle>
            <DialogDescription>
              Court-light slots come from the court list. Access and gadgets can be added as needed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 pt-2 sm:grid-cols-3 sm:gap-3">
            {ADD_OPTIONS.map((option) => {
              const Icon = DEVICE_CATEGORY_META[option.category].icon;
              return (
                <button
                key={option.category}
                type="button"
                className={cn(
                  "group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-muted/15 p-3 text-left transition-colors sm:block sm:min-h-40 sm:rounded-2xl sm:p-4",
                  "focus-visible:outline-none focus-visible:ring-2",
                  ADD_OPTION_STYLES[option.category].surface,
                  ADD_OPTION_STYLES[option.category].ring,
                )}
                onClick={() => {
                  if (option.category === "lights") {
                    const nextCourt = grouped.lights.find((device) => !device.configured);
                    if (!nextCourt) {
                      toast.info(
                        grouped.lights.length === 0
                          ? "Add the club's courts under Courts & Bookings first."
                          : "Every court light is already configured. Use Edit on a court to change it.",
                      );
                      setAddPickerOpen(false);
                      return;
                    }
                    openEditor(nextCourt);
                  } else {
                    setForm({
                      ...emptyForm(option.category),
                      auth_key: secrets?.shelly_auth_key || "",
                      server_url: secrets?.shelly_server_url || "",
                    });
                  }
                  setAddPickerOpen(false);
                }}
              >
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl sm:mb-5 sm:rounded-2xl",
                    ADD_OPTION_STYLES[option.category].icon,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{option.title}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground sm:mt-2 sm:line-clamp-none">{option.description}</p>
                </div>
                <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedDevice} onOpenChange={(open) => !open && setSelectedDevice(null)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto p-4 sm:p-6">
          {selectedDevice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = deviceIcon(selectedDevice);
                    return <Icon className="w-5 h-5 text-primary" />;
                  })()}
                  {selectedDevice.name}
                </DialogTitle>
                <DialogDescription>
                  {selectedDevice.source === "court"
                    ? "Court-linked Shelly relay details"
                    : selectedDevice.source === "main-access"
                      ? "Main entrance Shelly relay details"
                      : `${DEVICE_CATEGORY_META[selectedDevice.category].label} device details`}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <div
                  className={cn(
                    "flex items-center justify-center rounded-2xl border p-6",
                    "bg-gradient-to-br from-muted/80 to-muted/40",
                    "relative overflow-hidden",
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-100",
                      CATEGORY_THUMBNAIL_BG[selectedDevice.category],
                    )}
                  />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_60%)]" />
                  <div className="absolute inset-x-4 bottom-3 rounded-full bg-background/80 px-2 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {DEVICE_CATEGORY_META[selectedDevice.category].label}
                  </div>
                  {(() => {
                    const Icon = deviceIcon(selectedDevice);
                    return <Icon className="relative z-10 w-12 h-12 text-foreground drop-shadow-sm" />;
                  })()}
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">Group</p>
                      <p className="font-medium">{DEVICE_CATEGORY_META[selectedDevice.category].label}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">Switching</p>
                      <p className="font-medium">
                        {selectedDevice.control_mode === "pulse" ? "Momentary" : "On / off"}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">Provider</p>
                      <p className="font-medium capitalize">{selectedDevice.provider}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium">{selectedDevice.configured ? "Configured" : "Not set up"}</p>
                    </div>
                    <div className="col-span-2 rounded-xl border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">Managed from</p>
                      <p className="font-medium">
                        {selectedDevice.source === "court"
                          ? "Court configuration"
                          : selectedDevice.source === "main-access"
                            ? "Main entrance configuration"
                            : "IoT device registry"}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl border bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">Behaviour</p>
                      <p className="font-medium">
                        {describeDeviceBehaviour(selectedDevice) ??
                          (selectedDevice.control_mode === "pulse" ? "Momentary" : "On / off")}
                      </p>
                    </div>
                    {selectedDevice.provider === "shelly" && (
                      <div className="col-span-2 rounded-xl border bg-muted/25 p-3">
                        <p className="text-xs text-muted-foreground">Shelly device</p>
                        <p className="font-medium">
                          {selectedDevice.shelly_device_id
                            ? `Device ${selectedDevice.shelly_device_id}, channel ${selectedDevice.shelly_channel}`
                            : "Not linked"}
                        </p>
                      </div>
                    )}
                    {selectedDevice.server_url && (
                      <div className="col-span-2 rounded-xl border bg-muted/25 p-3">
                        <p className="text-xs text-muted-foreground">Shelly server</p>
                        <p className="break-all font-mono text-xs font-medium">{selectedDevice.server_url}</p>
                      </div>
                    )}
                    {selectedDevice.ble_mac && (
                      <div className="col-span-2 rounded-xl border bg-muted/25 p-3">
                        <p className="text-xs text-muted-foreground">BLE fallback MAC</p>
                        <p className="font-mono text-xs font-medium">{selectedDevice.ble_mac}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm">{selectedDevice.location || "Not set"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{selectedDevice.notes || "No notes added"}</p>
                  </div>
                  {selectedDevice.last_error && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Last error</p>
                      <p className="text-sm text-destructive whitespace-pre-wrap">
                        {selectedDevice.last_error}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-between">
                <div className="flex gap-2">
                  {selectedDevice.source === "registry" && (
                    <Button
                      variant="ghost"
                      className="flex-1 text-destructive hover:text-destructive sm:flex-none"
                      onClick={() => {
                        setSelectedDevice(null);
                        setConfirmDelete(selectedDevice);
                      }}
                    >
                      <Trash2 className="mr-1.5 size-4" /> Remove
                    </Button>
                  )}
                  {selectedDevice.configured && (
                    <Button
                      variant="outline"
                      className="flex-1 sm:flex-none"
                      disabled={testing === selectedDevice.id || selectedDevice.provider !== "shelly"}
                      onClick={() => handleTest(selectedDevice)}
                    >
                      {testing === selectedDevice.id && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                      Test
                    </Button>
                  )}
                </div>
                <div className="col-span-2 flex gap-2 sm:col-auto">
                  <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setSelectedDevice(null)}>
                    Close
                  </Button>
                  <Button className="flex-1 sm:flex-none" onClick={() => openEditor(selectedDevice)}>
                    {selectedDevice.configured ? "Edit setup" : "Set up device"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
