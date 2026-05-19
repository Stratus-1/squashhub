import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { IndividualStandingsTab } from "@/components/league-games/IndividualStandingsTab";
import { FillUpLeaguesTab } from "@/components/league-games/FillUpLeaguesTab";
import { FixturesTab } from "@/components/league-games/FixturesTab";
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

  // Get club's leagues (with code + id + association_id + NSA mapping)
  const { data: clubLeagues } = useQuery({
    queryKey: ["club-leagues-codes-assoc", clubId],
    queryFn: async () => {
      if (!clubId) return [];
      const { data, error } = await fromExt("leagues")
        .select("id, code, name, association_id, nsa_team_code, logo_url")
        .eq("club_id", clubId!);
      if (error) throw error;
      return (data || []) as Array<{ id: string; code: string | null; name: string; association_id: string | null; nsa_team_code: string | null }>;
    },
    enabled: !!clubId,
  });

  const associations = clubAssociations || [];

  // Selected association (segmented pills). Persisted per-user in localStorage.
  const storageKey = `league-games:selected-assoc:${clubId || "none"}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const urlAssoc = searchParams.get("assoc");
  const urlTab = searchParams.get("tab");
  const [selectedAssocId, setSelectedAssocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(urlTab || "fixtures");

  useEffect(() => {
    if (!associations.length) return;
    // 0. URL param wins
    if (urlAssoc && associations.some((a) => a.id === urlAssoc)) {
      setSelectedAssocId(urlAssoc);
      if (typeof window !== "undefined") localStorage.setItem(storageKey, urlAssoc);
      return;
    }
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
  }, [associations, myPrimaryLeagueReg, storageKey, urlAssoc]);

  useEffect(() => {
    if (urlTab) setActiveTab(urlTab);
  }, [urlTab]);

  const handleSelect = (id: string) => {
    setSelectedAssocId(id);
    if (typeof window !== "undefined") localStorage.setItem(storageKey, id);
  };

  const handleTabChange = (v: string) => {
    setActiveTab(v);
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
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

  // Map of team code -> custom league name (only when admin renamed it from the
  // auto-generated "Men's Nth League YYYY" / "Ladies Nth League YYYY" pattern).
  // This lets fixtures + standings show fun team names like "Cobras vs Penguins".
  const teamNameByCode = useMemo<Record<string, string>>(() => {
    const isDefaultName = (n: string) =>
      /^\s*(?:men'?s?|ladies|ladie|women|mixed)\b.*\bleague\b/i.test(n || "") ||
      /reserves?/i.test(n || "");
    const map: Record<string, string> = {};
    for (const l of leaguesInScope) {
      if (l.code && l.name && !isDefaultName(l.name)) {
        map[l.code.toUpperCase()] = l.name;
      }
    }
    return map;
  }, [leaguesInScope]);

  const teamLogoByCode = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const l of leaguesInScope) {
      if (l.code && (l as any).logo_url) {
        map[l.code.toUpperCase()] = (l as any).logo_url;
      }
    }
    return map;
  }, [leaguesInScope]);

  const myTeamCodes = useMemo(() => {
    const assocId = (myPrimaryLeagueReg as any)?.association_id as string | undefined;
    const code = (myPrimaryLeagueReg as any)?.leagues?.code as string | undefined;
    if (!code) return new Set<string>();
    if (selectedAssocId && assocId && selectedAssocId !== assocId) return new Set<string>();
    return new Set([code]);
  }, [myPrimaryLeagueReg, selectedAssocId]);

  const showSwitcher = associations.length > 1;

  // Hide Fill-Up Leagues for internal/local associations like NIL — captains
  // place players directly when marking a game (Edit Players on the scorecard).
  const hideFillUp = (selectedAssoc?.abbreviation || "").toUpperCase() === "NIL";

  // If the active tab is Fill-Up but it's hidden for this association, fall back.
  useEffect(() => {
    if (hideFillUp && activeTab === "leagues") setActiveTab("fixtures");
  }, [hideFillUp, activeTab]);

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
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className={`grid w-full gap-1 ${
              selectedAssoc?.scope === "internal" && !hideFillUp ? "grid-cols-5"
              : (selectedAssoc?.scope === "internal" && hideFillUp) ? "grid-cols-4"
              : hideFillUp ? "grid-cols-3"
              : "grid-cols-4"
            } h-auto`}>
              <TabsTrigger
                value="fixtures"
                className="text-[10px] sm:text-sm px-1 py-2 font-medium whitespace-normal leading-tight text-center data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow"
              >
                Upcoming
              </TabsTrigger>
              {!hideFillUp && (
                <TabsTrigger
                  value="leagues"
                  className="text-[10px] sm:text-sm px-1 py-2 font-medium whitespace-normal leading-tight text-center data-[state=active]:bg-violet-500 data-[state=active]:text-white data-[state=active]:shadow"
                >
                  <span className="sm:hidden">Fill Up</span>
                  <span className="hidden sm:inline">Fill Up Leagues</span>
                </TabsTrigger>
              )}
              {selectedAssoc?.scope === "internal" && (
                <TabsTrigger
                  value="rounds"
                  className="text-[10px] sm:text-sm px-1 py-2 font-medium whitespace-normal leading-tight text-center data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow"
                >
                  Rounds
                </TabsTrigger>
              )}
              <TabsTrigger
                value="standings"
                className="text-[10px] sm:text-sm px-1 py-2 font-medium whitespace-normal leading-tight text-center data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow"
              >
                <span className="sm:hidden">Standings</span>
                <span className="hidden sm:inline">Team Standings</span>
              </TabsTrigger>
              <TabsTrigger
                value="individuals"
                className="text-[10px] sm:text-sm px-1 py-2 font-medium whitespace-normal leading-tight text-center data-[state=active]:bg-rose-500 data-[state=active]:text-white data-[state=active]:shadow"
              >
                Individuals
              </TabsTrigger>
            </TabsList>

            <TabsContent value="fixtures" className="mt-4">
              <UpcomingFixturesTab
                platformAssocIds={platformAssocIds}
                clubTeamCodes={clubTeamCodes}
                myTeamCodes={myTeamCodes}
                teamNameByCode={teamNameByCode}
                teamLogoByCode={teamLogoByCode}
                weekStart={weekRange.start}
                weekEnd={weekRange.end}
                associationScope={selectedAssoc?.scope ?? "region"}
                clubId={clubId ?? undefined}
                associationId={selectedAssocId ?? undefined}
                externalSource={selectedAssoc?.external_source ?? null}
                externalClubId={selectedAssoc?.external_club_id ?? null}
                weekStartDow={selectedAssoc?.week_start_dow ?? clubWeekDow ?? 3}
              />
            </TabsContent>

            {!hideFillUp && (
              <TabsContent value="leagues" className="mt-4">
                {clubId && selectedAssocId && (
                  <FillUpLeaguesTab
                    clubId={clubId}
                    activeMemberId={activeMember?.id}
                    associationId={selectedAssocId}
                    rulesAssociationId={selectedAssoc?.platform_association_id ?? selectedAssocId}
                    weekStartDow={selectedAssoc?.week_start_dow ?? clubWeekDow ?? 3}
                  />
                )}
              </TabsContent>
            )}

            {selectedAssoc?.scope === "internal" && (
              <TabsContent value="rounds" className="mt-4">
                {clubId && selectedAssocId && (
                  <FixturesTab clubId={clubId} associationId={selectedAssocId} />
                )}
              </TabsContent>
            )}

            <TabsContent value="standings" className="mt-4">
              <StandingsTab
                clubLeagues={leaguesInScope}
                myLeagueCode={(myPrimaryLeagueReg as any)?.leagues?.code ?? null}
                associationScope={selectedAssoc?.scope ?? "region"}
                externalSource={selectedAssoc?.external_source ?? null}
                clubId={clubId}
                associationId={selectedAssocId}
              />
            </TabsContent>

            <TabsContent value="individuals" className="mt-4">
              {clubId && selectedAssocId ? (
                <IndividualStandingsTab
                  clubId={clubId}
                  associationId={selectedAssocId}
                  platformAssocId={selectedAssoc?.platform_association_id ?? null}
                  clubLeagues={leaguesInScope}
                />
              ) : (
                <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                  Select an association to view individual contributions.
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <BackToDashboard />
    </div>
  );
}
