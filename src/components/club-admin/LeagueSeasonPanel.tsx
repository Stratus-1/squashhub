import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarRange, Copy, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useLeagueSeasons } from "@/hooks/use-league-seasons";
import { nextSeasonYear, seasonLabel } from "@/lib/leagues/seasons";
import { isClubLeagueScope } from "@/lib/leagues/terminology";
import { MatchDayAccessCard } from "@/components/match-day/MatchDayAccessCard";

interface Props {
  association: any;
  /** season_year of every team row that belongs to this league */
  teamYears: (number | null | undefined)[];
  onCreateTeams: (year: number) => void;
}

/**
 * One league, one season story: which season is running, how to open the next
 * one (auto-incremented, optionally copying this season's teams) and how to
 * create teams for a season that has none yet.
 *
 * Missed the tick when opening a season? Any empty season can still copy the
 * previous season's teams afterwards ("Copy teams from ...") — nothing else is
 * rewritten, and the copy refuses to run twice so teams can never duplicate.
 *
 * System Leagues: the association owns the season calendar, so the club only
 * sees the opened seasons and creates its teams for them.
 */
export function LeagueSeasonPanel({ association, teamYears, onCreateTeams }: Props) {
  const qc = useQueryClient();
  const isClub = isClubLeagueScope(association?.scope);
  const usePlatform = Boolean(!isClub && association?.platform_association_id);

  const { seasons, currentSeason, isLoading } = useLeagueSeasons({
    associationId: usePlatform ? null : association?.id,
    platformAssociationId: usePlatform ? association.platform_association_id : null,
  });

  const [copyTeams, setCopyTeams] = useState(true);
  const nextYear = nextSeasonYear(seasons);
  const name = association?.abbreviation || association?.name;

  const countFor = (year: number) => teamYears.filter((y) => y === year).length;

  /** Closest earlier season that actually has teams, per season year. */
  const sourceYearFor = (year: number): number | null => {
    const candidates = seasons
      .filter((s: any) => s.season_year < year && countFor(s.season_year) > 0)
      .map((s: any) => s.season_year as number)
      .sort((a, b) => b - a);
    return candidates[0] ?? null;
  };

  const openNext = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("create_league_season", {
        p_association_id: association.id,
        p_season_year: nextYear,
        p_label: null,
        p_starts_on: null,
        p_ends_on: null,
        p_make_current: true,
        p_copy_teams: copyTeams,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${nextYear} season opened`);
      qc.invalidateQueries({ queryKey: ["league-seasons"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not open the next season"),
  });

  const copyInto = useMutation({
    mutationFn: async (seasonId: string) => {
      const { data, error } = await (supabase as any).rpc("copy_league_season_teams", {
        p_season_id: seasonId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`Copied ${count ?? 0} team${count === 1 ? "" : "s"} into the season`);
      qc.invalidateQueries({ queryKey: ["league-seasons"] });
      qc.invalidateQueries({ queryKey: ["leagues"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not copy the teams"),
  });

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {currentSeason ? `Current season: ${seasonLabel(currentSeason)}` : "No season opened yet"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isClub
                ? "You open each season for this league. Tick the box to bring this season's teams into the new one — or copy them in later from any empty season."
                : `${name} opens each season — create your club's teams for the season they open.`}
            </p>
          </div>
        </div>

        {isClub && (
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Checkbox checked={copyTeams} onCheckedChange={(v) => setCopyTeams(v === true)} />
              Copy this season's teams into the new season
            </label>
            <Button size="sm" disabled={openNext.isPending} onClick={() => openNext.mutate()}>
              {openNext.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1" />
              )}
              Open {nextYear} season
            </Button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-[11px] text-muted-foreground">Loading seasons…</p>}

      {!isLoading && seasons.length === 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap rounded-md border border-dashed p-2">
          <p className="text-xs text-muted-foreground">
            {isClub
              ? "No seasons yet — open one above to start."
              : `${name} has not opened a season yet. You'll see it here as soon as they do.`}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {seasons.map((s: any) => {
          const teams = countFor(s.season_year);
          const sourceYear = teams === 0 && isClub ? sourceYearFor(s.season_year) : null;
          return (
            <div
              key={s.id}
              className="flex items-center justify-between gap-2 flex-wrap rounded-md border p-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-medium">{seasonLabel(s)}</p>
                {s.is_current && <Badge className="text-[10px] h-5">Current</Badge>}
                <Badge variant="outline" className="text-[10px] h-5">{s.status}</Badge>
                <span className="text-[11px] text-muted-foreground">
                  {teams} team{teams === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {sourceYear !== null && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={copyInto.isPending}
                    onClick={() => copyInto.mutate(s.id)}
                  >
                    {copyInto.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 mr-1" />
                    )}
                    Copy teams from {sourceYear}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={teams === 0 ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => onCreateTeams(s.season_year)}
                >
                  {teams === 0 ? (
                    <>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Create teams for {s.season_year}
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Edit teams
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {currentSeason?.id && (
        <MatchDayAccessCard
          kind="league_season"
          competitionId={currentSeason.id}
          competitionName={`${name ?? "League"} ${seasonLabel(currentSeason)}`}
        />
      )}
    </Card>
  );
}
