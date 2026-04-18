import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star, Trophy, Pencil } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";

type Props = {
  platformAssocIds: string[];
  clubTeamCodes: string[];
  myTeamCodes: Set<string>;
  /** Start of the configured squash week (yyyy-MM-dd). Falls back to today. */
  weekStart?: string;
  /** End of the squash week window (yyyy-MM-dd). Falls back to weekStart + 6 days, or today + 14 days. */
  weekEnd?: string;
};

export function UpcomingFixturesTab({ platformAssocIds, clubTeamCodes, myTeamCodes, weekStart, weekEnd }: Props) {
  const navigate = useNavigate();
  const rangeStart = weekStart ?? format(new Date(), "yyyy-MM-dd");
  const rangeEnd = weekEnd ?? format(addDays(weekStart ? parseISO(weekStart) : new Date(), weekStart ? 6 : 14), "yyyy-MM-dd");

  const { data: fixtures, isLoading } = useQuery({
    queryKey: ["upcoming-league-fixtures", rangeStart, rangeEnd, platformAssocIds.join(","), clubTeamCodes.join(",")],
    queryFn: async () => {
      if (platformAssocIds.length === 0 || clubTeamCodes.length === 0) return [];
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .in("association_id", platformAssocIds)
        .gte("fixture_date", rangeStart)
        .lte("fixture_date", rangeEnd)
        .order("fixture_date")
        .order("division");
      if (error) throw error;
      const codes = new Set(clubTeamCodes);
      return (data || []).filter((f) => codes.has(f.home_team_code) || codes.has(f.away_team_code));
    },
    enabled: platformAssocIds.length > 0 && clubTeamCodes.length > 0,
  });

  const fixtureIds = (fixtures || []).map((f) => f.id);
  const { data: existingResults } = useQuery({
    queryKey: ["league-fixture-results", fixtureIds.join(",")],
    queryFn: async () => {
      if (fixtureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_results" as any)
        .select("fixture_id, status, home_total_points, away_total_points, winner")
        .in("fixture_id", fixtureIds);
      if (error) throw error;
      return data || [];
    },
    enabled: fixtureIds.length > 0,
  });

  const resultMap = useMemo(() => {
    const map = new Map<string, { status: string; homePoints: number; awayPoints: number; winner: string | null }>();
    for (const r of (existingResults || []) as any[]) {
      map.set(r.fixture_id, {
        status: r.status,
        homePoints: r.home_total_points ?? 0,
        awayPoints: r.away_total_points ?? 0,
        winner: r.winner,
      });
    }
    return map;
  }, [existingResults]);

  const fixturesByDate = useMemo(() => {
    const groups = new Map<string, typeof fixtures>();
    for (const f of fixtures || []) {
      const date = f.fixture_date;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(f);
    }
    return groups;
  }, [fixtures]);

  const isMyFixture = (f: any) => myTeamCodes.has(f.home_team_code) || myTeamCodes.has(f.away_team_code);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (fixturesByDate.size === 0) {
    return (
      <Card className="p-8 text-center">
        <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No upcoming league fixtures in the next 2 weeks.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {[...fixturesByDate.entries()].map(([date, dayFixtures]) => (
        <div key={date}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">
            {format(parseISO(date), "EEEE, dd MMMM yyyy")}
          </h2>
          <div className="space-y-2">
            {(dayFixtures || []).map((f) => {
              const mine = isMyFixture(f);
              const result = resultMap.get(f.id);
              return (
                <Card key={f.id} className={`p-3 ${mine ? "border-primary/50 bg-primary/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      {mine && (
                        <Badge className="bg-primary/15 text-primary text-[10px] mb-1">
                          <Star className="w-3 h-3 mr-1" /> Your League
                        </Badge>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold">{f.home_team_code}</span>
                        {result && (result.status === "submitted" || result.status === "confirmed") ? (
                          <>
                            <span className="font-bold text-primary">{result.homePoints}</span>
                            <span className="text-muted-foreground text-xs">-</span>
                            <span className="font-bold text-primary">{result.awayPoints}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">vs</span>
                        )}
                        <span className="font-bold">{f.away_team_code}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {f.venue_name}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{f.division}</Badge>
                        {result?.status === "submitted" && <Badge variant="secondary" className="text-[10px]">Scored</Badge>}
                        {result?.status === "confirmed" && <Badge className="bg-green-500/15 text-green-700 text-[10px]">Confirmed</Badge>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={mine ? "default" : "outline"}
                      className="shrink-0"
                      onClick={() => navigate(`/league-games/${f.id}`)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Set up & Score
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
