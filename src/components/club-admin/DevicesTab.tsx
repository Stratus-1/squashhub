import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Eye, LayoutGrid, Loader2, Pencil, Plus, ShieldCheck, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShellyDoorSetup } from "@/components/club-admin/ShellyDoorSetup";
import { ShellyLightsSetup } from "@/components/club-admin/ShellyLightsSetup";
import {
  DEVICE_CATEGORY_LIST,
  DEVICE_CATEGORY_META,
  DEVICE_ICONS,
  type ClubDevice,
  type DeviceCategory,
  deviceIcon,
  describeDeviceBehaviour,
  groupDevices,
} from "@/lib/devices";
import {
  useClubDevices,
  useDeleteDevice,
  useDeviceControl,
  useSaveDevice,
} from "@/hooks/use-club-devices";

type DeviceForm = {
  id?: string;
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
};

const emptyForm = (category: DeviceCategory): DeviceForm => ({
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
});

const toForm = (d: ClubDevice): DeviceForm => ({
  id: d.id,
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
});

const ADD_OPTIONS: Array<{ category: DeviceCategory; title: string; description: string }> = [
  {
    category: "lights",
    title: "Add a light",
    description: "Clubhouse, outside or parking lights controlled from a relay.",
  },
  {
    category: "access",
    title: "Add access",
    description: "Secondary doors, gates and turnstiles.",
  },
  {
    category: "gadgets",
    title: "Add a gadget",
    description: "Geysers, pumps, heaters, signage and other equipment.",
  },
];

const CATEGORY_THUMBNAIL_BG: Record<DeviceCategory, string> = {
  lights: "from-amber-500/30 via-amber-400/20 to-transparent",
  access: "from-emerald-500/30 via-emerald-400/20 to-transparent",
  gadgets: "from-sky-500/30 via-sky-400/20 to-transparent",
};

/**
 * Admin surface for the club device registry.
 *
 * Devices are added under the group a member would look for them in, and each
 * group's own description explains what belongs there — so a club doesn't file
 * its geyser under Lights just because it happens to be on a light circuit.
 */
