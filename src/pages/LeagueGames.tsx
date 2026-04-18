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
import { FillTeamsTab } from "@/components/league-games/FillTeamsTab";
import { StandingsTab } from "@/components/league-games/StandingsTab";
import { FillUpLeaguesTab } from "@/components/league-games/FillUpLeaguesTab";

export default function LeagueGames() {
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
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="fixtures" className="text-xs sm:text-sm py-2">Upcoming</TabsTrigger>
            <TabsTrigger value="fill" className="text-xs sm:text-sm py-2">Fill Teams</TabsTrigger>
            <TabsTrigger value="leagues" className="text-xs sm:text-sm py-2">Fill Up Leagues</TabsTrigger>
            <TabsTrigger value="standings" className="text-xs sm:text-sm py-2">Standings</TabsTrigger>
          </TabsList>

          <TabsContent value="fixtures" className="mt-4">
            <UpcomingFixturesTab
              platformAssocIds={platformAssocIds}
              clubTeamCodes={clubTeamCodes}
              myTeamCodes={myTeamCodes}
            />
          </TabsContent>

          <TabsContent value="fill" className="mt-4">
            {clubId && (
              <FillTeamsTab
                clubId={clubId}
                platformAssocIds={platformAssocIds}
                clubLeagues={clubLeagues || []}
              />
            )}
          </TabsContent>

          <TabsContent value="leagues" className="mt-4">
            {clubId && <FillUpLeaguesTab clubId={clubId} />}
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
