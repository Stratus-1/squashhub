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
import { Plus, Trash2, AlertCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClubCurrency } from "@/hooks/use-currency";

const RELAY_DEVICES = [
  { value: "shelly", label: "Shelly", description: "Shelly Cloud smart relays — fully supported" },
  { value: "magnet", label: "Magnet", description: "Magnetic contactor / relay switch" },
  { value: "sonoff", label: "Sonoff", description: "Sonoff eWeLink smart switches" },
  { value: "tasmota", label: "Tasmota", description: "Tasmota-flashed devices (ESP-based)" },
  { value: "home_assistant", label: "Home Assistant", description: "HA hub with relay automations" },
  { value: "other", label: "Other", description: "Contact SquashHub for integration assistance" },
] as const;

type RelayDevice = typeof RELAY_DEVICES[number]["value"];

function normalizeShellyServerInput(value: string) {
  const raw = value.trim();
  const urlMatch = raw.match(/https?:\/\/[^\s]+/i);
  const extracted = (urlMatch?.[0] || raw)
    .replace(/^server\s*:\s*/i, "")
    .replace(/\/+$/, "");
  return /^https?:\/\//i.test(extracted) ? extracted : "";
}

export function CourtsTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const { symbol: currencySymbol } = useClubCurrency();

  const [rulesForm, setRulesForm] = useState({
    booking_slot_minutes: club.booking_slot_minutes ?? 30,
    peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
    peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
    peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
    peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
    max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
    max_bookings_per_day: (club as any).max_bookings_per_day ?? 4,
    max_member_events_per_month: (club as any).max_member_events_per_month ?? 2,
  });

  useEffect(() => {
    setRulesForm({
      booking_slot_minutes: club.booking_slot_minutes ?? 30,
      peak_weekday_start: (club.peak_weekday_start ?? "16:00:00").slice(0, 5),
      peak_weekday_end: (club.peak_weekday_end ?? "19:00:00").slice(0, 5),
      peak_weekend_start: (club.peak_weekend_start ?? "08:00:00").slice(0, 5),
      peak_weekend_end: (club.peak_weekend_end ?? "12:00:00").slice(0, 5),
      max_peak_bookings_per_day: club.max_peak_bookings_per_day ?? 1,
      max_bookings_per_day: (club as any).max_bookings_per_day ?? 4,
      max_member_events_per_month: (club as any).max_member_events_per_month ?? 2,
    });
  }, [club.id, club.booking_slot_minutes, club.peak_weekday_start, club.peak_weekday_end, club.peak_weekend_start, club.peak_weekend_end, club.max_peak_bookings_per_day, (club as any).max_bookings_per_day, (club as any).max_member_events_per_month]);

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
        max_bookings_per_day: rulesForm.max_bookings_per_day,
        max_member_events_per_month: rulesForm.max_member_events_per_month,
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
    min_booking_balance: ((club as any).min_booking_balance ?? null) as number | null,
  });

  useEffect(() => {
    setLightsForm(p => ({
      ...p,
      lights_integration_enabled: club.lights_integration_enabled ?? false,
      light_fee_per_hour: club.light_fee_per_hour ?? 0,
      min_booking_balance: ((club as any).min_booking_balance ?? null) as number | null,
    }));
  }, [club.id, club.lights_integration_enabled, club.light_fee_per_hour, (club as any).min_booking_balance]);

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

      <ExternalTournamentCourtsSection clubId={clubId} />

      <ExternalBookingSection club={club} clubId={clubId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Booking Rules */}
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="font-semibold text-sm">Booking Rules</h3>
            <p className="text-xs text-muted-foreground">Control slot length, peak hours, and how many courts each member can book per day.</p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">1. Slot length</Label>
            <div className="flex items-center gap-2">
              <Select
                value={String(rulesForm.booking_slot_minutes)}
                onValueChange={(v) => setRulesForm(p => ({ ...p, booking_slot_minutes: parseInt(v, 10) }))}
              >
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30-minute slots</SelectItem>
                  <SelectItem value="40">40-minute slots (starts 07:00)</SelectItem>
                  <SelectItem value="60">60-minute slots (full hours)</SelectItem>
                </SelectContent>
              </Select>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-primary/30 bg-primary/5 text-primary text-[11px] font-medium hover:bg-primary/10 transition-colors cursor-help"
                    >
                      <Info className="w-3.5 h-3.5" />
                      Tips
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="start" className="max-w-sm text-xs leading-relaxed p-3">
                    <p className="font-semibold mb-1">Choosing a slot length</p>
                    <p>30- and 60-minute slots are the most flexible and recommended — they divide cleanly into match lengths and make scheduling tournaments, leagues and back-to-back fixtures far easier.</p>
                    <p className="mt-2">40-minute slots suit clubs whose existing booking culture is built around that rhythm, but they don't align with hourly tournament rounds.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>


          {/* 2. Daily caps */}
          <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">2. Per-member daily limits</Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Total bookings / day</Label>
                <Input
                  type="number" min={1} max={20} step={1}
                  className="h-8 text-xs"
                  value={rulesForm.max_bookings_per_day}
                  onChange={e => setRulesForm(p => ({ ...p, max_bookings_per_day: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
                <p className="text-[10px] text-muted-foreground">Across the whole day (peak + off-peak).</p>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Of those, max during peak</Label>
                <Input
                  type="number" min={1} max={10} step={1}
                  className="h-8 text-xs"
                  value={rulesForm.max_peak_bookings_per_day}
                  onChange={e => setRulesForm(p => ({ ...p, max_peak_bookings_per_day: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
                <p className="text-[10px] text-muted-foreground">Limit during peak hours only.</p>
              </div>
            </div>
          </div>

          {/* 3. Peak hours */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">3. Peak hours</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1 rounded-lg border p-2">
                <Label className="text-[11px] font-semibold">Weekday (Mon–Fri)</Label>
                <div className="flex items-center gap-1">
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekday_start}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekday_start: e.target.value }))} />
                  <span className="text-[10px] text-muted-foreground">to</span>
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekday_end}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekday_end: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1 rounded-lg border p-2">
                <Label className="text-[11px] font-semibold">Weekend (Sat–Sun)</Label>
                <div className="flex items-center gap-1">
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekend_start}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekend_start: e.target.value }))} />
                  <span className="text-[10px] text-muted-foreground">to</span>
                  <Input type="time" className="h-8 text-xs" value={rulesForm.peak_weekend_end}
                    onChange={e => setRulesForm(p => ({ ...p, peak_weekend_end: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Member-created events */}
          <div className="space-y-1 rounded-lg border p-3 bg-muted/30">
            <Label className="text-xs font-semibold">4. Member-created events / sessions</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={50} step={1}
                className="h-8 text-xs w-24"
                value={rulesForm.max_member_events_per_month}
                onChange={e => setRulesForm(p => ({ ...p, max_member_events_per_month: Math.max(0, parseInt(e.target.value) || 0) }))}
              />
              <span className="text-[11px] text-muted-foreground">events per member, per calendar month</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Set to 0 to block members from creating events (admins are always exempt).</p>
          </div>

          <Button size="sm" onClick={handleSaveRules} disabled={updateClub.isPending}>
            {updateClub.isPending ? "Saving..." : "Save Booking Rules"}
          </Button>
        </Card>

        {/* Minimum booking balance — independent of lights */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Minimum balance required to book a court</h3>
              <p className="text-xs text-muted-foreground">
                {lightsForm.min_booking_balance !== null
                  ? "Members need at least this credit on their account before booking."
                  : "Disabled — any active member can book regardless of account balance."}
              </p>
            </div>
            <Switch
              checked={lightsForm.min_booking_balance !== null}
              onCheckedChange={(checked) =>
                setLightsForm(p => ({
                  ...p,
                  min_booking_balance: checked ? (p.light_fee_per_hour || 20) : null,
                }))
              }
            />
          </div>

          {lightsForm.min_booking_balance !== null && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{currencySymbol}</span>
                <Input
                  type="number" min={0} step={1}
                  className="h-8 text-xs w-28"
                  value={lightsForm.min_booking_balance}
                  onChange={e => setLightsForm(p => ({ ...p, min_booking_balance: Math.max(0, parseFloat(e.target.value) || 0) }))}
                />
                <span className="text-[11px] text-muted-foreground">credit required</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Members on an arranged monthly payment plan are allowed to carry their plan's outstanding
                balance as debt (plus this buffer). If short, they're prompted to top up before the booking
                is confirmed.
              </p>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await updateClub.mutateAsync({ id: club.id, min_booking_balance: lightsForm.min_booking_balance } as any);
                    toast.success("Minimum balance saved");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to save");
                  }
                }}
                disabled={updateClub.isPending}
              >
                Save Minimum Balance
              </Button>
            </>
          )}
          {lightsForm.min_booking_balance === null && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await updateClub.mutateAsync({ id: club.id, min_booking_balance: null } as any);
                  toast.success("Minimum balance disabled");
                } catch (err: any) {
                  toast.error(err.message || "Failed to save");
                }
              }}
              disabled={updateClub.isPending}
            >
              Save
            </Button>
          )}
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
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{currencySymbol}</span>
                      <Input
                        type="number" min={1} step={1}
                        className="h-8 text-xs"
                        value={lightsForm.light_fee_per_hour}
                        onChange={e => setLightsForm(p => ({ ...p, light_fee_per_hour: parseInt(e.target.value) || 0 }))}
                        placeholder="Fee"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">per hour</span>
                    </div>
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
  const [editingChannel, setEditingChannel] = useState<Record<number, string>>({});
  const [editingServer, setEditingServer] = useState<Record<number, string>>({});

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId).eq("is_external", false).order("name");
      if (error) throw error;
      return data as { id: number; name: string; club_id: string; relay_device_id: string | null; relay_server: string | null; relay_channel?: number | null }[];
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

  const handleSaveRelay = async (courtId: number, valueOverride?: string) => {
    const deviceId = (valueOverride ?? editingRelay[courtId] ?? "").trim();
    const { error } = await fromExt("courts").update({ relay_device_id: deviceId || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success(deviceId ? `Relay saved: ${deviceId}` : "Relay cleared");
      setEditingRelay(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  const handleSaveChannel = async (courtId: number, valueOverride?: string) => {
    const channel = Math.max(0, Math.min(3, parseInt((valueOverride ?? editingChannel[courtId] ?? "0").trim(), 10) || 0));
    const { error } = await fromExt("courts").update({ relay_channel: channel }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Relay output saved: ${channel}`);
      setEditingChannel(prev => { const next = { ...prev }; delete next[courtId]; return next; });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  const handleSaveServer = async (courtId: number, valueOverride?: string) => {
    const server = normalizeShellyServerInput(valueOverride ?? editingServer[courtId] ?? "");
    const { error } = await fromExt("courts").update({ relay_server: server || null }).eq("id", courtId);
    if (error) toast.error(error.message);
    else {
      toast.success(server ? `Shelly server saved: ${server}` : "Shelly server reset");
      setEditingServer(prev => { const next = { ...prev }; delete next[courtId]; return next; });
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
          const channelValue = editingChannel[courtId] ?? String(c.relay_channel ?? 0);
          const serverValue = editingServer[courtId] ?? c.relay_server ?? "https://shelly-44-eu.shelly.cloud";
          return (
            <div key={c.id} className="rounded-lg border p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{c.name}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
              {lightsEnabled && (
                <div className="grid grid-cols-[1fr_76px_auto] gap-1 items-center">
                  <Input
                    value={relayValue}
                    onChange={e => setEditingRelay(prev => ({ ...prev, [courtId]: e.target.value }))}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (editingRelay[courtId] !== undefined && v !== (c.relay_device_id ?? "")) {
                        handleSaveRelay(courtId, v);
                      }
                    }}
                    placeholder={relayDeviceType === "shelly" ? "Shelly Device ID (e.g. e8db84xxxxxx)" : "Relay Device ID"}
                    className="flex-1 text-xs h-7 font-mono"
                  />
                  <Input
                    type="number"
                    min={0}
                    max={3}
                    value={channelValue}
                    onChange={e => setEditingChannel(prev => ({ ...prev, [courtId]: e.target.value }))}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (editingChannel[courtId] !== undefined && parseInt(v, 10) !== (c.relay_channel ?? 0)) {
                        handleSaveChannel(courtId, v);
                      }
                    }}
                    aria-label="Relay output channel"
                    title="Shelly output channel: use 0 for SW1/O1 and 1 for SW2/O2"
                    className="h-7 text-xs font-mono"
                  />
                  {editingRelay[courtId] !== undefined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleSaveRelay(courtId)}>
                      Save
                    </Button>
                  )}
                  {editingRelay[courtId] === undefined && editingChannel[courtId] !== undefined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleSaveChannel(courtId)}>
                      Save
                    </Button>
                  )}
                </div>
              )}
              {lightsEnabled && (
                <Input
                  value={serverValue}
                  onChange={e => setEditingServer(prev => ({ ...prev, [courtId]: e.target.value }))}
                  onBlur={e => {
                    const v = normalizeShellyServerInput(e.target.value);
                    if (editingServer[courtId] !== undefined && v !== (c.relay_server ?? "https://shelly-44-eu.shelly.cloud")) {
                      handleSaveServer(courtId, v);
                    }
                  }}
                  placeholder="Shelly Server URI"
                  aria-label="Shelly Server URI"
                  className="h-7 text-[11px] font-mono"
                />
              )}
              {lightsEnabled && (
                <Input
                  defaultValue={(c as any).relay_ble_mac ?? ""}
                  onBlur={async (e) => {
                    const v = e.target.value.trim().toUpperCase() || null;
                    if (v === ((c as any).relay_ble_mac ?? null)) return;
                    const { error } = await fromExt("courts").update({ relay_ble_mac: v }).eq("id", courtId);
                    if (error) toast.error(error.message);
                    else {
                      toast.success(v ? `BLE MAC saved: ${v}` : "BLE MAC cleared");
                      qc.invalidateQueries({ queryKey: ["club-courts"] });
                    }
                  }}
                  placeholder="BLE fallback MAC (e.g. AA:BB:CC:DD:EE:FF)"
                  aria-label="Court relay BLE MAC"
                  title="Bluetooth MAC of this court's Shelly relay — used as offline fallback"
                  className="h-7 text-[11px] font-mono"
                />
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

function ExternalTournamentCourtsSection({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [venueName, setVenueName] = useState("");
  const [courtName, setCourtName] = useState("");

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-external-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts")
        .select("id, name, venue_name")
        .eq("club_id", clubId)
        .eq("is_external", true)
        .order("venue_name")
        .order("name");
      if (error) throw error;
      return data as { id: number; name: string; venue_name: string | null }[];
    },
  });

  const handleAdd = async () => {
    const v = venueName.trim();
    const n = courtName.trim();
    if (!v || !n) {
      toast.error("Enter both a venue name and a court name");
      return;
    }
    const { error } = await fromExt("courts").insert({
      club_id: clubId,
      name: n,
      venue_name: v,
      is_external: true,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Added ${v} — ${n}`);
      setCourtName("");
      qc.invalidateQueries({ queryKey: ["club-external-courts"] });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  const handleDelete = async (id: number, label: string) => {
    if (!confirm(`Remove ${label}? This will not affect past tournaments already scheduled on it.`)) return;
    const { error } = await fromExt("courts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("External court removed");
      qc.invalidateQueries({ queryKey: ["club-external-courts"] });
      qc.invalidateQueries({ queryKey: ["club-courts"] });
    }
  };

  // Group by venue for display
  const grouped = courts.reduce<Record<string, typeof courts>>((acc, c) => {
    const key = c.venue_name || "Unnamed venue";
    (acc[key] ||= []).push(c);
    return acc;
  }, {});

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">External / Tournament Venues ({courts.length})</h3>
        <p className="text-[11px] text-muted-foreground">
          Extra courts at other venues that your tournaments can use (e.g. a partner club). They appear only in tournament court pickers — never in normal bookings, ladder or challenges.
        </p>
      </div>

      {Object.keys(grouped).length > 0 && (
        <div className="space-y-2">
          {Object.entries(grouped).map(([venue, list]) => (
            <div key={venue} className="rounded-lg border p-2">
              <div className="text-xs font-semibold text-foreground mb-1.5">{venue}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map((c) => (
                  <div key={c.id} className="flex items-center gap-1 rounded-md border bg-muted/40 pl-2 pr-1 py-0.5">
                    <span className="text-xs">{c.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive"
                      onClick={() => handleDelete(c.id, `${venue} — ${c.name}`)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {courts.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">No external courts yet. Add a venue and court below to make it selectable in your tournament wizard.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          value={venueName}
          onChange={e => setVenueName(e.target.value)}
          placeholder="Venue name (e.g. White River Country Club)"
          className="h-8 text-xs"
        />
        <Input
          value={courtName}
          onChange={e => setCourtName(e.target.value)}
          placeholder="Court name (e.g. Court 1)"
          className="h-8 text-xs"
          onKeyDown={e => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Tip: add each court at that venue as its own row (e.g. Court 1, Court 2, Court 3).</p>
    </Card>
  );
}

const EXTERNAL_PROVIDERS = [
  { value: "none", label: "None (use SquashHub bookings)" },
  { value: "gobook", label: "GoBook", placeholder: "https://gobook.co.za/yourclub" },
  { value: "courtmanager", label: "Court Manager (self-hosted)", placeholder: "http://yourclub.mywire.org/yourclub/index.php" },
  { value: "sportyhq", label: "SportyHQ", placeholder: "https://www.sportyhq.com/club/yourclub" },
  { value: "courtbookings", label: "CourtBookings.co.za", placeholder: "https://www.courtbookings.co.za/yourclub" },
  { value: "squashman", label: "SquashMan", placeholder: "https://www.squashman.com/yourclub" },
  { value: "other", label: "Other", placeholder: "https://your-booking-system.example.com" },
] as const;

type ProviderValue = typeof EXTERNAL_PROVIDERS[number]["value"];

function ExternalBookingSection({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();

  // Resolve initial provider: prefer new field, fall back to legacy uses_gobook
  const initialProvider: ProviderValue =
    ((club as any).external_booking_provider as ProviderValue | null) ||
    ((club as any).uses_gobook ? "gobook" : "none");
  const initialUrl: string =
    (club as any).external_booking_url ?? (club as any).gobook_url ?? "";
  const initialLabel: string = (club as any).external_booking_label ?? "";

  const [form, setForm] = useState({
    provider: initialProvider,
    url: initialUrl,
    label: initialLabel,
  });

  useEffect(() => {
    setForm({
      provider:
        ((club as any).external_booking_provider as ProviderValue | null) ||
        ((club as any).uses_gobook ? "gobook" : "none"),
      url: (club as any).external_booking_url ?? (club as any).gobook_url ?? "",
      label: (club as any).external_booking_label ?? "",
    });
  }, [
    club.id,
    (club as any).external_booking_provider,
    (club as any).external_booking_url,
    (club as any).external_booking_label,
    (club as any).uses_gobook,
    (club as any).gobook_url,
  ]);

  const enabled = form.provider !== "none";
  const selected = EXTERNAL_PROVIDERS.find((p) => p.value === form.provider);
  const placeholder = (selected as any)?.placeholder ?? "https://your-booking-system.example.com";

  const handleSave = async () => {
    if (enabled) {
      if (!form.url.trim()) {
        toast.error("Please enter your booking URL");
        return;
      }
      try { new URL(form.url.trim()); } catch {
        toast.error("Please enter a valid URL (including https://)");
        return;
      }
      if (form.provider === "other" && !form.label.trim()) {
        toast.error("Please enter a display name for your booking system");
        return;
      }
    }

    const labelMap: Record<ProviderValue, string> = {
      none: "",
      gobook: "GoBook",
      courtmanager: "Court Manager",
      sportyhq: "SportyHQ",
      courtbookings: "CourtBookings.co.za",
      squashman: "SquashMan",
      other: form.label.trim(),
    };

    try {
      await updateClub.mutateAsync({
        id: clubId,
        external_booking_provider: enabled ? form.provider : null,
        external_booking_url: enabled ? form.url.trim() : null,
        external_booking_label: enabled ? labelMap[form.provider] : null,
        // Keep legacy fields in sync so older code paths still work
        uses_gobook: form.provider === "gobook",
        gobook_url: form.provider === "gobook" ? form.url.trim() : null,
      } as any);
      toast.success("External booking settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">External Booking System</h3>
        <p className="text-xs text-muted-foreground">
          If your club already uses a third-party court booking website (GoBook, Court Manager, etc.), select it here. Members tapping a court slot will be sent there to book using their existing credentials.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select
            value={form.provider}
            onValueChange={(v: ProviderValue) => setForm((p) => ({ ...p, provider: v }))}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXTERNAL_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {enabled && (
          <div className="space-y-1">
            <Label className="text-xs">Your club's booking URL</Label>
            <Input
              type="url"
              className="h-8 text-xs"
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder={placeholder}
            />
          </div>
        )}
      </div>

      {enabled && form.provider === "other" && (
        <div className="space-y-1">
          <Label className="text-xs">Display name</Label>
          <Input
            className="h-8 text-xs"
            value={form.label}
            onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            placeholder="e.g. CourtSide Bookings"
          />
        </div>
      )}

      {enabled && form.provider === "gobook" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Your club uses{" "}
              <a href="https://www.gobook.co.za" target="_blank" rel="noopener noreferrer" className="underline text-primary font-medium">GoBook</a>{" "}
              for court bookings. SquashHub syncs with GoBook so members can book courts here.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Members must first register directly on{" "}
              <a href="https://www.gobook.co.za" target="_blank" rel="noopener noreferrer" className="underline text-primary font-medium">GoBook</a>{" "}
              and then go to <strong>My Account</strong> on this app to save their GoBook credentials. Once linked, they can make bookings through SquashHub.
            </p>
          </div>
        </div>
      )}

      {enabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground">
            Bookings made on the external system won't appear inside SquashHub until that provider gives us API access. Members will record match results manually as usual.
          </p>
        </div>
      )}

      <Button size="sm" onClick={handleSave} disabled={updateClub.isPending}>
        {updateClub.isPending ? "Saving..." : "Save Booking System"}
      </Button>
    </Card>
  );
}