export function DevicesTab({ clubId }: { clubId: string }) {
  const { data: devices, isLoading } = useClubDevices(clubId);
  const save = useSaveDevice();
  const del = useDeleteDevice(clubId);
  const control = useDeviceControl(clubId);

  const [form, setForm] = useState<DeviceForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClubDevice | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<ClubDevice | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const grouped = useMemo(() => groupDevices((devices || []) as ClubDevice[]), [devices]);

  const set = <K extends keyof DeviceForm>(key: K, value: DeviceForm[K]) =>
    setForm((p) => (p ? { ...p, [key]: value } : p));

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

    try {
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
    }
  };

  const handleTest = async (device: ClubDevice) => {
    setTesting(device.id);
    try {
      const res = await control.mutateAsync({
        deviceId: device.id,
        action: device.control_mode === "pulse" ? "pulse" : "status",
      });
      toast.success(
        device.control_mode === "pulse"
          ? `${device.name} pulsed`
          : `${device.name} is ${res?.online === false ? "offline" : res?.state ? "on" : "off"}`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Test failed");
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> IoT / Shelly Connections
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Shelly relays, gates, geysers, pumps, lights and other switched devices. The main
                clubhouse door stays under <strong>Door Access</strong>, and court lights stay under{" "}
                <strong>Courts &amp; Bookings</strong> because those flows carry booking and access rules.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setAddPickerOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ShellyDoorSetup clubId={clubId} />
        <ShellyLightsSetup clubId={clubId} />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading devices…
        </div>
      )}

      {DEVICE_CATEGORY_LIST.map((group) => {
        const Icon = group.icon;
        const rows = grouped[group.slug];
        return (
          <Card key={group.slug}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", group.accent)} />
                    {group.label}
                    {group.restricted && (
                      <Badge variant="outline" className="h-5 gap-1 text-[10px] font-normal">
                        <ShieldCheck className="w-3 h-3" /> Admin & staff only
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{group.emptyHint}</p>
              ) : (
                rows.map((device) => {
                  const DeviceIcon = deviceIcon(device);
                  const behaviour = describeDeviceBehaviour(device);
                  return (
                    <div
                      key={device.id}
                      className="overflow-hidden rounded-xl border bg-card/80 shadow-sm"
                    >
                      <div className="grid grid-cols-[88px_1fr] gap-3 p-3">
                        <div
                          className={cn(
                            "relative flex h-20 w-20 items-center justify-center rounded-2xl border overflow-hidden",
                            "bg-gradient-to-br from-muted/80 to-muted/40",
                          )}
                        >
                          <div
                            className={cn(
                              "absolute inset-0 opacity-100 bg-gradient-to-br",
                              CATEGORY_THUMBNAIL_BG[device.category],
                            )}
                          />
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.35),transparent_60%)]" />
                          <div className="absolute inset-x-2 bottom-2 rounded-full bg-background/80 px-2 py-0.5 text-center text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                            {group.label}
                          </div>
                          <DeviceIcon className="relative z-10 h-8 w-8 text-foreground drop-shadow-sm" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                                {device.name}
                                {!device.enabled && (
                                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                    Hidden
                                  </Badge>
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                {[
                                  device.location,
                                  device.control_mode === "pulse" ? "Momentary" : "On / off",
                                  behaviour,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {device.shelly_device_id
                                  ? `Shelly ${device.shelly_device_id}:${device.shelly_channel}`
                                  : "Not linked"}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setSelectedDevice(device)}
                                aria-label={`View ${device.name}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => setForm(toForm(device))}
                                aria-label={`Edit ${device.name}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setConfirmDelete(device)}
                                aria-label={`Delete ${device.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 shrink-0"
                              disabled={testing === device.id || device.provider !== "shelly"}
                              onClick={() => handleTest(device)}
                            >
                              {testing === device.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Test"
                              )}
                            </Button>
                            {device.last_error && (
                              <p className="text-[11px] text-destructive truncate">
                                {device.last_error}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* ── Add / edit ─────────────────────────────────────────────── */}
      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {form && (
            <>
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit device" : "Add device"}</DialogTitle>
                <DialogDescription>
                  {DEVICE_CATEGORY_META[form.category].description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Group</Label>
                    <Select
                      value={form.category}
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
                    <Select value={form.icon} onValueChange={(v) => set("icon", v)}>
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
                    placeholder="Clubhouse geyser"
                    onChange={(e) => set("name", e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This is what appears on the dashboard — use the name members already say.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Location (optional)</Label>
                  <Input
                    value={form.location}
                    placeholder="Men's change room"
                    onChange={(e) => set("location", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>How it switches</Label>
                  <Select
                    value={form.control_mode}
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
                      : "Shown as a switch. Right for lights, geysers, pumps and heaters."}
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
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1.5">
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
                    <p className="col-span-3 text-[11px] text-muted-foreground">
                      Uses the club's existing Shelly auth key from Door Access — you don't enter it
                      again here.
                    </p>
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

                <div className="grid grid-cols-2 gap-3 items-end">
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
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  {form.id ? "Save changes" : "Add device"}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add device</DialogTitle>
            <DialogDescription>
              Pick the bucket that matches what you are wiring up.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {ADD_OPTIONS.map((option) => (
              <button
                key={option.category}
                type="button"
                className="rounded-xl border p-4 text-left hover:border-primary hover:bg-accent/30 transition-colors"
                onClick={() => {
                  setForm(emptyForm(option.category));
                  setAddPickerOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">{option.title}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedDevice} onOpenChange={(open) => !open && setSelectedDevice(null)}>
        <DialogContent className="max-w-xl">
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
                  {DEVICE_CATEGORY_META[selectedDevice.category].label} device details
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
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Group</p>
                      <p className="font-medium">{DEVICE_CATEGORY_META[selectedDevice.category].label}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Switching</p>
                      <p className="font-medium">
                        {selectedDevice.control_mode === "pulse" ? "Momentary" : "On / off"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Provider</p>
                      <p className="font-medium capitalize">{selectedDevice.provider}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium">{selectedDevice.enabled ? "Shown" : "Hidden"}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Behaviour</p>
                      <p className="font-medium">
                        {describeDeviceBehaviour(selectedDevice) ??
                          (selectedDevice.control_mode === "pulse" ? "Momentary" : "On / off")}
                      </p>
                    </div>
                    {selectedDevice.provider === "shelly" && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Shelly device</p>
                        <p className="font-medium">
                          {selectedDevice.shelly_device_id
                            ? `Device ${selectedDevice.shelly_device_id}, channel ${selectedDevice.shelly_channel}`
                            : "Not linked"}
                        </p>
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
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedDevice(null)}>
                  Close
                </Button>
                <Button onClick={() => setForm(toForm(selectedDevice))}>Edit device</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
