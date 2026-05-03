import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

interface Props {
  clubId: string;
}

interface SetupRow {
  name: string;
  member_number_prefix: string | null;
  member_number_length: number | null;
  member_number_start: number | null;
  league_member_annual_fee: number | null;
  league_fee_due_month: number | null;
}

export function AssociationSetupTab({ clubId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SetupRow>({
    name: "",
    member_number_prefix: "",
    member_number_length: 4,
    member_number_start: 1,
    league_member_annual_fee: 0,
    league_fee_due_month: 1,
  });
  const [nextPreview, setNextPreview] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("name, member_number_prefix, member_number_length, member_number_start, league_member_annual_fee, league_fee_due_month")
        .eq("id", clubId)
        .maybeSingle();
      if (error) toast.error(error.message);
      if (data) setForm(data as SetupRow);
      setLoading(false);
    })();
  }, [clubId]);

  useEffect(() => {
    const prefix = form.member_number_prefix || "";
    const len = form.member_number_length || 4;
    const start = form.member_number_start || 1;
    setNextPreview(`${prefix}${String(start).padStart(len, "0")}`);
  }, [form.member_number_prefix, form.member_number_length, form.member_number_start]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("clubs")
      .update({
        name: form.name,
        member_number_prefix: form.member_number_prefix,
        member_number_length: form.member_number_length,
        member_number_start: form.member_number_start,
        league_member_annual_fee: form.league_member_annual_fee,
        league_fee_due_month: form.league_fee_due_month,
      })
      .eq("id", clubId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Setup saved");
  };

  if (loading) return <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">League / Association</h3>
        <div className="space-y-1.5">
          <Label htmlFor="name">League name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Lowveld Squash League"
          />
          <p className="text-[11px] text-muted-foreground">Displayed across the platform and on member fee statements.</p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Member Number Allocation</h3>
        <p className="text-[11px] text-muted-foreground">
          New league member numbers are auto-generated as <strong>prefix + sequence</strong>, padded to the chosen length.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="prefix">Prefix</Label>
            <Input
              id="prefix"
              value={form.member_number_prefix || ""}
              onChange={(e) => setForm({ ...form, member_number_prefix: e.target.value.toUpperCase() })}
              placeholder="LWL"
              maxLength={6}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="length">Digits</Label>
            <Input
              id="length"
              type="number"
              min={1}
              max={8}
              value={form.member_number_length ?? 4}
              onChange={(e) => setForm({ ...form, member_number_length: parseInt(e.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start">Next sequence</Label>
            <Input
              id="start"
              type="number"
              min={1}
              value={form.member_number_start ?? 1}
              onChange={(e) => setForm({ ...form, member_number_start: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-[12px]">
          Next allocated number: <span className="font-mono font-semibold">{nextPreview}</span>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Annual Membership Fee</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fee">Fee per member / year (R)</Label>
            <Input
              id="fee"
              type="number"
              min={0}
              step="0.01"
              value={form.league_member_annual_fee ?? 0}
              onChange={(e) => setForm({ ...form, league_member_annual_fee: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duemonth">Due month</Label>
            <Input
              id="duemonth"
              type="number"
              min={1}
              max={12}
              value={form.league_fee_due_month ?? 1}
              onChange={(e) => setForm({ ...form, league_fee_due_month: parseInt(e.target.value) || 1 })}
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          This fee is billed pass-through via affiliated clubs to each registered league member.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save Setup
        </Button>
      </div>
    </div>
  );
}
