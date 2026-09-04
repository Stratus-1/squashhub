import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { CalendarRange, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  nextSeasonYear,
  seasonLabel,
  sortSeasons,
  type LeagueSeason,
} from "@/lib/leagues/seasons";

type Props = {
  association: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** System leagues: seasons are opened by the association — clubs view and pick one. */
  readOnly?: boolean;
  /** Club-level shortcut: create this club's teams for a chosen season. */
  onCreateTeams?: (seasonYear: number) => void;
};

/**
 * Season management for one league (tenant association).
 *
 * Creating a season never touches existing rows: it inserts a new season and,
 * optionally, fresh team rows rolled over from the current season. Historical
 * fixtures keep pointing at the old teams and their name snapshots.
 */
export function LeagueSeasonsDialog({ association, open, onOpenChange, readOnly = false, onCreateTeams }: Props) {
  const queryClient = useQueryClient();
  const associationId = association?.id ?? null;

  const { data: seasons = [], isLoading } = useQuery({
    queryKey: ["league-seasons", associationId, null],
    enabled: !!associationId && open,
    queryFn: async (): Promise<LeagueSeason[]> => {
      const { data, error } = await supabase
        .from("league_seasons")
        .select(
          "id, association_id, platform_association_id, club_id, season_year, label, status, is_current, starts_on, ends_on",
        )
        .eq("association_id", associationId!)
        .order("season_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeagueSeason[];
    },
  });

  const sorted = sortSeasons(seasons);
  const suggestedYear = nextSeasonYear(seasons);

  const [year, setYear] = useState<string>("");
  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [copyTeams, setCopyTeams] = useState(true);

  const yearValue = year || String(suggestedYear);

  const createSeason = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_league_season", {
        p_association_id: associationId!,
        p_season_year: Number(yearValue),
        p_label: label || null,
        p_starts_on: startsOn || null,
        p_ends_on: endsOn || null,
        p_make_current: makeCurrent,
        p_copy_teams: copyTeams,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      toast.success(`${yearValue} season created`);
      setYear("");
      setLabel("");
      setStartsOn("");
      setEndsOn("");
      queryClient.invalidateQueries({ queryKey: ["league-seasons"] });
      queryClient.invalidateQueries({ queryKey: ["club-leagues"] });
      queryClient.invalidateQueries({ queryKey: ["club-leagues-codes-assoc"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the season"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4" />
            Seasons — {association?.name}
          </DialogTitle>
          <DialogDescription>
            A league is permanent; each year is a season. Past seasons keep their own
            teams, rounds, fixtures and standings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            {isLoading && <p className="text-xs text-muted-foreground">Loading seasons…</p>}
            {!isLoading && sorted.length === 0 && (
              <p className="text-xs text-muted-foreground">No seasons yet for this league.</p>
            )}
            {sorted.map((s) => (
              <Card key={s.id} className="p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{seasonLabel(s)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.starts_on || "—"} → {s.ends_on || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {s.is_current && <Badge className="text-[10px] h-5">Current</Badge>}
                  <Badge variant="outline" className="text-[10px] h-5">
                    {s.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <p className="text-xs font-semibold">Create a new season</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Year</Label>
                <Input
                  className="h-8 text-xs"
                  inputMode="numeric"
                  value={yearValue}
                  onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Label (optional)</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder={yearValue}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Starts</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Ends</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={makeCurrent}
                onCheckedChange={(v) => setMakeCurrent(v === true)}
              />
              Make this the current season
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={copyTeams} onCheckedChange={(v) => setCopyTeams(v === true)} />
              Copy this season's teams into the new season
            </label>

            <Button
              size="sm"
              className="w-full"
              disabled={createSeason.isPending || yearValue.length !== 4}
              onClick={() => createSeason.mutate()}
            >
              {createSeason.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              Create {yearValue} season
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
