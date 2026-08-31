import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Bluetooth, DoorOpen, Wifi } from "lucide-react";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { triggerShellyDoor } from "@/lib/shelly-door";
import { isBleFallbackAvailable, pulseShellyBleAuto } from "@/lib/shelly-ble-auto";
import { isInBlockedIframe, describeBleError } from "@/lib/shelly-ble";

type ShellyDoorForm = {
  shelly_auth_key: string;
  shelly_server_url: string;
  shelly_door_device_id: string;
  shelly_door_channel: string;
  shelly_door_pulse_ms: string;
  ble_fallback_enabled: boolean;
  shelly_door_ble_mac: string;
  shelly_ble_control_password: string;
};

const defaultForm: ShellyDoorForm = {
  shelly_auth_key: "",
  shelly_server_url: "",
  shelly_door_device_id: "",
  shelly_door_channel: "0",
  shelly_door_pulse_ms: "3000",
  ble_fallback_enabled: false,
  shelly_door_ble_mac: "",
  shelly_ble_control_password: "",
};

export function ShellyDoorSetup({ clubId }: { clubId: string }) {
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();
  const [form, setForm] = useState<ShellyDoorForm>(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!secrets) return;
    const s = secrets as any;
    setForm({
      shelly_auth_key: s.shelly_auth_key || "",
      shelly_server_url: s.shelly_server_url || "",
      shelly_door_device_id: s.shelly_door_device_id || "",
      shelly_door_channel: String(s.shelly_door_channel ?? 0),
      shelly_door_pulse_ms: String(s.shelly_door_pulse_ms ?? 3000),
      ble_fallback_enabled: !!s.ble_fallback_enabled,
      shelly_door_ble_mac: s.shelly_door_ble_mac || "",
      shelly_ble_control_password: s.shelly_ble_control_password || "",
    });
  }, [secrets]);

  const save = async () => {
    setSaving(true);
    try {
      await updateSecrets.mutateAsync({
        club_id: clubId,
        shelly_auth_key: form.shelly_auth_key || null,
        shelly_server_url: form.shelly_server_url || null,
        shelly_door_device_id: form.shelly_door_device_id || null,
        shelly_door_channel: form.shelly_door_channel ? Number(form.shelly_door_channel) : 0,
        shelly_door_pulse_ms: form.shelly_door_pulse_ms ? Number(form.shelly_door_pulse_ms) : 3000,
        ble_fallback_enabled: form.ble_fallback_enabled,
        shelly_door_ble_mac: form.shelly_door_ble_mac || null,
        shelly_ble_control_password: form.shelly_ble_control_password || null,
      } as any);
      toast.success("Shelly door setup saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save Shelly door setup");
    } finally {
      setSaving(false);
    }
  };

  const testCloud = async () => {
    try {
      const res = await triggerShellyDoor({
        clubId,
        doorName: "Admin test",
        ble: {
          enabled: form.ble_fallback_enabled,
          mac: form.shelly_door_ble_mac,
          password: form.shelly_ble_control_password,
          channel: Number(form.shelly_door_channel || 0),
          pulseMs: Number(form.shelly_door_pulse_ms || 3000),
        },
      });
      toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message || "Test failed");
    }
  };

  const testBleOnly = async () => {
    try {
      await pulseShellyBleAuto({
        mac: form.shelly_door_ble_mac,
        password: form.shelly_ble_control_password || undefined,
        channel: Number(form.shelly_door_channel || 0),
        pulseMs: Number(form.shelly_door_pulse_ms || 3000),
        turn: "on",
      });
      toast.success("BLE pulse sent - door should have clicked");
    } catch (err: any) {
      toast.error(describeBleError(err));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DoorOpen className="w-4 h-4 text-primary" /> Main Door Shelly
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex gap-3">
          <Wifi className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">Shelly Cloud Relay</p>
            <p>
              Configure the club's Shelly Cloud token, server, and door relay here. This is the
              same relay used when members tap "Open door".
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label>Shelly Cloud Auth Key</Label>
            <Input
              type="password"
              value={form.shelly_auth_key}
              onChange={(e) => setForm((p) => ({ ...p, shelly_auth_key: e.target.value }))}
              placeholder="Long token from Shelly app"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Server URL (optional)</Label>
            <Input
              value={form.shelly_server_url}
              onChange={(e) => setForm((p) => ({ ...p, shelly_server_url: e.target.value }))}
              placeholder="e.g. https://shelly-44-eu.shelly.cloud"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Door Device ID</Label>
            <Input
              value={form.shelly_door_device_id}
              onChange={(e) => setForm((p) => ({ ...p, shelly_door_device_id: e.target.value }))}
              placeholder="e.g. 84fce612abcd"
            />
          </div>
          <div className="space-y-1">
            <Label>Relay Channel</Label>
            <Input
              type="number"
              min={0}
              value={form.shelly_door_channel}
              onChange={(e) => setForm((p) => ({ ...p, shelly_door_channel: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Pulse Duration (ms)</Label>
            <Input
              type="number"
              min={500}
              step={500}
              value={form.shelly_door_pulse_ms}
              onChange={(e) => setForm((p) => ({ ...p, shelly_door_pulse_ms: e.target.value }))}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Bluetooth className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Bluetooth fallback (offline)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  If Shelly Cloud is unavailable, the app can pulse the relay directly over BLE.
                </p>
              </div>
            </div>
            <Switch
              checked={form.ble_fallback_enabled}
              onCheckedChange={(v) => setForm((p) => ({ ...p, ble_fallback_enabled: v }))}
            />
          </div>

          {form.ble_fallback_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1 md:col-span-2">
                <Label>Door Shelly BLE MAC</Label>
                <Input
                  value={form.shelly_door_ble_mac}
                  onChange={(e) => setForm((p) => ({ ...p, shelly_door_ble_mac: e.target.value }))}
                  placeholder="e.g. 84:FC:E6:12:AB:CD"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>BLE Control Password (optional)</Label>
                <Input
                  type="password"
                  value={form.shelly_ble_control_password}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, shelly_ble_control_password: e.target.value }))
                  }
                  placeholder="Leave blank if no Shelly password is set"
                />
              </div>
              {!isBleFallbackAvailable() && (
                <p className="text-[11px] text-amber-600 md:col-span-2">
                  This device can't use Bluetooth fallback.
                </p>
              )}
              {isBleFallbackAvailable() && isInBlockedIframe() && (
                <p className="text-[11px] text-amber-600 md:col-span-2">
                  Browsers block Bluetooth inside the preview frame.
                </p>
              )}
              <div className="md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.shelly_door_ble_mac || !isBleFallbackAvailable()}
                  onClick={testBleOnly}
                >
                  <Bluetooth className="w-3.5 h-3.5 mr-1" />
                  Test BLE only
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!form.shelly_auth_key || !form.shelly_door_device_id}
              onClick={testCloud}
            >
              Test open door
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Shelly door setup"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
