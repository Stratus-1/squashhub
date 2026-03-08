import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { SEO } from "@/components/SEO";
import {
  Calendar, Trophy, Swords, ClipboardList,
  ChevronRight, Star, TrendingUp, ArrowUp, ArrowDown, Minus,
  Clock, Users, LogIn, Shield, UserRound
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBookings, useChallenges, useCourtBusyness, useHomeInsights, useLadder, useMyBookings, useMyRoles, useProfile, usePublicLeaderboard } from "@/hooks/use-data";
import { format } from "date-fns";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";
import clubLogo from "@/assets/club-logo.png";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: ladder } = useLadder();
  const { data: publicLeaderboard } = usePublicLeaderboard(10);
  const { data: me } = useProfile();
  const { data: myBookings } = useMyBookings();
  const { data: myChallenges } = useChallenges();
  const { data: myRoles } = useMyRoles();
  const { data: insights } = useHomeInsights(30);
  const { data: busyness } = useCourtBusyness(30);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr);

  const topPlayers = (user ? ladder?.slice(0, 5) : publicLeaderboard?.slice(0, 5)) || [];
  const spotlight = topPlayers.length > 0 ? topPlayers[0] : null;

  const slotsPerCourt = 32; // 06:00–22:00 in 30-min increments
  const bookedCourt1 = (todayBookings || []).filter((b: any) => b.court_id === 1).length;
  const bookedCourt2 = (todayBookings || []).filter((b: any) => b.court_id === 2).length;
  const openCourt1 = Math.max(0, slotsPerCourt - bookedCourt1);
  const openCourt2 = Math.max(0, slotsPerCourt - bookedCourt2);

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const myWinRate = me && me.matches_played > 0
    ? Math.round((me.wins / me.matches_played) * 100)
    : 0;

  const incomingPendingCount = user
    ? (myChallenges || []).filter((c) => c.status === "pending" && c.opponent_id === user.id).length
    : 0;

  const activeChallengesCount = (myChallenges || []).filter((c) => c.status === "pending" || c.status === "accepted").length;

  const nextBooking = (myBookings || [])[0] || null;
  const canOpenAdmin = (myRoles || []).includes("admin") || (myRoles || []).includes("moderator");

  return (
    <div className="min-h-screen bg-background bottom-nav-safe">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="Squash court" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--court))]/90 via-[hsl(var(--court))]/70 to-background" />
        </div>

        <div className="relative z-10 w-full px-4 sm:px-6 lg:px-[5%] pt-12 pb-10">
          {/* Nav bar */}
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2">
              <img src={clubLogo} alt="GB Squash" className="w-9 h-9 rounded-lg" />
              <span className="font-heading font-bold text-sm text-primary-foreground">GB Squash</span>
            </div>
            {!user ? (
              <Button
                size="sm"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                onClick={() => navigate("/auth")}
              >
                <LogIn className="w-4 h-4 mr-1" /> Sign In
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <NotificationsDropdown
                  triggerVariant="outline"
                  triggerClassName="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                  onClick={() => navigate("/dashboard")}
                >
                  Dashboard
                </Button>
              </div>
            )}
          </div>

          {/* Hero content */}
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-foreground leading-tight mb-3">
              Gordon's Bay<br />Squash Club
            </h1>
            <p className="text-primary-foreground/80 text-sm sm:text-base leading-relaxed mb-6 max-w-none w-[92%] sm:w-[70%] lg:w-[55%]">
              Book courts, challenge players, and track your performance — all in one place.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-col sm:flex-row gap-3"
            {...fadeUp}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold w-full sm:w-auto"
              onClick={() => navigate(user ? "/bookings" : "/auth")}
            >
              <Calendar className="w-4 h-4 mr-1.5" /> Book a Court
            </Button>
            <Button
              variant="outline"
              className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10 w-full sm:w-auto"
              onClick={() => navigate(user ? "/ladder" : "/auth")}
            >
              <Trophy className="w-4 h-4 mr-1.5" /> View Ladder
            </Button>
          </motion.div>

          {/* Live stats strip */}
          <motion.div
            className="flex flex-wrap gap-2 sm:gap-3 mt-8"
            {...fadeUp}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            {user ? (
              <>
                <div className="flex items-center gap-2 bg-primary-foreground/10 rounded-full px-3.5 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-medium text-primary-foreground">
                    Court 1: {openCourt1} open
                  </span>
                </div>
                <div className="flex items-center gap-2 bg-primary-foreground/10 rounded-full px-3.5 py-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-medium text-primary-foreground">
                    Court 2: {openCourt2} open
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 bg-primary-foreground/10 rounded-full px-3.5 py-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary-foreground/70" />
                <span className="text-xs font-medium text-primary-foreground">
                  Public leaderboard live
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-primary-foreground/10 rounded-full px-3.5 py-1.5">
              <Users className="w-3.5 h-3.5 text-primary-foreground/70" />
              <span className="text-xs font-medium text-primary-foreground">
                {user ? (ladder?.length || 0) : (publicLeaderboard?.length || 0)} players
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      <div className="w-full">
      {/* Logged-in Overview */}
      {user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] -mt-1 relative z-20"
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="font-heading font-semibold text-base truncate">
                Welcome back{me?.name ? `, ${me.name.split(" ")[0]}` : ""}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your stats, challenges, and upcoming bookings.
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/profile")}>
              <UserRound className="w-4 h-4 mr-1.5" /> Profile
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/ladder")}>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Rank</p>
                <p className="font-heading font-bold text-lg mt-1">
                  {typeof me?.rank === "number" ? `#${me.rank}` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {typeof me?.rank === "number" ? "On the ladder" : "Not ranked yet"}
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/profile")}>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Record</p>
                <p className="font-heading font-bold text-lg mt-1">
                  {(me?.wins ?? 0)}-{(me?.losses ?? 0)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {myWinRate}% win · {me?.matches_played ?? 0} played
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/challenges")}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Challenges</p>
                  {incomingPendingCount > 0 ? (
                    <Badge variant="secondary" className="text-[10px] bg-primary/15 text-primary">
                      {incomingPendingCount} new
                    </Badge>
                  ) : null}
                </div>
                <p className="font-heading font-bold text-lg mt-1">{activeChallengesCount}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Active (pending/accepted)
                </p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/bookings")}>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next booking</p>
                <p className="font-heading font-bold text-lg mt-1">
                  {nextBooking ? String(nextBooking.start_time || "").slice(0, 5) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  {nextBooking
                    ? `${nextBooking.court_name || `Court ${nextBooking.court_id}`} · ${nextBooking.date}${nextBooking.opponent_name ? ` · vs ${nextBooking.opponent_name}` : ""}`
                    : "No upcoming booking"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
            <Button className="justify-start" variant="secondary" onClick={() => navigate("/bookings")}>
              <Calendar className="w-4 h-4 mr-2" /> Book
            </Button>
            <Button className="justify-start" variant="secondary" onClick={() => navigate("/challenges/new")}>
              <Swords className="w-4 h-4 mr-2" /> Challenge
            </Button>
            <Button className="justify-start" variant="secondary" onClick={() => navigate("/ladder")}>
              <Trophy className="w-4 h-4 mr-2" /> Ladder
            </Button>
            <Button className="justify-start" variant="secondary" onClick={() => navigate("/challenges")}>
              <ClipboardList className="w-4 h-4 mr-2" /> Matches
            </Button>
            {canOpenAdmin ? (
              <Button className="justify-start" variant="secondary" onClick={() => navigate("/admin")}>
                <Shield className="w-4 h-4 mr-2" /> Admin
              </Button>
            ) : (
              <Button className="justify-start" variant="secondary" onClick={() => navigate("/profile")}>
                <UserRound className="w-4 h-4 mr-2" /> Me
              </Button>
            )}
          </div>
        </motion.section>
      )}

      {/* Club Insights */}
      {user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-8"
          {...fadeUp}
          transition={{ delay: 0.32 }}
        >
          <div className="flex items-end justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2 className="font-heading font-semibold text-base">Club Insights</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {insights?.range ? `Last ${insights.range.days} days` : "Loading…"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                <p className="font-heading font-bold text-lg mt-1">{insights?.totals?.sessions ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Bookings played</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg session</p>
                <p className="font-heading font-bold text-lg mt-1">
                  {typeof insights?.totals?.avg_session_minutes === "number" ? `${insights.totals.avg_session_minutes}m` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">Based on bookings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Busiest day</p>
                <p className="font-heading font-bold text-lg mt-1">{insights?.busiest?.day ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {typeof insights?.busiest?.day_count === "number" ? `${insights.busiest.day_count} sessions` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Busiest time</p>
                <p className="font-heading font-bold text-lg mt-1">{insights?.busiest?.slot ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {typeof insights?.busiest?.slot_count === "number" ? `${insights.busiest.slot_count} bookings` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-3 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">When the courts are busiest</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bookings per 30-min slot (both courts combined)
                  </p>
                </div>
                {insights?.busiest?.slot ? (
                  <Badge variant="secondary" className="shrink-0">
                    Peak: {insights.busiest.slot}
                  </Badge>
                ) : null}
              </div>

              {busyness && busyness.length > 0 ? (
                <div className="mt-4">
                  <div className="flex items-end gap-1 overflow-x-auto pb-2">
                    {(() => {
                      const max = Math.max(...busyness.map((b) => Number(b.bookings_count || 0)), 1);
                      return busyness.map((b) => {
                        const c = Number(b.bookings_count || 0);
                        const h = Math.max(2, Math.round((c / max) * 64));
                        const isPeak = insights?.busiest?.slot && b.slot === insights.busiest.slot;
                        return (
                          <div key={b.slot} className="shrink-0 flex flex-col items-center gap-1">
                            <div
                              title={`${b.slot} — ${c} bookings`}
                              className={`w-3 rounded-sm ${isPeak ? "bg-accent" : c > 0 ? "bg-primary/60" : "bg-muted"}`}
                              style={{ height: `${h}px` }}
                            />
                            <span className="text-[9px] text-muted-foreground">
                              {b.slot.endsWith(":00") ? b.slot.slice(0, 2) : ""}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Tip: tap/hover a bar to see the slot and count.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-4">No data yet.</p>
              )}
            </CardContent>
          </Card>

          {(insights?.top_players?.length || 0) > 0 && (
            <Card className="mt-3">
              <CardContent className="p-4">
                <p className="text-sm font-semibold">Most active players</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Players with the most sessions in the last {insights?.range?.days ?? 30} days
                </p>
                <div className="mt-3 space-y-2">
                  {insights!.top_players.slice(0, 5).map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground w-5 text-right">{idx + 1}</span>
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {p.sessions}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.section>
      )}

      {/* Public view: hide shortcuts until logged in */}

      {/* Ladder Rankings */}
      <motion.section
        className="px-4 sm:px-6 lg:px-[5%] mt-8"
        {...fadeUp}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-base">{user ? "Ladder Rankings" : "Leaderboard"}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-primary"
            onClick={() => navigate(user ? "/ladder" : "/auth")}
          >
            {user ? "View Full Ladder" : "Sign in for full ladder"} <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {topPlayers.length > 0 ? (
              <div className="divide-y divide-border">
                {topPlayers.map((player, i) => {
                  const winPct = player.matches_played > 0
                    ? Math.round((player.wins / player.matches_played) * 100)
                    : 0;
                  return (
                    <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={`w-7 text-center font-heading font-bold text-sm ${i < 3 ? "text-primary" : "text-muted-foreground"}`}>
                        {i < 3 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10">
                            {player.rank}
                          </span>
                        ) : player.rank}
                      </span>
                      <PlayerAvatar initials={getInitials(player.name)} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{player.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {player.matches_played}M · {player.wins}W · {winPct}%
                        </p>
                      </div>
                      {i < 3 && (
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          <Star className="w-3 h-3 mr-0.5" /> Top 3
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No ranked players yet.
              </div>
            )}
          </CardContent>
        </Card>

        {!user && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => navigate("/auth")} className="w-full">
              <LogIn className="w-4 h-4 mr-2" /> Sign in
            </Button>
            <Button variant="outline" onClick={() => navigate("/auth")} className="w-full">
              Join & play <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </motion.section>

      {/* Court Availability */}
      {user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-8"
          {...fadeUp}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold text-base">Today's Courts</h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-primary"
              onClick={() => navigate("/bookings")}
            >
              Book Now <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((courtId) => {
              const courtBookings = todayBookings?.filter(b => b.court_id === courtId) || [];
              return (
                <Card key={courtId} className="overflow-hidden">
                  <div className="h-2 bg-primary" />
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-heading font-bold text-sm">Court {courtId}</span>
                      <Badge
                        variant={courtBookings.length < 28 ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {Math.max(0, 32 - courtBookings.length)} open
                      </Badge>
                    </div>
                    {courtBookings.length > 0 ? (
                      <div className="space-y-1.5">
                        {courtBookings.slice(0, 3).map((b) => (
                          <div key={b.id} className="flex items-center gap-2 text-xs">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {b.start_time?.slice(0, 5)} — {b.player_name}
                              {b.opponent_name ? ` vs ${b.opponent_name}` : ""}
                            </span>
                          </div>
                        ))}
                        {courtBookings.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">
                            +{courtBookings.length - 3} more
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">All slots available</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Player Spotlight */}
      {spotlight && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-8"
          {...fadeUp}
          transition={{ delay: 0.45 }}
        >
          <h2 className="font-heading font-semibold text-base mb-3">Player Spotlight</h2>
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-primary to-accent" />
            <CardContent className="p-5 flex items-center gap-4">
              <PlayerAvatar
                initials={getInitials(spotlight.name)}
                rank={spotlight.rank}
                size="lg"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                    Top Ranked Player
                  </span>
                </div>
                <p className="font-heading font-bold text-lg">{spotlight.name}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {spotlight.wins}W – {spotlight.losses}L
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Rank #{spotlight.rank}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      )}

      {/* Join CTA for unauthenticated */}
      {!user && (
        <motion.section
          className="px-4 sm:px-6 lg:px-[5%] mt-10 mb-8"
          {...fadeUp}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-primary text-primary-foreground overflow-hidden">
            <CardContent className="p-6 text-center">
              <h3 className="font-heading font-bold text-xl mb-2">Join the Club</h3>
              <p className="text-sm text-primary-foreground/80 mb-5">
                Sign up to book courts, challenge players, and climb the ladder.
              </p>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                onClick={() => navigate("/auth")}
              >
                Get Started — It's Free
              </Button>
            </CardContent>
          </Card>
        </motion.section>
      )}

      {/* Footer */}
      <footer className="px-4 sm:px-6 lg:px-[5%] py-6 text-center border-t border-border mt-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Gordon's Bay Squash Club
        </p>
      </footer>
      </div>
    </div>
  );
}
