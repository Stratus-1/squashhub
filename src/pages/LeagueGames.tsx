import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEO } from "@/components/SEO";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub, useMyLeagueRegistration } from "@/hooks/use-club";
import { UpcomingFixturesTab } from "@/components/league-games/UpcomingFixturesTab";
import { StandingsTab } from "@/components/league-games/StandingsTab";
import { FillUpLeaguesTab } from "@/components/league-games/FillUpLeaguesTab";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfWeek, addDays } from "date-fns";

type AssocRow = {
  id: string;
  name: string;
  abbreviation?: string | null;
  scope?: "internal" | "region" | null;
  platform_association_id?: string | null;
  week_start_dow?: number | null;
  external_source?: string | null;
  external_club_id?: string | null;
};

export default function LeagueGames() {
  const { activeMember } = useMemberContext();
  const { data: clubData } = useMyClub();
  const { data: myPrimaryLeagueReg } = useMyLeagueRegistration(activeMember?.id);
  const clubId = clubData?.club?.id;

  // Fetch club's configured squash week start day (Wed=3 by default) — used as fallback
  const { data: clubWeekDow } = useQuery({
    queryKey: ["club-week-dow", clubId],
    queryFn: async () => {
      if (!clubId) return 3;
      const { data } = await supabase.from("clubs").select("league_week_start_dow").eq("id", clubId).maybeSingle();
      return data?.league_week_start_dow ?? 3;
    },
    enabled: !!clubId,
  });

  // Get club's league associations (with scope + per-league week start + external link)
  const { data: clubAssociations } = useQuery({
    queryKey: ["league-associations-with-week", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("league_associations")
        .select("id, name, abbreviation, scope, platform_association_id, week_start_dow, external_source, external_club_id")
        .eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as AssocRow[];
    },
    enabled: !!clubId,
  });

  // Get club's leagues (with code + id + association_id)
  const { data: clubLeagues } = useQuery({
    queryKey: ["club-leagues-codes-assoc", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("leagues")
        .select("id, code, name, association_id")
        .eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as Array<{ id: string; code: string | null; name: string; association_id: string | null }>;
    },
    enabled: !!clubId,
  });

  const associations = clubAssociations || [];

  // Selected association (segmented pills). Persisted per-user in localStorage.
  const storageKey = `league-games:selected-assoc:${clubId || "none"}`;
  const [selectedAssocId, setSelectedAssocId] = useState<string | null>(null);

  useEffect(() => {
    if (!associations.length) return;
    // 1. Restore last used if still valid
    const stored = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (stored && associations.some((a) => a.id === stored)) {
      setSelectedAssocId(stored);
      return;
    }
    // 2. Default to the association the member plays in
    const myAssocId = (myPrimaryLeagueReg as any)?.association_id as string | undefined;
    const myAssoc = associations.find((a) => a.id === myAssocId);
    setSelectedAssocId((myAssoc || associations[0]).id);
  }, [associations, myPrimaryLeagueReg, storageKey]);

  const handleSelect = (id: string) => {
    setSelectedAssocId(id);
    if (typeof window !== "undefined") localStorage.setItem(storageKey, id);
  };

  const selectedAssoc = useMemo(
    () => associations.find((a) => a.id === selectedAssocId) || null,
    [associations, selectedAssocId]
  );

  // Per-league squash week — fall back to club setting
  const weekRange = useMemo(() => {
    const dow = selectedAssoc?.week_start_dow ?? clubWeekDow ?? 3;
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    let endCandidate = addDays(monday, (dow + 6) % 7);
    if (endCandidate < today) endCandidate = addDays(endCandidate, 7);
    const startCandidate = addDays(endCandidate, -6);
    return { start: format(startCandidate, "yyyy-MM-dd"), end: format(endCandidate, "yyyy-MM-dd") };
  }, [selectedAssoc, clubWeekDow]);

  // Filter platform-linked assoc IDs to the selected one (for fixture queries)
  const platformAssocIds = useMemo<string[]>(() => {
    if (!selectedAssoc?.platform_association_id) return [];
    return [selectedAssoc.platform_association_id];
  }, [selectedAssoc]);

  // Filter leagues to the selected association
  const leaguesInScope = useMemo(
    () => (clubLeagues || []).filter((l) => l.association_id === selectedAssocId),
    [clubLeagues, selectedAssocId]
  );

  const clubTeamCodes = useMemo<string[]>(() => {
    return leaguesInScope.map((l) => l.code).filter((c): c is string => typeof c === "string" && c.length > 0);
  }, [leaguesInScope]);

  const myTeamCodes = useMemo(() => {
    const assocId = (myPrimaryLeagueReg as any)?.association_id as string | undefined;
    const code = (myPrimaryLeagueReg as any)?.leagues?.code as string | undefined;
    if (!code) return new Set<string>();
    if (selectedAssocId && assocId && selectedAssocId !== assocId) return new Set<string>();
    return new Set([code]);
  }, [myPrimaryLeagueReg, selectedAssocId]);

  const showSwitcher = associations.length > 1;

  return (
    <div className="bottom-nav-safe">
      <SEO title="League Games" description="Upcoming league fixtures, lineups & standings" path="/league-games" noIndex />
      <PageHeader title="League Games" subtitle="Fixtures, lineups & standings" />

      <div className="px-4 pb-8">
        {showSwitcher && (
          <div className="mb-4 flex flex-wrap gap-2 p-1 rounded-lg bg-muted/50">
            {associations.map((a) => {
              const active = a.id === selectedAssocId;
              return (
                <Button
                  key={a.id}
                  size="sm"
                  variant={active ? "default" : "ghost"}
                  onClick={() => handleSelect(a.id)}
                  className="h-8"
                >
                  <span className="font-medium">{a.abbreviation || a.name}</span>
                  {a.scope === "internal" && (
                    <Badge variant={active ? "secondary" : "outline"} className="ml-2 text-[9px] px-1 py-0">
                      Internal
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>
        )}

        {associations.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            No league associations set up yet. An admin can add one in Club Admin → Leagues.
          </div>
        ) : (
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
                associationScope={selectedAssoc?.scope ?? "region"}
                clubId={clubId ?? undefined}
                associationId={selectedAssocId ?? undefined}
                externalSource={selectedAssoc?.external_source ?? null}
                externalClubId={selectedAssoc?.external_club_id ?? null}
              />
            </TabsContent>

            <TabsContent value="leagues" className="mt-4">
              {clubId && selectedAssocId && (
                <FillUpLeaguesTab
                  clubId={clubId}
                  activeMemberId={activeMember?.id}
                  associationId={selectedAssocId}
                  weekStartDow={selectedAssoc?.week_start_dow ?? clubWeekDow ?? 3}
                />
              )}
            </TabsContent>

            <TabsContent value="standings" className="mt-4">
              <StandingsTab
                platformAssocIds={platformAssocIds}
                clubTeamCodes={clubTeamCodes}
                associationScope={selectedAssoc?.scope ?? "region"}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <BackToDashboard />
    </div>
  );
}
