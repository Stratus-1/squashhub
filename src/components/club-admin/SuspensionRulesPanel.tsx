import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldOff, Save } from "lucide-react";
import { toast } from "sonner";
import { useUpdateClub, type Club } from "@/hooks/use-club";

const BLOCK_OPTIONS: { key: string; label: string }[] = [
  { key: "bookings", label: "Court bookings" },
  { key: "door", label: "Door / access" },
  { key: "league", label: "League signup" },
  { key: "challenges", label: "Challenges" },
  { key: "events", label: "Event RSVPs" },
  { key: "bar", label: "Bar tab" },
];

interface Rules {
  enabled: boolean;
  grace_days: number;
  amount_threshold: number;
  age_days_threshold: number;
  exempt_with_mandate: boolean;
  blocks: string[];
  grace_message: string;
}

const DEFAULTS: Rules = {
  enabled: false,
  grace_days: 30,
  amount_threshold: 500,
  age_days_threshold: 60,
  exempt_with_mandate: true,
  blocks: ["bookings", "door", "league", "challenges", "events", "bar"],
  grace_message: "Your account is in arrears. Please settle outstanding fees to restore access.",
};

export function SuspensionRulesPanel({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const [rules, setRules] = useState<Rules>({
    ...DEFAULTS,
    ...((club as any).suspension_rules || {}),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRules({ ...DEFAULTS, ...((club as any).suspension_rules || {}) });
  }, [club.id]);

  const toggleBlock = (k: string) => {
    setRules((r) => ({
      ...r,
      blocks: r.blocks.includes(k) ? r.blocks.filter((b) => b !== k) : [...r.blocks, k],
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateClub.mutateAsync({ id: club.id, suspension_rules: rules } as any);
      toast.success("Suspension rules saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-base">Arrears & Suspension Rules</h3>
            <p className="text-xs text-muted-foreground">
              Automatically restrict members whose fee accounts are in arrears.
            </p>
          </div>
        </div>
        <Switch
          checked={rules.enabled}
          onCheckedChange={(v) => setRules((r) => ({ ...r, enabled: v }))}
        />
      </div>

      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="grace-days">Grace period (days)</Label>
          <Input
            id="grace-days"
            type="number"
            min={0}
            value={rules.grace_days}
            onChange={(e) => setRules((r) => ({ ...r, grace_days: Number(e.target.value) || 0 }))}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Days after due date before a fee counts as arrears.
          </p>
        </div>
        <div>
          <Label htmlFor="amount">Amount threshold (R)</Label>
          <Input
            id="amount"
            type="number"
            min={0}
            value={rules.amount_threshold}
            onChange={(e) => setRules((r) => ({ ...r, amount_threshold: Number(e.target.value) || 0 }))}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Suspend when outstanding ≥ this amount.
          </p>
        </div>
        <div>
          <Label htmlFor="age">Age threshold (days)</Label>
          <Input
            id="age"
            type="number"
            min={0}
            value={rules.age_days_threshold}
            onChange={(e) => setRules((r) => ({ ...r, age_days_threshold: Number(e.target.value) || 0 }))}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Suspend when any unpaid fee is older than this.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded border p-3">
        <Switch
          checked={rules.exempt_with_mandate}
          onCheckedChange={(v) => setRules((r) => ({ ...r, exempt_with_mandate: v }))}
        />
        <div>
          <p className="text-sm font-medium">Exempt members with an active debit order</p>
          <p className="text-xs text-muted-foreground">
            Skip suspension for members who have an active Stitch mandate.
          </p>
        </div>
      </div>

      <div>
        <Label>What to block for suspended members</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {BLOCK_OPTIONS.map((b) => (
            <label key={b.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={rules.blocks.includes(b.key)}
                onCheckedChange={() => toggleBlock(b.key)}
              />
              <span>{b.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="grace-msg">Message shown to suspended members</Label>
        <Textarea
          id="grace-msg"
          value={rules.grace_message}
          onChange={(e) => setRules((r) => ({ ...r, grace_message: e.target.value }))}
          rows={2}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save rules"}
        </Button>
      </div>
    </Card>
  );
}
