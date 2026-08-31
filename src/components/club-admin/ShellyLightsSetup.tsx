import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { useClubCurrency } from "@/hooks/use-currency";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { useUpdateClub, useMyClub } from "@/hooks/use-club";
import { EditLock, useEditLock } from "./setup/EditLock";
import { CourtsSection } from "./CourtsTab";

const RELAY_DEVICES = [
  { value: "shelly", label: "Shelly", description: "Shelly Cloud smart relays - fully supported" },
  { value: "magnet", label: "Magnet", description: "Magnetic contactor / relay switch" },
  { value: "sonoff", label: "Sonoff", description: "Sonoff eWeLink smart switches" },
  { value: "tasmota", label: "Tasmota", description: "Tasmota-flashed devices (ESP-based)" },
  { value: "home_assistant", label: "Home Assistant", description: "HA hub with relay automations" },
  { value: "other", label: "Other", description: "Contact SquashHub for integration assistance" },
] as const;

type RelayDevice = typeof RELAY_DEVICES[number]["value"];

export function ShellyLightsSetup({ clubId }: { clubId: string }) {
  const { data: clubData } = useMyClub();
  const club = clubData?.club as any;
  const { data: secrets } = useClubSecrets(clubId);
  const updateClub = useUpdateClub();
  const updateSecrets = useUpdateClubSecrets();
  const { symbol: currencySymbol } = useClubCurrency();

  const [lightsForm, setLightsForm] = useState({
    lights_integration_enabled: club?.lights_integration_enabled ?? false,
    light_fee_per_hour: club?.light_fee_per_hour ?? 0,
    shelly_auth_key: "",
    relay_device_type: "shelly" as RelayDevice,
    min_booking_balance: (club?.min_booking_balance ?? null) as number | null,
  });

  useEffect(() => {
    setLightsForm((p) => ({
      ...p,
      lights_integration_enabled: club?.lights_integration_enabled ?? false,
      light_fee_per_hour: club?.light_fee_per_hour ?? 0,
      min_booking_balance: (club?.min_booking_balance ?? null) as number | null,
    }));
  }, [club?.id, club?.lights_integration_enabled, club?.light_fee_per_hour, club?.min_booking_balance]);

  useEffect(() => {
    if (!secrets) return;
    setLightsForm((p) => ({
      ...p,
      shelly_auth_key: (secrets as any).shelly_auth_key || "",
      relay_device_type: ((secrets as any).relay_device_type || "shelly") as RelayDevice,
    }));
  }, [secrets]);

  const resetLights = () => {
    setLightsForm({
      lights_integration_enabled: club?.lights_integration_enabled ?? false,
      light_fee_per_hour: club?.light_fee_per_hour ?? 0,
      shelly_auth_key: (secrets as any)?.shelly_auth_key || "",
      relay_device_type: ((secrets as any)?.relay_device_type || "shelly") as RelayDevice,
      min_booking_balance: (club?.min_booking_balance ?? null) as number | null,
    });
  };
  const lightsLock = useEditLock(resetLights);

  const handleSaveLights = async (onDone?: () => void) => {
    try {
      await updateClub.mutateAsync({
        id: clubId,
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
      onDone?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const selectedDevice = RELAY_DEVICES.find((d) => d.value === lightsForm.relay_device_type);
  const isSupported = lightsForm.relay_device_type === "shelly";
  const isOther = lightsForm.relay_device_type === "other";
  const isUnsupported = !isSupported && !isOther;
  const lightsEnabled = lightsForm.lights_integration_enabled;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" /> Court Lights Shelly
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Shelly relay setup for court lights lives here. The per-court relay rows stay under this
          tile so clubs only have one place to manage Shelly lighting hardware.
        </p>

        <EditLock
          editing={lightsLock.editing}
          onEdit={lightsLock.edit}
          onCancel={lightsLock.cancel}
          onSave={() => handleSaveLights(lightsLock.done)}
          saving={updateClub.isPending || updateSecrets.isPending}
          title="light settings"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Court Lights</h3>
              <p className="text-xs text-muted-foreground">
                {lightsEnabled ? "Smart relay integration enabled." : "No light integration — booking dialog will not show light controls."}
              </p>
            </div>
            <Switch
              checked={lightsEnabled}
              onCheckedChange={(checked) => setLightsForm((p) => ({ ...p, lights_integration_enabled: checked }))}
            />
          </div>

          {lightsEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Relay Device Type</Label>
                  <Select
                    value={lightsForm.relay_device_type}
                    onValueChange={(v: RelayDevice) => setLightsForm((p) => ({ ...p, relay_device_type: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELAY_DEVICES.map((d) => (
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
                        setLightsForm((p) => ({ ...p, light_fee_per_hour: checked ? 30 : 0 }))
                      }
                    />
                  </div>
                  {lightsForm.light_fee_per_hour > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{currencySymbol}</span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="h-8 text-xs"
                        value={lightsForm.light_fee_per_hour}
                        onChange={(e) =>
                          setLightsForm((p) => ({ ...p, light_fee_per_hour: parseInt(e.target.value) || 0 }))
                        }
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
                    onChange={(e) => setLightsForm((p) => ({ ...p, shelly_auth_key: e.target.value }))}
                    placeholder="Paste your Shelly Cloud auth key"
                  />
                </div>
              )}

              {isUnsupported && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground">
                    {selectedDevice?.label} integration coming soon.
                  </p>
                </div>
              )}

              {isOther && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground">
                    Custom integration — contact support.
                  </p>
                </div>
              )}
            </>
          )}
        </EditLock>

        {lightsEnabled && (
          <CourtsSection clubId={clubId} mode="relays" relayDeviceType={lightsForm.relay_device_type} />
        )}
      </CardContent>
    </Card>
  );
}
