import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";
import { UpcomingFixturesTab } from "@/components/league-games/UpcomingFixturesTab";
import { StandingsTab } from "@/components/league-games/StandingsTab";
import { FillUpLeaguesTab } from "@/components/league-games/FillUpLeaguesTab";
import { format, startOfWeek, addDays } from "date-fns";

export default function LeagueGames() {
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const clubId = clubData?.club?.id;

  // Fetch club's configured squash week start day (Wed=3 by default)
  const { data: weekDow } = useQuery({
    queryKey: ["club-week-dow", clubId],
    queryFn: async () => {
      if (!clubId) return 3;
      const { data } = await supabase.from("clubs").select("league_week_start_dow").eq("id", clubId).maybeSingle();
      return data?.league_week_start_dow ?? 3;
    },
    enabled: !!clubId,
  });

  // Compute the current squash-week start date (most recent occurrence of weekDow on/before today)
  const weekRange = useMemo(() => {
    const dow = weekDow ?? 3;
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    let candidate = addDays(monday, (dow + 6) % 7);
    if (candidate > today) candidate = addDays(candidate, -7);
    // Squash week runs from configured start day through to the same day next week (8 days inclusive)
    const end = addDays(candidate, 7);
    return { start: format(candidate, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
  }, [weekDow]);

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

  const platformAssocIds = useMemo<string[]>(() => {
    return ((clubAssociations || []) as any[])
      .map((a) => a.platform_association_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  }, [clubAssociations]);

  // Get club's leagues (with code + id)
  const { data: clubLeagues } = useQuery({
    queryKey: ["club-leagues-codes", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("leagues")
        .select("id, code, name")
        .eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as Array<{ id: string; code: string | null; name: string }>;
    },
    enabled: !!clubId,
  });

  const clubTeamCodes = useMemo<string[]>(() => {
    return ((clubLeagues || []) as Array<{ code: string | null }>)
      .map((l) => l.code)
      .filter((c): c is string => typeof c === "string" && c.length > 0);
  }, [clubLeagues]);

  // Get current member's league registrations to flag "Your League"
  const { data: myLeagueRegs } = useQuery({
    queryKey: ["my-league-registrations", activeMember?.id],
    queryFn: async () => {
      if (!activeMember?.id) return [];
      const { data, error } = await supabase
        .from("member_league_registrations")
        .select("*, league:leagues(id, name, code)")
        .eq("club_member_id", activeMember.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeMember?.id,
  });

  const myTeamCodes = useMemo(() => {
    if (!myLeagueRegs) return new Set<string>();
    return new Set(
      (myLeagueRegs as any[])
        .map((r) => r.league?.code)
        .filter((c): c is string => typeof c === "string" && c.length > 0)
    );
  }, [myLeagueRegs]);

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Games" description="Upcoming league fixtures, lineups & standings" path="/league-games" noIndex />
      <PageHeader title="League Games" subtitle="Fixtures, lineups & standings" />

      <div className="px-4 pb-8">
        <Tabs defaultValue="fixtures" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="fixtures" className="text-xs sm:text-sm py-2">Upcoming</TabsTrigger>
            <TabsTrigger value="leagues" className="text-xs sm:text-sm py-2">Fill Up Leagues</TabsTrigger>
            <TabsTrigger value="standings" className="text-xs sm:text-sm py-2">Standings</TabsTrigger>
          </TabsList>

          <TabsContent value="fixtures" className="mt-4">
            <UpcomingFixturesTab
              platformAssocIds={platformAssocIds}
              clubTeamCodes={clubTeamCodes}
              myTeamCodes={myTeamCodes}
              weekStart={weekRange.start}
              weekEnd={weekRange.end}
            />
          </TabsContent>

          <TabsContent value="leagues" className="mt-4">
            {clubId && <FillUpLeaguesTab clubId={clubId} activeMemberId={activeMember?.id} />}
          </TabsContent>

          <TabsContent value="standings" className="mt-4">
            <StandingsTab
              platformAssocIds={platformAssocIds}
              clubTeamCodes={clubTeamCodes}
            />
          </TabsContent>
        </Tabs>
      </div>

      <BackToDashboard />
    </div>
  );
}
