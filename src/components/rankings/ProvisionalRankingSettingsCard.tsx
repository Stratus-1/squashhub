import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProvisionalSettings } from "@/hooks/use-provisional-ranking";
import { RANKING_SCOPE_LABELS } from "@/lib/rankings/provisional";

interface Props {
  /** "association" writes association_ranking_settings; "national" writes organisation_settings. */
  scope: "association" | "national";
  /** association_id (tenant club id of the association) or organisations.id for national. */
  ownerId: string | null | undefined;
  className?: string;
}

/**
 * Admin editor for one ranking system's provisional rules: the starting value
 * new players carry and how many ranked matches make them official. Club,
 * regional and national systems each have their own row — nothing here leaks
 * into another scope.
 */
export function ProvisionalRankingSettingsCard({ scope, ownerId, className }: Props) {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useProvisionalSettings(scope, ownerId);
  const [enabled, setEnabled] = useState(true);
  const [startPoints, setStartPoints] = useState("600");
  const [minMatches, setMinMatches] = useState("5");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setStartPoints(String(settings.startPoints));
    setMinMatches(String(settings.minMatches));
  }, [settings]);

  const save = async () => {
    if (!ownerId) return;
    setSaving(true);
    const payload = {
      provisional_enabled: enabled,
      provisional_start_points: Math.max(0, Number(startPoints) || 0),
      provisional_min_matches: Math.max(0, Number(minMatches) || 0),
      updated_at: new Date().toISOString(),
    };
    const { error } =
      scope === "association"
        ? await (supabase as any)
            .from("association_ranking_settings")
            .upsert({ association_id: ownerId, ...payload }, { onConflict: "association_id" })
        : await (supabase as any)
            .from("organisation_settings")
            .upsert({ org_id: ownerId, ...payload }, { onConflict: "org_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${RANKING_SCOPE_LABELS[scope]} provisional settings saved`);
    queryClient.invalidateQueries({ queryKey: ["provisional-settings", scope, ownerId] });
  };

  const scopeLabel = RANKING_SCOPE_LABELS[scope];

  return (
    <Card className={`p-4 space-y-3 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{scopeLabel} — provisional players</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            New players on the {scopeLabel.toLowerCase()} list start on a set value and show a “Provisional” badge
            until they have played enough ranked matches. Club, regional and national lists are independent —
            a player can be official on one and provisional on another.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={isLoading} />
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Starting points</Label>
            <Input
              type="number"
              step="1"
              min={0}
              value={startPoints}
              onChange={(e) => setStartPoints(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-xs">Matches to become official</Label>
            <Input
              type="number"
              step="1"
              min={0}
              value={minMatches}
              onChange={(e) => setMinMatches(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
      )}
      <Button onClick={save} disabled={saving || isLoading || !ownerId} size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
        Save {scopeLabel.toLowerCase()} settings
      </Button>
    </Card>
  );
}
