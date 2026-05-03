import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Trophy, ChevronRight, Loader2, Calendar, User, BarChart3, Gavel } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";

const GENDER_LABELS: Record<string, string> = { men: "Men's", ladies: "Ladies'", mixed: "Mixed" };

export default function Tournaments() {
  const navigate = useNavigate();
  const { club: contextClub } = useClubContext();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const clubId = contextClub?.id || clubData?.club?.id;
  const memberId = activeMember?.id;

  const { data: champs = [], isLoading: champsLoading } = useQuery({
    queryKey: ["tournaments-list", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_champs")
        .select("*")
        .eq("club_id", clubId!)
        .neq("status", "completed")
        .order("start_date");
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const champIds = champs.map((c: any) => c.id);

  const { data: allEntries = [] } = useQuery({
    queryKey: ["tournaments-all-entries", champIds],
    queryFn: async () => {
      if (!champIds.length) return [];
      const { data, error } = await fromExt("club_champs_entries")
        .select("*, club_members:club_member_id(id, name, profiles:user_id(name)), partner:partner_member_id(id, name, profiles:user_id(name))")
        .in("champ_id", champIds);
      if (error) throw error;
      return data || [];
    },
    enabled: champIds.length > 0,
  });

  // Upcoming matches across all tournaments (next 21 days)
  const { data: upcomingMatches = [] } = useQuery({
    queryKey: ["tournaments-upcoming-matches", champIds],
    queryFn: async () => {
      if (!champIds.length) return [];
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await fromExt("club_champs_matches")
        .select("*, player_a:player_a_member_id(id, name, profiles:user_id(name)), player_b:player_b_member_id(id, name, profiles:user_id(name)), partner_a:partner_a_member_id(id, name, profiles:user_id(name)), partner_b:partner_b_member_id(id, name, profiles:user_id(name)), court:court_id(name)")
        .in("champ_id", champIds)
        .eq("status", "scheduled")
        .gte("scheduled_date", today)
        .order("scheduled_date")
        .order("scheduled_time");
      if (error) throw error;
      return data || [];
    },
    enabled: champIds.length > 0,
  });

  const getName = (p: any) => p?.name || p?.profiles?.name || "Unknown";
  const getTeam = (a: any, b: any) => (b ? `${getName(a)} & ${getName(b)}` : getName(a));

  const myUpcoming = memberId
    ? upcomingMatches.filter(
        (m: any) =>
          m.player_a_member_id === memberId ||
          m.player_b_member_id === memberId ||
          m.partner_a_member_id === memberId ||
          m.partner_b_member_id === memberId,
      )
    : [];

  const renderMatchRow = (m: any) => {
    const champ = champs.find((c: any) => c.id === m.champ_id);
    const isDoubles = champ?.match_type === "doubles";
    const teamA = isDoubles ? getTeam(m.player_a, m.partner_a) : getName(m.player_a);
    const teamB = isDoubles ? getTeam(m.player_b, m.partner_b) : getName(m.player_b);
    const matchDate = m.scheduled_date ? new Date(m.scheduled_date) : null;
    const today = matchDate && isToday(matchDate);

    return (
      <div
        key={m.id}
        className={cn(
          "w-full flex items-center gap-2 text-sm p-2 rounded",
          today ? "bg-primary/10 border border-primary/20" : "bg-muted/50",
        )}
      >
        <button
          onClick={() => navigate(`/club-champs/${m.champ_id}`)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground w-24 shrink-0">
            {matchDate ? format(matchDate, "EEE dd MMM") : "TBD"}
          </span>
          <span className="text-muted-foreground w-12 shrink-0">{m.scheduled_time?.slice(0, 5) || ""}</span>
          <span className="font-medium truncate">
            {teamA} vs {teamB}
          </span>
          {champ && (
            <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
              {champ.name}
            </Badge>
          )}
          {m.court && <Badge variant="outline" className="text-[10px] shrink-0">{m.court.name}</Badge>}
          {today && <Badge className="text-[10px] shrink-0">Today</Badge>}
        </button>
        <Button
          size="sm"
          variant="default"
          className="h-7 px-2 gap-1 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/match-marker?source=tournament&matchId=${m.id}`);
          }}
        >
          <Gavel className="w-3 h-3" /> Mark
        </Button>
      </div>
    );
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Tournaments" description="Club championships and internal leagues" path="/tournaments" noIndex />
      <PageHeader title="Tournaments" subtitle="Championships & internal leagues" />

      <div className="px-4 sm:px-6 lg:px-[5%] mt-3 mb-20">
        {champsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : champs.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No active tournaments at the moment
          </Card>
        ) : (
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-auto">
              <TabsTrigger value="upcoming" className="text-xs sm:text-sm py-2">Upcoming</TabsTrigger>
              <TabsTrigger value="fill" className="text-xs sm:text-sm py-2">Fill Up Tournaments</TabsTrigger>
              <TabsTrigger value="standings" className="text-xs sm:text-sm py-2">Standings</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4 space-y-4">
              {memberId && myUpcoming.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4" /> My Fixtures
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">{myUpcoming.slice(0, 8).map(renderMatchRow)}</div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> All Upcoming Tournament Games
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingMatches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No scheduled games.</p>
                  ) : (
                    <div className="space-y-1.5">{upcomingMatches.slice(0, 30).map(renderMatchRow)}</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fill" className="mt-4 space-y-4">
              {champs.map((champ: any) => {
                const champEntries = allEntries.filter((e: any) => e.champ_id === champ.id);
                const isDoubles = champ.match_type === "doubles";
                const isMyChamp =
                  memberId &&
                  champEntries.some(
                    (e: any) => e.club_member_id === memberId || e.partner_member_id === memberId,
                  );

                return (
                  <Card key={champ.id} className={cn(isMyChamp && "border-primary/30")}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {champ.name}
                            {isMyChamp && (
                              <Badge variant="secondary" className="text-[10px]">Entered</Badge>
                            )}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {GENDER_LABELS[champ.gender] || champ.gender} {isDoubles ? "Doubles" : "Singles"}
                            {" · "}
                            {champ.start_date} to {champ.end_date}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-1"
                          onClick={() => navigate(`/club-champs/${champ.id}`)}
                        >
                          View <ChevronRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>
                          {champEntries.length} {isDoubles ? "teams" : "players"}
                        </span>
                        <span>{champ.num_groups} groups</span>
                        <Badge variant={champ.status === "active" ? "default" : "secondary"} className="text-[10px]">
                          {champ.status}
                        </Badge>
                      </div>

                      {champEntries.length > 0 && (
                        <div className="mt-3">
                          <Separator className="mb-2" />
                          <div className="flex flex-wrap gap-1.5">
                            {champEntries.map((e: any) => {
                              const name = isDoubles
                                ? getTeam(e.club_members, e.partner)
                                : getName(e.club_members);
                              const isMe =
                                memberId &&
                                (e.club_member_id === memberId || e.partner_member_id === memberId);
                              return (
                                <Badge
                                  key={e.id}
                                  variant={isMe ? "default" : "outline"}
                                  className="text-[10px]"
                                >
                                  G{e.group_number} · {name}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="standings" className="mt-4 space-y-3">
              {champs.map((champ: any) => (
                <Card key={champ.id}>
                  <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-primary" /> {champ.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {GENDER_LABELS[champ.gender] || champ.gender} ·{" "}
                        {champ.match_type === "doubles" ? "Doubles" : "Singles"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => navigate(`/club-champs/${champ.id}`)}
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> View Standings
                    </Button>
                  </CardHeader>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <BackToDashboard />
    </div>
  );
}
