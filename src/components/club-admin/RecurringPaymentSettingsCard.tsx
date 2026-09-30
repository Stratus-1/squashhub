import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Repeat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PERIOD_CHOICES, RECURRING_GATEWAYS, recurringGatewayFor, useClubRecurringSettings, type RecurringSettings,
} from "@/lib/recurring-payments";

interface Props {
  clubId: string;
  club: { payment_gateway?: string | null; payment_gateways?: string[] | null };
}

/** Club rules for recurring payments. Shown only when a recurring-capable gateway is switched on. */
export default function RecurringPaymentSettingsCard({ clubId, club }: Props) {
  const qc = useQueryClient();
  const gateway = recurringGatewayFor(club);
  const { data: saved } = useClubRecurringSettings(clubId);
  const [form, setForm] = useState<RecurringSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (saved) setForm(saved); }, [saved]);
  if (!gateway || !form) return null;

  const set = <K extends keyof RecurringSettings>(k: K, v: RecurringSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleMonth = (m: number) =>
    set("allowed_months", form.allowed_months.includes(m) ? form.allowed_months.filter((x) => x !== m) : [...form.allowed_months, m].sort((a, b) => a - b));

  async function save() {
    if (!form) return;
    if (form.recurring_enabled && form.allowed_months.length === 0) return toast.error("Tick at least one period");
    if (form.arrears_from && form.arrears_until && form.arrears_until < form.arrears_from) return toast.error("End date must be after start date");
    setSaving(true);
    const { error } = await (supabase as any).from("club_recurring_settings").upsert({
      club_id: clubId,
      recurring_enabled: form.recurring_enabled,
      allowed_months: form.allowed_months,
      arrears_enabled: form.arrears_enabled,
      arrears_from: form.arrears_from || null,
      arrears_until: form.arrears_until || null,
      arrears_max_months: Number(form.arrears_max_months) || 6,
      arrears_min_amount: Number(form.arrears_min_amount) || 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Recurring payment settings saved");
    qc.invalidateQueries({ queryKey: ["club-recurring-settings", clubId] });
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Recurring payments</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Your gateway supports {RECURRING_GATEWAYS[gateway].label}s. Decide whether members may use them and for how long.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div>
          <Label className="text-sm">Allow recurring payments</Label>
          <p className="text-[11px] text-muted-foreground">When off, members never see the monthly payment option and the Fees table hides the Recurring column.</p>
        </div>
        <Switch checked={form.recurring_enabled} onCheckedChange={(v) => set("recurring_enabled", v)} />
      </div>

      {form.recurring_enabled && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Periods members may choose (months)</Label>
            <div className="flex flex-wrap gap-2">
              {PERIOD_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMonth(m)}
                  className={`h-8 min-w-12 rounded-md border px-3 text-xs ${form.allowed_months.includes(m) ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Allow recurring payment of outstanding balances</Label>
                <p className="text-[11px] text-muted-foreground">Members with an unpaid balance can pay it off monthly, or add it to their existing monthly payment.</p>
              </div>
              <Switch checked={form.arrears_enabled} onCheckedChange={(v) => set("arrears_enabled", v)} />
            </div>
            {form.arrears_enabled && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Allowed from</Label>
                  <Input type="date" className="h-8 text-xs" value={form.arrears_from || ""} onChange={(e) => set("arrears_from", e.target.value || null)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Allowed until</Label>
                  <Input type="date" className="h-8 text-xs" value={form.arrears_until || ""} onChange={(e) => set("arrears_until", e.target.value || null)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Maximum months</Label>
                  <Input type="number" min={1} max={24} className="h-8 text-xs" value={form.arrears_max_months} onChange={(e) => set("arrears_max_months", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Minimum balance (R)</Label>
                  <Input type="number" min={0} step="1" className="h-8 text-xs" value={form.arrears_min_amount} onChange={(e) => set("arrears_min_amount", Number(e.target.value))} />
                </div>
                <p className="col-span-full text-[11px] text-muted-foreground">
                  Outside these dates members can't start a new plan; plans already running carry on until finished.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save recurring settings"}</Button>
      </div>
    </Card>
  );
}
