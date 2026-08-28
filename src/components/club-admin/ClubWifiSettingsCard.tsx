import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Wifi } from "lucide-react";
import { useClubSecrets, useUpdateClubSecrets } from "@/hooks/use-club-secrets";
import { fromExt } from "@/lib/supabase-ext";
import { EditLock, useEditLock } from "./setup/EditLock";

/**
 * Club Wi-Fi sharing settings (SSID, password, member QR join, optional monthly fee).
 * Lives on the Member Wi-Fi admin tab. Stored in the restricted club_secrets table.
 */
export function ClubWifiSettingsCard({ clubId }: { clubId: string }) {
  const { data: secrets } = useClubSecrets(clubId);
  const updateSecrets = useUpdateClubSecrets();

  const [form, setForm] = useState({
    wifi_enabled: false,
    wifi_ssid: "",
    wifi_password: "",
    wifi_security: "WPA",
    wifi_hidden: false,
    wifi_notes: "",
    wifi_visitors_allowed: true,
    wifi_charge_enabled: false,
    wifi_monthly_fee: "",
    wifi_fee_id: "",
  });

  const [monthlyFees, setMonthlyFees] = useState<any[]>([]);
  useEffect(() => {
    if (!clubId) return;
    fromExt("national_body_fees")
      .select("id, body_name, fee_annual, billing_period, active")
      .eq("club_id", clubId)
      .eq("billing_period", "monthly")
      .eq("active", true)
      .then(({ data }: any) => setMonthlyFees(data || []));
  }, [clubId]);

  const resetForm = () => {
    const s = (secrets || {}) as any;
    setForm({
      wifi_enabled: !!s.wifi_enabled,
      wifi_ssid: s.wifi_ssid || "",
      wifi_password: s.wifi_password || "",
      wifi_security: s.wifi_security || "WPA",
      wifi_hidden: !!s.wifi_hidden,
      wifi_notes: s.wifi_notes || "",
      wifi_visitors_allowed: s.wifi_visitors_allowed ?? true,
      wifi_charge_enabled: !!s.wifi_charge_enabled,
      wifi_monthly_fee: s.wifi_monthly_fee ? String(s.wifi_monthly_fee) : "",
      wifi_fee_id: s.wifi_fee_id || "",
    });
  };

  useEffect(() => {
    if (secrets) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secrets]);

  const lock = useEditLock(resetForm);

  const handleSave = async () => {
    try {
      await updateSecrets.mutateAsync({
        club_id: clubId,
        wifi_enabled: form.wifi_enabled,
        wifi_ssid: form.wifi_ssid.trim() || null,
        wifi_password: form.wifi_password || null,
        wifi_security: form.wifi_security,
        wifi_hidden: form.wifi_hidden,
        wifi_notes: form.wifi_notes.trim() || null,
        wifi_visitors_allowed: form.wifi_visitors_allowed,
        wifi_charge_enabled: form.wifi_charge_enabled,
        wifi_monthly_fee: Number(form.wifi_monthly_fee || 0),
        wifi_fee_id: form.wifi_fee_id || null,
      } as any);
      toast.success("Wi-Fi settings saved");
      lock.done();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <EditLock
        editing={lock.editing}
        onEdit={lock.edit}
        onCancel={lock.cancel}
        onSave={handleSave}
        saving={updateSecrets.isPending}
        title="club Wi-Fi"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium flex items-center gap-2">
                <Wifi className="w-4 h-4 text-primary" />
                Share Wi-Fi with members
              </p>
              <p className="text-xs text-muted-foreground">
                Members see a "Club Wi-Fi" tile on their dashboard with a scannable
                QR code that joins the network automatically. The password is stored
                in the club's protected settings and is never public.
              </p>
            </div>
            <Switch
              checked={form.wifi_enabled}
              onCheckedChange={(v) => setForm((p) => ({ ...p, wifi_enabled: v }))}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Network name (SSID)</Label>
              <Input
                value={form.wifi_ssid}
                onChange={(e) => setForm((p) => ({ ...p, wifi_ssid: e.target.value }))}
                placeholder="ZTE_B035D3"
              />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                value={form.wifi_password}
                onChange={(e) => setForm((p) => ({ ...p, wifi_password: e.target.value }))}
                placeholder="Wi-Fi password"
              />
            </div>
            <div className="space-y-1">
              <Label>Security</Label>
              <Select
                value={form.wifi_security}
                onValueChange={(v) => setForm((p) => ({ ...p, wifi_security: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WPA">WPA / WPA2 / WPA3</SelectItem>
                  <SelectItem value="WEP">WEP (older routers)</SelectItem>
                  <SelectItem value="nopass">Open — no password</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes for members (optional)</Label>
              <Input
                value={form.wifi_notes}
                onChange={(e) => setForm((p) => ({ ...p, wifi_notes: e.target.value }))}
                placeholder="Fair use please — limited data, max 16 devices."
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Hidden network</p>
              <p className="text-xs text-muted-foreground">
                Tick if the SSID isn't broadcast — the QR code then tells the phone to search for it.
              </p>
            </div>
            <Switch
              checked={form.wifi_hidden}
              onCheckedChange={(v) => setForm((p) => ({ ...p, wifi_hidden: v }))}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Show to registered visitors</p>
              <p className="text-xs text-muted-foreground">
                Off means only club members (not visitor accounts) can see the Wi-Fi details.
              </p>
            </div>
            <Switch
              checked={form.wifi_visitors_allowed}
              onCheckedChange={(v) => setForm((p) => ({ ...p, wifi_visitors_allowed: v }))}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Charge a monthly Wi-Fi fee</p>
              <p className="text-xs text-muted-foreground">
                Members must request access. The fee is levied to their club account every month
                until they cancel, and the Wi-Fi details lock if the month lapses or the fee stays unpaid.
              </p>
            </div>
            <Switch
              checked={form.wifi_charge_enabled}
              onCheckedChange={(v) => setForm((p) => ({ ...p, wifi_charge_enabled: v }))}
            />
          </div>

          {form.wifi_charge_enabled && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Link to a monthly fee (optional)</Label>
                <Select
                  value={form.wifi_fee_id || "none"}
                  onValueChange={(v) => setForm((p) => ({ ...p, wifi_fee_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Use the amount below" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use the amount below</SelectItem>
                    {monthlyFees.map((f: any) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.body_name} — {Number(f.fee_annual || 0).toFixed(2)}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Create a monthly fee under Finance → Fees (e.g. "Wifi per month") and pick it here — its name and amount are used when a member subscribes.
                </p>
              </div>
              {!form.wifi_fee_id && (
                <div className="space-y-1.5">
                  <Label>Monthly Wi-Fi fee</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.wifi_monthly_fee}
                    onChange={(e) => setForm((p) => ({ ...p, wifi_monthly_fee: e.target.value }))}
                    placeholder="10.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Billed monthly in advance to the member's account, like any other club fee.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </EditLock>
    </Card>
  );
}
