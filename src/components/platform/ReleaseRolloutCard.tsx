import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Rocket, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { APP_BUILD_ID, formatBuildTime } from "@/lib/app-version";

interface ReleaseRow {
  id: string;
  build_id: string;
  released_at: string;
  severity: string;
  rollout_percent: number;
  target_club_ids: string[];
  notes: string | null;
}

/**
 * Controls how the currently deployed build is offered to users:
 * a phased rollout percentage, optional club targeting, and a "critical"
 * flag that forces an immediate (still graceful) update for security fixes.
 */
export function ReleaseRolloutCard() {
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [buildId, setBuildId] = useState(APP_BUILD_ID);
  const [percent, setPercent] = useState(100);
  const [critical, setCritical] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("app_releases")
      .select("id, build_id, released_at, severity, rollout_percent, target_club_ids, notes")
      .order("released_at", { ascending: false })
      .limit(10);
    const list = (data as ReleaseRow[]) ?? [];
    setRows(list);
    const current = list.find((r) => r.build_id === APP_BUILD_ID);
    if (current) {
      setPercent(current.rollout_percent);
      setCritical(current.severity === "critical");
      setNotes(current.notes ?? "");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("app_releases").upsert(
        {
          build_id: buildId.trim(),
          severity: critical ? "critical" : "normal",
          rollout_percent: Math.max(0, Math.min(100, Number(percent) || 0)),
          notes: notes || null,
        },
        { onConflict: "build_id" },
      );
      if (error) throw error;
      toast.success("Release settings saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save release settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Rocket className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-lg">Release Rollout</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        New builds download silently in the background. Users are only offered the
        update at a safe moment — never mid-task. Use the percentage to phase a
        rollout, and mark a build critical only for security fixes (that forces an
        update after a short countdown).
      </p>
      <p className="text-xs text-muted-foreground">
        Current build: <span className="font-mono">{APP_BUILD_ID}</span>
        {formatBuildTime() ? ` · built ${formatBuildTime()}` : ""}
      </p>
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div>
          <Label htmlFor="rel-build">Build ID</Label>
          <Input id="rel-build" value={buildId} onChange={(e) => setBuildId(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="rel-pct">Rollout percentage</Label>
          <Input
            id="rel-pct"
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground mt-1">
            100 = everyone. Devices are bucketed deterministically, so a device never
            flips in and out of a rollout.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="rel-notes">Notes (internal)</Label>
          <Input id="rel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Critical security release</p>
            <p className="text-xs text-muted-foreground">
              Bypasses "Later" and forces a graceful reload after a 20-second notice.
            </p>
          </div>
          <Switch checked={critical} onCheckedChange={setCritical} />
        </div>
      </div>
      <Button onClick={save} disabled={saving || !buildId.trim()}>
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Saving..." : "Save release settings"}
      </Button>

      {rows.length > 0 && (
        <>
          <Separator />
          <div className="space-y-1">
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span className="font-mono">{r.build_id.slice(0, 12)}</span>
                <span>
                  {r.severity === "critical" ? "critical · " : ""}
                  {r.rollout_percent}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
