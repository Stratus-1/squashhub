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
}

export function AssociationSetupTab({ clubId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SetupRow>({
    name: "",
    member_number_prefix: "",
    member_number_length: 4,
    member_number_start: 1,
  });
  const [nextPreview, setNextPreview] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("name, member_number_prefix, member_number_length, member_number_start")
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

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">Member Number Allocation</h3>
        <p className="text-[11px] text-muted-foreground">
          Configured under <strong>Preferences → Member numbering</strong>. Current format:{" "}
          <span className="font-mono font-semibold">{nextPreview}</span>
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
