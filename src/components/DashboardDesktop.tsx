import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Calendar, ChevronRight, Trophy, History, CalendarDays, Plus, Users, Timer, Activity } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import squashCourtBg from "@/assets/squash-court-bg.jpg";
import { useClubAnalytics } from "@/hooks/use-analytics";

interface DashboardDesktopProps {
  clubName: string;
  clubLogoUrl?: string | null;
  firstName: string;
  // stats
  played: number;
  wins: number;
  losses: number;
  winRate: number; // 0..100
  rank: number | null;
  totalBookings: number;
  courtsUsed: number;
  // bookings
  myBookings: any[];
  // collapsible content
  recentMatches: any[];
  matchPlayerNameMap: Map<string, string>;
  effectiveUserId: string | undefined;
  myMemberId: string | null;
  myLeagueFixtures: any[];
  hasLeagues: boolean;
  // children for slot-in components (events list, etc.)
  eventsSlot?: React.ReactNode;
}

type StatsScope = "me" | "club";

export function DashboardDesktop(props: DashboardDesktopProps) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<StatsScope>("me");
  const { data: clubStats } = useClubAnalytics(30);

  const winRate = Math.max(0, Math.min(100, Math.round(props.winRate)));
  // Club "win rate" = confirmation rate over last 30 days
  const clubConfirmRate =
    clubStats && clubStats.total_matches > 0
      ? Math.round((clubStats.confirmed_matches / clubStats.total_matches) * 100)
      : 0;
  const displayedRate = scope === "club" ? clubConfirmRate : winRate;
  // Radial conic gradient ring
  const ringStyle = useMemo(
    () => ({
      background: `conic-gradient(hsl(var(--primary)) ${displayedRate * 3.6}deg, hsl(var(--muted-foreground) / 0.25) 0deg)`,
    }),
    [displayedRate]
  );

  const StatTile = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md p-4 flex flex-col justify-between min-h-[110px]">
      <span className="text-xs text-white/70 uppercase tracking-wider">{label}</span>
      <span className="text-3xl font-heading font-bold text-white tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-2.5rem)]">
      <div>
        <div className="px-8 pt-5 pb-4 flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              {props.clubLogoUrl && (
                <img src={props.clubLogoUrl} alt="Club logo" className="h-5 w-5 object-contain rounded-sm shrink-0" />
              )}
              <p className="text-xs uppercase tracking-[0.18em] text-white/65 font-heading whitespace-nowrap">
                {clubLabel(props.clubName)}
              </p>
            </div>
            <h1 className="text-2xl font-heading font-bold text-white uppercase tracking-[0.08em] truncate">
              Welcome back, {props.firstName}
            </h1>
          </div>
        </div>

      <div className="px-8 pb-8 grid grid-cols-12 gap-5">
        {/* STATS card */}
        <div className="col-span-12 xl:col-span-7">
          <Card className="bg-[hsl(220_45%_8%/0.85)] border-white/10 backdrop-blur-md p-5 rounded-2xl">
            {/* Toggle pill */}
            <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-white/10 mb-5">
              <button
                onClick={() => setScope("me")}
                className={cn(
                  "py-2.5 text-sm font-heading uppercase tracking-[0.18em] transition-colors",
                  scope === "me"
                    ? "bg-white text-[hsl(220_45%_10%)]"
                    : "bg-transparent text-white/80"
                )}
              >
                My Stats
              </button>
              <button
                onClick={() => setScope("club")}
                className={cn(
                  "py-2.5 text-sm font-heading uppercase tracking-[0.18em] transition-colors",
                  scope === "club"
                    ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                    : "bg-transparent text-white/80"
                )}
              >
                Club
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Rate radial */}
              <div className="rounded-xl bg-white/[0.04] border border-white/10 p-4 flex flex-col justify-between row-span-2 min-h-[230px]">
                <span className="text-xs text-white/70 uppercase tracking-wider">
                  {scope === "club" ? "Confirmed rate" : "Win rate"}
                </span>
                <div className="flex-1 flex items-center justify-center">
                  <div
                    className="w-28 h-28 rounded-full grid place-items-center"
                    style={ringStyle}
                  >
                    <div className="w-[88px] h-[88px] rounded-full bg-[hsl(220_45%_8%)] grid place-items-center">
                      <span className="text-2xl font-heading font-bold text-white">
                        {displayedRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {scope === "me" ? (
                <>
                  <StatTile label="Played" value={props.played} />
                  <StatTile label="Wins" value={props.wins} />
                  <StatTile label="Losses" value={props.losses} />
                  <StatTile label="Rank" value={props.rank != null ? `#${props.rank}` : "—"} />
                </>
              ) : (
                <>
                  <StatTile label="Total Matches" value={clubStats?.total_matches ?? 0} />
                  <StatTile label="Active Players" value={clubStats?.active_players ?? 0} />
                  <StatTile
                    label="Avg Duration"
                    value={clubStats?.avg_duration_min != null ? `${Math.round(clubStats.avg_duration_min)}m` : "—"}
                  />
                  <StatTile label="Confirmed" value={clubStats?.confirmed_matches ?? 0} />
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-white/70 uppercase tracking-wider">
                  {scope === "club" ? "Club Bookings (30d)" : "Total Bookings"}
                </span>
                <span className="text-2xl font-heading font-bold text-white tabular-nums">
                  {scope === "club" ? clubStats?.total_bookings ?? 0 : props.totalBookings}
                </span>
              </div>
              <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-white/70 uppercase tracking-wider">
                  {scope === "club" ? "Top Players" : "Courts Used"}
                </span>
                <span className="text-2xl font-heading font-bold text-white tabular-nums">
                  {scope === "club" ? (clubStats?.top_players?.length ?? 0) : props.courtsUsed}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* BOOKINGS card */}
        <div className="col-span-12 xl:col-span-5">
          <Card className="bg-[hsl(220_45%_8%/0.85)] border-white/10 backdrop-blur-md p-5 rounded-2xl h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold text-white uppercase tracking-[0.14em]">
                Your Bookings
              </h2>
              <Button
                size="sm"
                onClick={() => navigate("/bookings")}
                className="bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/90 text-[hsl(var(--accent-foreground))] font-heading uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Book Court
              </Button>
            </div>

            {props.myBookings.length > 0 ? (
              <div className="space-y-2">
                {props.myBookings.slice(0, 4).map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => navigate("/bookings")}
                    className="w-full grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors text-left"
                  >
                    <Badge className="bg-white/10 text-white border-0 text-[11px] font-heading uppercase">
                      {(b.club_short_code || b.club_name || "Club").slice(0, 6).toUpperCase()}
                    </Badge>
                    <span className="text-sm text-white/90 truncate">
                      {b.court_name || `Court ${b.court_id}`}
                    </span>
                    <span className="text-xs tabular-nums text-white/70">
                      {b.start_time?.slice(0, 5)} - {b.end_time?.slice(0, 5)}
                    </span>
                    <span className="text-xs tabular-nums text-white/70 hidden sm:inline">
                      {b.date ? format(parseISO(b.date), "dd/MM/yyyy") : ""}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-white/60">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No upcoming bookings
              </div>
            )}
          </Card>
        </div>

        {/* Collapsible sections */}
        <div className="col-span-12 mt-2">
          <Accordion type="multiple" className="space-y-3">
            <AccordionItem
              value="results"
              className="bg-[hsl(220_45%_8%/0.85)] border border-white/10 rounded-2xl backdrop-blur-md px-5 overflow-hidden"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <span className="flex items-center gap-2 text-white font-heading uppercase tracking-[0.18em] text-base">
                  <History className="w-4 h-4" /> Your Match Results
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {props.recentMatches.length > 0 ? (
                  <div className="space-y-2 pb-2">
                    {props.recentMatches.slice(0, 8).map((m: any) => {
                      const isA = m.player_a === props.effectiveUserId || (props.myMemberId && m.player_a_member_id === props.myMemberId);
                      const p1 = props.matchPlayerNameMap.get(m.player_a) || props.matchPlayerNameMap.get(m.player_a_member_id) || "Player 1";
                      const p2 = props.matchPlayerNameMap.get(m.player_b) || props.matchPlayerNameMap.get(m.player_b_member_id) || "Player 2";
                      const opponent = isA ? p2 : p1;
                      const won = m.winner_id === props.effectiveUserId || (props.myMemberId && m.winner_member_id === props.myMemberId);
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-white/90 truncate">vs {opponent}</p>
                            <p className="text-[11px] text-white/60">{m.match_date}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {m.score && (
                              <Badge variant="outline" className="text-[10px] tabular-nums border-white/20 text-white/80">
                                {m.score}
                              </Badge>
                            )}
                            <Badge
                              className={cn(
                                "text-[10px]",
                                won
                                  ? "bg-[hsl(var(--win))]/20 text-[hsl(var(--win))] border-[hsl(var(--win))]/40"
                                  : "bg-[hsl(var(--loss))]/20 text-[hsl(var(--loss))] border-[hsl(var(--loss))]/40"
                              )}
                            >
                              {m.winner_id || m.winner_member_id ? (won ? "Won" : "Lost") : "Pending"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-white/60 py-4 text-center">No match results yet</p>
                )}
              </AccordionContent>
            </AccordionItem>

            {props.hasLeagues && (
              <AccordionItem
                value="leagues"
                className="bg-[hsl(220_45%_8%/0.85)] border border-white/10 rounded-2xl backdrop-blur-md px-5 overflow-hidden"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <span className="flex items-center gap-2 text-white font-heading uppercase tracking-[0.18em] text-base">
                    <Trophy className="w-4 h-4" /> League Games
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {props.myLeagueFixtures.length > 0 ? (
                    <div className="space-y-2 pb-2">
                      {props.myLeagueFixtures.slice(0, 5).map((f: any) => (
                        <button
                          key={f.id}
                          onClick={() => navigate(`/league-games/${f.id}`)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors text-left"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-white/90 truncate">
                              {f.home_team_code} <span className="text-white/50">vs</span> {f.away_team_code}
                            </p>
                            <p className="text-[11px] text-white/60 truncate">
                              {format(parseISO(f.fixture_date), "EEE dd MMM")}
                              {f.venue_name ? ` · ${f.venue_name}` : ""}
                            </p>
                          </div>
                          <Badge className={cn("text-[10px] shrink-0", f.inLineup ? "bg-[hsl(var(--accent))]/20 text-[hsl(var(--accent))] border-[hsl(var(--accent))]/40" : "bg-white/10 text-white/80 border-white/20")}>
                            {f.inLineup ? "You're playing" : "Your league"}
                          </Badge>
                          <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-white/60 py-4 text-center">No upcoming league fixtures</p>
                  )}
                  <div className="pb-2">
                    <Button variant="ghost" size="sm" onClick={() => navigate("/league-games")} className="text-white/80 hover:text-white hover:bg-white/10 w-full">
                      View all league games <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            <AccordionItem
              value="events"
              className="bg-[hsl(220_45%_8%/0.85)] border border-white/10 rounded-2xl backdrop-blur-md px-5 overflow-hidden"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <span className="flex items-center gap-2 text-white font-heading uppercase tracking-[0.18em] text-base">
                  <CalendarDays className="w-4 h-4" /> Club Events
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pb-2">
                  {props.eventsSlot ?? (
                    <Button variant="ghost" size="sm" onClick={() => navigate("/events")} className="text-white/80 hover:text-white hover:bg-white/10 w-full">
                      View all events <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
      </div>
    </div>
  );
}

function clubLabel(name: string) {
  return name?.toUpperCase() || "MY CLUB";
}
