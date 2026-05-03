import { useState, useEffect } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const RELAY_DEVICES = [
  { value: "shelly", label: "Shelly", description: "Shelly Cloud smart relays — fully supported" },
  { value: "magnet", label: "Magnet", description: "Magnetic contactor / relay switch" },
  { value: "sonoff", label: "Sonoff", description: "Sonoff eWeLink smart switches" },
  { value: "tasmota", label: "Tasmota", description: "Tasmota-flashed devices (ESP-based)" },
  { value: "home_assistant", label: "Home Assistant", description: "HA hub with relay automations" },
  { value: "other", label: "Other", description: "Contact SquashHub for integration assistance" },
] as const;

type RelayDevice = typeof RELAY_DEVICES[number]["value"];

export function CourtsTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

  const [rulesForm, setRulesForm] = useState({
    booking_slot_minutes: club.booking_slot_minutes ?? 30,
    peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
    peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
    peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
    peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
    max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
  });

  useEffect(() => {
    setRulesForm({
      booking_slot_minutes: club.booking_slot_minutes ?? 30,
      peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
      peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
      peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
      peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
      max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
    });
  }, [club.id, club.booking_slot_minutes, club.peak_weekday_start, club.peak_weekday_end, club.peak_weekend_start, club.peak_weekend_end, club.max_peak_bookings_per_day]);

  const handleSaveRules = async () => {
    try {
      await updateClub.mutateAsync({
        id: club.id,
        booking_slot_minutes: rulesForm.booking_slot_minutes,
        peak_weekday_start: rulesForm.peak_weekday_start,
        peak_weekday_end: rulesForm.peak_weekday_end,
        peak_weekend_start: rulesForm.peak_weekend_start,
        peak_weekend_end: rulesForm.peak_weekend_end,
        max_peak_bookings_per_day: rulesForm.max_peak_bookings_per_day,
      } as any);
      toast.success("Booking rules saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const [lightsForm, setLightsForm] = useState({
    lights_integration_enabled: club.lights_integration_enabled ?? false,
    light_fee_per_hour: club.light_fee_per_hour ?? 0,
    shelly_auth_key: "",
    relay_device_type: "shelly" as RelayDevice,
  });

  useEffect(() => {
    setLightsForm(p => ({
      ...p,
      lights_integration_enabled: club.lights_integration_enabled ?? false,
      light_fee_per_hour: club.light_fee_per_hour ?? 0,
    }));
  }, [club.id, club.lights_integration_enabled, club.light_fee_per_hour]);

  useEffect(() => {
    if (secrets) {
      setLightsForm(p => ({
        ...p,
        shelly_auth_key: secrets.shelly_auth_key || "",
        relay_device_type: (secrets as any).relay_device_type || "shelly",
      }));
    }
  }, [secrets]);

  const handleSaveLights = async () => {
    try {
      await updateClub.mutateAsync({
        id: club.id,
        lights_integration_enabled: lightsForm.lights_integration_enabled,
        light_fee_per_hour: lightsForm.lights_integration_enabled ? lightsForm.light_fee_per_hour : 0,
      } as any);
      if (lightsForm.lights_integration_enabled) {
        await updateSecrets.mutateAsync({
          club_id: clubId,
          shelly_auth_key: lightsForm.relay_device_type === "shelly" ? (lightsForm.shelly_auth_key || null) : null,
          relay_device_type: lightsForm.relay_device_type,
        } as any);
      }
      toast.success("Court light settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const selectedDevice = RELAY_DEVICES.find(d => d.value === lightsForm.relay_device_type);
  const isSupported = lightsForm.relay_device_type === "shelly";
  const isOther = lightsForm.relay_device_type === "other";
  const isUnsupported = !isSupported && !isOther;
  const lightsEnabled = lightsForm.lights_integration_enabled;

  return (
    <div className="space-y-4 mt-4">
      <CourtsSection clubId={clubId} relayDeviceType={lightsForm.relay_device_type} lightsEnabled={lightsEnabled} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Booking Rules */}
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-sm">Booking Rules</h3>
            <p className="text-xs text-muted-foreground">Slot length and peak-hour limits.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Booking slot length</Label>
            <Select
              value={String(rulesForm.booking_slot_minutes)}
              onValueChange={(v) => setRulesForm(p => ({ ...p, booking_slot_minutes: parseInt(v, 10) }))}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Allow 30-minute slots</SelectItem>
                <SelectItem value="60">Full hours only (60 min)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 rounded-lg border p-2">
              <Label className="text-[11px] font-semibold">Weekday peak (Mon–Fri)</Label>
              <div className="flex items-center gap-1">
                <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekday_start}
                  onChange={e => setRulesForm(p => ({ ...p, peak_weekday_start: e.target.value }))} />
                <span className="text-[10px] text-muted-foreground">to</span>
                <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekday_end}
                  onChange={e => setRulesForm(p => ({ ...p, peak_weekday_end: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1 rounded-lg border p-2">
              <Label className="text-[11px] font-semibold">Weekend peak (Sat–Sun)</Label>
              <div className="flex items-center gap-1">
                <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekend_start}
                  onChange={e => setRulesForm(p => ({ ...p, peak_weekend_start: e.target.value }))} />
                <span className="text-[10px] text-muted-foreground">to</span>
                <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekend_end}
                  onChange={e => setRulesForm(p => ({ ...p, peak_weekend_end: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Max peak-hour bookings per member, per day</Label>
            <Input
              type="number" min={1} max={10} step={1}
              className="h-8 text-xs w-32"
              value={rulesForm.max_peak_bookings_per_day}
              onChange={e => setRulesForm(p => ({ ...p, max_peak_bookings_per_day: Math.max(1, parseInt(e.target.value) || 1) }))}
            />
          </div>

          <Button size="sm" onClick={handleSaveRules} disabled={updateClub.isPending}>
            {updateClub.isPending ? "Saving..." : "Save Booking Rules"}
          </Button>
        </Card>

        {/* Court Lights */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Court Lights</h3>
              <p className="text-xs text-muted-foreground">
                {lightsEnabled ? "Smart relay integration enabled." : "No light integration — booking dialog will not show light controls."}
              </p>
            </div>
            <Switch
              checked={lightsEnabled}
              onCheckedChange={(checked) => setLightsForm(p => ({ ...p, lights_integration_enabled: checked }))}
            />
          </div>

          {lightsEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Relay Device Type</Label>
                  <Select
                    value={lightsForm.relay_device_type}
                    onValueChange={(v: RelayDevice) => setLightsForm(p => ({ ...p, relay_device_type: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELAY_DEVICES.map(d => (
                        <SelectItem key={d.value} value={d.value}>
                          <span className="flex items-center gap-2">
                            {d.label}
                            {d.value === "shelly" && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Supported</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Charge light fees</Label>
                    <Switch
                      checked={lightsForm.light_fee_per_hour > 0}
                      onCheckedChange={(checked) =>
                        setLightsForm(p => ({ ...p, light_fee_per_hour: checked ? 30 : 0 }))
                      }
                    />
                  </div>
                  {lightsForm.light_fee_per_hour > 0 && (
                    <Input
                      type="number" min={1} step={1}
                      className="h-8 text-xs"
                      value={lightsForm.light_fee_per_hour}
                      onChange={e => setLightsForm(p => ({ ...p, light_fee_per_hour: parseInt(e.target.value) || 0 }))}
                      placeholder="Fee per hour (R)"
                    />
                  )}
                </div>
              </div>

              {isSupported && (
                <div className="space-y-1">
                  <Label className="text-xs">Shelly Cloud Auth Key</Label>
                  <Input
                    type="password"
                    className="h-8 text-xs"
                    value={lightsForm.shelly_auth_key}
                    onChange={e => setLightsForm(p => ({ ...p, shelly_auth_key: e.target.value }))}
                    placeholder="Paste your Shelly Cloud auth key"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Find in <a href="https://control.shelly.cloud" target="_blank" rel="noopener noreferrer" className="underline text-primary">Shelly Cloud</a> → Settings → Authorization Cloud Key.
                  </p>
                </div>
              )}

              {isUnsupported && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground">
                    {selectedDevice?.label} integration coming soon. Contact <a href="mailto:support@squashhub.co.za" className="underline text-primary">support</a>.
                  </p>
                </div>
              )}

              {isOther && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground">
                    Custom integration — contact <a href="mailto:support@squashhub.co.za" className="underline text-primary">support</a>.
                  </p>
                </div>
              )}
            </>
          )}

          <Button size="sm" onClick={handleSaveLights} disabled={updateClub.isPending}>
            {updateClub.isPending ? "Saving..." : "Save Light Settings"}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function CourtsSection({ clubId, relayDeviceType, lightsEnabled }: { clubId: string; relayDeviceType: RelayDevice; lightsEnabled: boolean }) {
  const qc = useQueryClient();
  const [newCourt, setNewCourt] = useState("");
  const [editingRelay, setEditingRelay] = useState<Record<number, string>>({});

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId).order("name");
      if (error) throw error;
      return data as { id: number; name: string; club_id: string; relay_device_id: string | null; relay_server: string | null }[];
    },
  });

  const handleAdd = async () => {
    if (!newCourt.trim()) return;
    const { error } = await fromExt("courts").insert({ name: newCourt.trim(), club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Court added"); setNewCourt(""); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this court?")) return;
    const { error } = await fromExt("courts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Court removed"); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleSaveRelay = async (courtId: number) => {
    const deviceId = editingRelay[courtId] ?? "";
    const { error } = await fromExt("courts").update({ relay_device_id: deviceId || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success("Relay device saved");
      setEditingRelay(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <h3 className="font-semibold text-sm">Courts ({courts.length})</h3>
      {lightsEnabled && (
        <p className="text-[11px] text-muted-foreground">
          💡 To enable automatic court lights, add the relay device ID for each court.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {courts.map(c => {
          const courtId = c.id;
          const relayValue = editingRelay[courtId] ?? c.relay_device_id ?? "";
          return (
            <div key={c.id} className="rounded-lg border p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{c.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              {lightsEnabled && (
                <div className="flex gap-1 items-center">
                  <Input
                    value={relayValue}
                    onChange={e => setEditingRelay(prev => ({ ...prev, [courtId]: e.target.value }))}
                    placeholder={relayDeviceType === "shelly" ? "Shelly Device ID" : "Relay Device ID"}
                    className="flex-1 text-xs h-7"
                  />
                  {editingRelay[courtId] !== undefined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleSaveRelay(courtId)}>
                      Save
                    </Button>
                  )}
                </div>
              )}
              {lightsEnabled && c.relay_device_id && editingRelay[courtId] === undefined && (
                <p className="text-[10px] text-muted-foreground">✅ Relay configured</p>
              )}
            </div>
          );
        })}
        {courts.length === 0 && !isLoading && <p className="text-xs text-muted-foreground col-span-2">No courts added yet</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newCourt} onChange={e => setNewCourt(e.target.value)} placeholder="e.g. Court 1" className="flex-1 h-8 text-xs" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
    </Card>
  );
}
