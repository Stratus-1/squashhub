import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import {
  Calendar, Trophy, Swords, BarChart3, ClipboardList,
  ChevronRight, Star, TrendingUp, ArrowUp, ArrowDown, Minus,
  Clock, Users, LogIn
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLadder, useBookings } from "@/hooks/use-data";
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
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: todayBookings } = useBookings(todayStr);

  const topPlayers = ladder?.slice(0, 5) || [];
  const spotlight = topPlayers.length > 0 ? topPlayers[0] : null;

  const totalSlots = 2 * 12; // 2 courts × 12 slots
  const bookedCount = todayBookings?.length || 0;
  const availableSlots = Math.max(0, totalSlots - bookedCount);

  const getInitials = (name: string) =>
    name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} alt="Squash court" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--court))]/90 via-[hsl(var(--court))]/70 to-background" />
        </div>

        <div className="relative z-10 px-5 pt-12 pb-10">
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
              <Button
                size="sm"
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                onClick={() => navigate("/")}
              >
                Dashboard
              </Button>
            )}
          </div>

          {/* Hero content */}
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h1 className="font-heading text-3xl font-bold text-primary-foreground leading-tight mb-3">
              Gordon's Bay<br />Squash Club
            </h1>
            <p className="text-primary-foreground/80 text-sm leading-relaxed mb-6 max-w-xs">
              Book courts, challenge players, and track your performance — all in one place.
            </p>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            className="flex gap-3"
            {...fadeUp}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
              onClick={() => navigate(user ? "/bookings" : "/auth")}
            >
              <Calendar className="w-4 h-4 mr-1.5" /> Book a Court
            </Button>
            <Button
              variant="outline"
              className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
              onClick={() => navigate(user ? "/ladder" : "/auth")}
            >
              <Trophy className="w-4 h-4 mr-1.5" /> View Ladder
            </Button>
          </motion.div>

          {/* Live stats strip */}
          <motion.div
            className="flex gap-3 mt-8"
            {...fadeUp}
            transition={{ delay: 0.25, duration: 0.5 }}
          >
            <div className="flex items-center gap-2 bg-primary-foreground/10 rounded-full px-3.5 py-1.5">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-medium text-primary-foreground">
                {availableSlots} slots open today
              </span>
            </div>
            <div className="flex items-center gap-2 bg-primary-foreground/10 rounded-full px-3.5 py-1.5">
              <Users className="w-3.5 h-3.5 text-primary-foreground/70" />
              <span className="text-xs font-medium text-primary-foreground">
                {ladder?.length || 0} players
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Quick Actions */}
      <motion.section
        className="px-4 -mt-1 relative z-20"
        {...fadeUp}
        transition={{ delay: 0.3 }}
      >
        <h2 className="font-heading font-semibold text-base mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Calendar, label: "Book a Court", desc: "Reserve Court 1 or 2", to: "/bookings", color: "text-primary" },
            { icon: Swords, label: "Challenge Player", desc: "Send a ladder challenge", to: "/challenges", color: "text-accent-foreground" },
            { icon: Trophy, label: "Ladder Rankings", desc: "See where you rank", to: "/ladder", color: "text-primary" },
            { icon: ClipboardList, label: "Record Match", desc: "Log your latest game", to: "/challenges", color: "text-accent-foreground" },
          ].map((action) => (
            <Card
              key={action.label}
              className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 group"
              onClick={() => navigate(user ? action.to : "/auth")}
            >
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <action.icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold font-heading">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Ladder Rankings */}
      <motion.section
        className="px-4 mt-8"
        {...fadeUp}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-base">Ladder Rankings</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-primary"
            onClick={() => navigate(user ? "/ladder" : "/auth")}
          >
            View Full Ladder <ChevronRight className="w-3 h-3 ml-1" />
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
                No ranked players yet. Be the first!
              </div>
            )}
          </CardContent>
        </Card>
      </motion.section>

      {/* Court Availability */}
      <motion.section
        className="px-4 mt-8"
        {...fadeUp}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-base">Today's Courts</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-primary"
            onClick={() => navigate(user ? "/bookings" : "/auth")}
          >
            Book Now <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[1, 2].map((courtId) => {
            const courtBookings = todayBookings?.filter(b => b.court_id === courtId) || [];
            const nextSlot = courtBookings.length > 0
              ? courtBookings[courtBookings.length - 1]
              : null;
            return (
              <Card key={courtId} className="overflow-hidden">
                <div className="h-2 bg-primary" />
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-heading font-bold text-sm">Court {courtId}</span>
                    <Badge
                      variant={courtBookings.length < 10 ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {Math.max(0, 12 - courtBookings.length)} open
                    </Badge>
                  </div>
                  {courtBookings.length > 0 ? (
                    <div className="space-y-1.5">
                      {courtBookings.slice(0, 3).map((b) => (
                        <div key={b.id} className="flex items-center gap-2 text-xs">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {b.start_time?.slice(0, 5)} — {b.player_name}
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

      {/* Player Spotlight */}
      {spotlight && (
        <motion.section
          className="px-4 mt-8"
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
          className="px-4 mt-10 mb-8"
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
      <footer className="px-4 py-6 text-center border-t border-border mt-8">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Gordon's Bay Squash Club
        </p>
      </footer>
    </div>
  );
}
