import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Calendar, MapPin, ChevronRight, Star, Trophy } from "lucide-react";
import { format, parseISO, addDays, startOfWeek, endOfWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";

export default function LeagueGames() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;

  // Get club's league associations to find linked platform association IDs
  const { data: clubAssociations } = useQuery({
    queryKey: ["league-associations", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("league_associations")
        .select("id, platform_association_id")
        .eq("club_id", clubId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const platformAssocIds = useMemo(() => {
    return (clubAssociations || [])
      .map((a: any) => a.platform_association_id)
      .filter(Boolean) as string[];
  }, [clubAssociations]);

  // Get club's league team codes (e.g. CSI001, CSI002, CSIL01)
  const { data: clubLeagues } = useQuery({
    queryKey: ["club-leagues-codes", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("leagues")
        .select("id, code, name")
        .eq("club_id", clubId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const clubTeamCodes = useMemo(() => {
    return (clubLeagues || []).map((l: any) => l.code).filter(Boolean) as string[];
  }, [clubLeagues]);

  // Get member's league registrations to find their team codes
  const { data: myLeagueRegs } = useQuery({
    queryKey: ["my-league-registrations", activeMember?.id],
    queryFn: async () => {
      if (!activeMember?.id) return [];
      const { data, error } = await supabase
        .from("member_league_registrations")
        .select("*, league:leagues(id, name, code, association_id)")
        .eq("club_member_id", activeMember.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeMember?.id,
  });

  const myTeamCodes = useMemo(() => {
    if (!myLeagueRegs) return new Set<string>();
    return new Set(myLeagueRegs.map((r: any) => r.league?.code).filter(Boolean));
  }, [myLeagueRegs]);

  const myIsCaptain = useMemo(() => {
    return (myLeagueRegs || []).some((r: any) => r.is_captain);
  }, [myLeagueRegs]);

  // Fetch upcoming fixtures for next 2 weeks, filtered by club's team codes
  const today = format(new Date(), "yyyy-MM-dd");
  const twoWeeksOut = format(addDays(new Date(), 14), "yyyy-MM-dd");

  const { data: fixtures, isLoading } = useQuery({
    queryKey: ["upcoming-league-fixtures", today, twoWeeksOut, platformAssocIds.join(","), clubTeamCodes.join(",")],
    queryFn: async () => {
      if (platformAssocIds.length === 0 || clubTeamCodes.length === 0) return [];
      // Fetch all fixtures for the association in the date range
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .in("association_id", platformAssocIds)
        .gte("fixture_date", today)
        .lte("fixture_date", twoWeeksOut)
        .order("fixture_date")
        .order("division");
      if (error) throw error;
      // Filter to only fixtures where this club's team codes appear
      const codes = new Set(clubTeamCodes);
      return (data || []).filter(
        (f) => codes.has(f.home_team_code) || codes.has(f.away_team_code)
      );
    },
    enabled: platformAssocIds.length > 0 && clubTeamCodes.length > 0,
  });

  // Fetch existing results for these fixtures
  const fixtureIds = (fixtures || []).map((f) => f.id);
  const { data: existingResults } = useQuery({
    queryKey: ["league-fixture-results", fixtureIds.join(",")],
    queryFn: async () => {
      if (fixtureIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_fixture_results" as any)
        .select("fixture_id, status")
        .in("fixture_id", fixtureIds);
      if (error) throw error;
      return data || [];
    },
    enabled: fixtureIds.length > 0,
  });

  const resultStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of (existingResults || []) as any[]) {
      map.set(r.fixture_id, r.status);
    }
    return map;
  }, [existingResults]);

  // Group fixtures by date
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

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Games" description="Upcoming league fixtures and scoring" path="/league-games" noIndex />
      <PageHeader title="League Games" subtitle="Upcoming fixtures & scoring" />

      <div className="px-4 space-y-6 pb-8">
        {isLoading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {!isLoading && fixturesByDate.size === 0 && (
          <Card className="p-8 text-center">
            <Trophy className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No upcoming league fixtures in the next 2 weeks.</p>
          </Card>
        )}

        {[...fixturesByDate.entries()].map(([date, dayFixtures]) => (
          <div key={date}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2">
              {format(parseISO(date), "EEEE, dd MMMM yyyy")}
            </h2>
            <div className="space-y-2">
              {(dayFixtures || []).map((f) => {
                const mine = isMyFixture(f);
                const status = resultStatusMap.get(f.id);
                return (
                  <Card
                    key={f.id}
                    className={`p-3 cursor-pointer transition-colors hover:bg-accent/50 ${mine ? "border-primary/50 bg-primary/5" : ""}`}
                    onClick={() => navigate(`/league-games/${f.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        {mine && (
                          <Badge className="bg-primary/15 text-primary text-[10px] mb-1">
                            <Star className="w-3 h-3 mr-1" /> Your League
                          </Badge>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-bold">{f.home_team_code}</span>
                          <span className="text-muted-foreground text-xs">vs</span>
                          <span className="font-bold">{f.away_team_code}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {f.venue_name}
                          </span>
                          <Badge variant="outline" className="text-[10px]">{f.division}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {status === "submitted" && <Badge variant="secondary" className="text-[10px]">Scored</Badge>}
                        {status === "confirmed" && <Badge className="bg-green-500/15 text-green-700 text-[10px]">Confirmed</Badge>}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <BackToDashboard />
    </div>
  );
}
