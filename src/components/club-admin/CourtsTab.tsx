import { useState, useEffect } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const RELAY_DEVICES = [
  { value: "shelly", label: "Shelly", description: "Shelly Cloud smart relays — fully supported" },
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

  const [lightsForm, setLightsForm] = useState({
    light_fee_per_hour: club.light_fee_per_hour ?? 0,
    shelly_auth_key: "",
    relay_device_type: "shelly" as RelayDevice,
  });

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
        light_fee_per_hour: lightsForm.light_fee_per_hour,
      });
      await updateSecrets.mutateAsync({
        club_id: clubId,
        shelly_auth_key: lightsForm.relay_device_type === "shelly" ? (lightsForm.shelly_auth_key || null) : null,
        relay_device_type: lightsForm.relay_device_type,
      } as any);
      toast.success("Court light settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const selectedDevice = RELAY_DEVICES.find(d => d.value === lightsForm.relay_device_type);
  const isSupported = lightsForm.relay_device_type === "shelly";
  const isOther = lightsForm.relay_device_type === "other";
  const isUnsupported = !isSupported && !isOther;

  return (
    <div className="space-y-6 mt-4">
      <CourtsSection clubId={clubId} relayDeviceType={lightsForm.relay_device_type} />

      {/* Court Lights */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Court Lights</h3>
        <p className="text-sm text-muted-foreground">Configure automatic court light control via smart relays.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Device type selector */}
          <div className="space-y-1">
            <Label>Relay Device Type</Label>
            <Select
              value={lightsForm.relay_device_type}
              onValueChange={(v: RelayDevice) => setLightsForm(p => ({ ...p, relay_device_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
            <p className="text-xs text-muted-foreground">{selectedDevice?.description}</p>
          </div>

          <div className="space-y-1">
            <Label>Light Fee per Hour (R)</Label>
            <Input
              type="number" min={0} step={0.01}
              value={lightsForm.light_fee_per_hour}
              onChange={e => setLightsForm(p => ({ ...p, light_fee_per_hour: parseInt(e.target.value) || 0 }))}
              placeholder="e.g. 50"
            />
            <p className="text-xs text-muted-foreground">
              {lightsForm.light_fee_per_hour > 0
                ? <>Members will be charged <span className="font-semibold text-foreground">R{lightsForm.light_fee_per_hour}</span>/hour.</>
                : "No fee — lights are free."}
            </p>
          </div>

          {/* Shelly-specific fields */}
          {isSupported && (
            <div className="space-y-1 md:col-span-2">
              <Label>Shelly Cloud Auth Key</Label>
              <Input
                type="password"
                value={lightsForm.shelly_auth_key}
                onChange={e => setLightsForm(p => ({ ...p, shelly_auth_key: e.target.value }))}
                placeholder="Paste your Shelly Cloud auth key"
              />
              <p className="text-xs text-muted-foreground">
                Find this in <a href="https://control.shelly.cloud" target="_blank" rel="noopener noreferrer" className="underline text-primary">Shelly Cloud</a> → Settings → Authorization Cloud Key.
              </p>
            </div>
          )}

          {/* Unsupported device notice */}
          {isUnsupported && (
            <div className="md:col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Coming Soon</p>
                <p className="text-xs text-muted-foreground">
                  {selectedDevice?.label} integration is on our roadmap. For now, you can still configure light fees and court details.
                  Contact <a href="mailto:support@squashhub.co.za" className="underline text-primary">support@squashhub.co.za</a> for early access or integration assistance.
                </p>
              </div>
            </div>
          )}

          {/* Other device notice */}
          {isOther && (
            <div className="md:col-span-2 rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Custom Integration</p>
                <p className="text-xs text-muted-foreground">
                  Using a different relay system? We can help integrate it. Contact us at{" "}
                  <a href="mailto:support@squashhub.co.za" className="underline text-primary">support@squashhub.co.za</a>{" "}
                  with your device details and we'll work with you to set it up.
                </p>
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleSaveLights} disabled={updateClub.isPending} className="w-full md:w-auto">
          {updateClub.isPending ? "Saving..." : "Save Light Settings"}
        </Button>
      </Card>
    </div>
  );
}

function CourtsSection({ clubId, relayDeviceType }: { clubId: string; relayDeviceType: RelayDevice }) {
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
    <Card className="p-6 space-y-4">
      <h3 className="font-semibold">Courts ({courts.length})</h3>
      <p className="text-xs text-muted-foreground">
        💡 To enable automatic court lights, add the relay device ID for each court.
      </p>
      <div className="space-y-3">
        {courts.map(c => {
          const courtId = c.id;
          const relayValue = editingRelay[courtId] ?? c.relay_device_id ?? "";
          return (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{c.name}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  value={relayValue}
                  onChange={e => setEditingRelay(prev => ({ ...prev, [courtId]: e.target.value }))}
                  placeholder={relayDeviceType === "shelly" ? "Shelly Device ID (e.g. 98cdac123456)" : "Relay Device ID"}
                  className="flex-1 text-xs h-8"
                />
                {editingRelay[courtId] !== undefined && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleSaveRelay(courtId)}>
                    Save
                  </Button>
                )}
              </div>
              {c.relay_device_id && editingRelay[courtId] === undefined && (
                <p className="text-[10px] text-muted-foreground">✅ Relay configured — lights will auto-switch</p>
              )}
            </div>
          );
        })}
        {courts.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No courts added yet</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newCourt} onChange={e => setNewCourt(e.target.value)} placeholder="e.g. Court 1" className="flex-1" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
    </Card>
  );
}
