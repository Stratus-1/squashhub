import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ClubRankingSettings {
  ranking_points_enabled: boolean;
  points_from_leagues: boolean;
  points_from_tournaments: boolean;
}

/** Club-level ranking switches — the competition toggles sit on top of these. */
export function useClubRankingSettings(clubId?: string | null) {
  return useQuery({
    queryKey: ["club-ranking-settings", clubId],
    enabled: !!clubId,
    queryFn: async (): Promise<ClubRankingSettings> => {
      const { data, error } = await supabase
        .from("clubs")
        .select("ranking_points_enabled, points_from_leagues, points_from_tournaments")
        .eq("id", clubId!)
        .maybeSingle();
      if (error) throw error;
      return {
        ranking_points_enabled: !!(data as any)?.ranking_points_enabled,
        points_from_leagues: !!(data as any)?.points_from_leagues,
        points_from_tournaments: !!(data as any)?.points_from_tournaments,
      };
    },
  });
}

const WEIGHTS = ["0.5", "1", "1.5", "2", "3"];

interface Props {
  clubId?: string | null;
  /** Which club-level switch this competition depends on. */
  source: "league" | "tournament";
  affects: boolean;
  onAffectsChange: (v: boolean) => void;
  weight: number;
  onWeightChange: (v: number) => void;
  className?: string;
}

/**
 * Single place where a competition (league or championship) is linked to the
 * club ranking system: on/off plus how heavily its results count.
 */
export function CompetitionRankingCard({
  clubId,
  source,
  affects,
  onAffectsChange,
  weight,
  onWeightChange,
  className,
}: Props) {
  const { data: club } = useClubRankingSettings(clubId);
  const sourceLabel = source === "league" ? "league" : "tournament";

  const clubOff = club && !club.ranking_points_enabled;
  const sourceOff =
    club &&
    club.ranking_points_enabled &&
    (source === "league" ? !club.points_from_leagues : !club.points_from_tournaments);
  const warn = affects && (clubOff || sourceOff);

  return (
    <div className={`rounded-md border bg-muted/30 px-3 py-2 space-y-2 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-xs font-medium">Affects official ranking points?</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            When on, completed {sourceLabel} results queue point movements for admin approval.
          </p>
        </div>
        <Switch checked={affects} onCheckedChange={onAffectsChange} />
      </div>

      {affects && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-xs font-medium">Ranking weight</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Multiplies the points earned here — use a higher weight for stronger competitions.
            </p>
          </div>
          <Select value={String(weight ?? 1)} onValueChange={(v) => onWeightChange(Number(v))}>
            <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WEIGHTS.map((w) => (
                <SelectItem key={w} value={w}>{w}×</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {warn && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
          <p className="text-[11px] text-destructive">
            {clubOff
              ? "Ranking points are switched off for this club, so no points will be awarded. Turn them on under Ladder & Ranking."
              : `Ranking points from ${sourceLabel} results are switched off for this club, so nothing will be awarded. Enable it under Ladder & Ranking.`}
          </p>
        </div>
      )}
    </div>
  );
}
