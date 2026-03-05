import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Trophy, Swords, ChevronRight, Megaphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { players, todayBookings, recentChallenges, announcements } from "@/lib/mock-data";
import { motion } from "framer-motion";

const currentPlayer = players[3]; // Lisa Chen as current user

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Gordon's Bay Squash" subtitle="Welcome back, Lisa" showNotifications />

      {/* Quick Stats */}
      <motion.div
        className="grid grid-cols-4 gap-2 px-4 mt-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <StatCard label="Rank" value={`#${currentPlayer.rank}`} />
        <StatCard label="Played" value={currentPlayer.matchesPlayed} />
        <StatCard label="Wins" value={currentPlayer.wins} variant="win" />
        <StatCard label="Losses" value={currentPlayer.losses} variant="loss" />
      </motion.div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-primary/5 border-primary/20 p-3">
            <div className="flex items-start gap-2">
              <Megaphone className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{announcements[0].title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{announcements[0].message}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 px-4 mt-4">
        <Button
          variant="outline"
          className="flex flex-col items-center gap-1 h-auto py-3 bg-card"
          onClick={() => navigate("/bookings")}
        >
          <Calendar className="w-5 h-5 text-primary" />
          <span className="text-[11px]">Book Court</span>
        </Button>
        <Button
          variant="outline"
          className="flex flex-col items-center gap-1 h-auto py-3 bg-card"
          onClick={() => navigate("/ladder")}
        >
          <Trophy className="w-5 h-5 text-primary" />
          <span className="text-[11px]">Ladder</span>
        </Button>
        <Button
          variant="outline"
          className="flex flex-col items-center gap-1 h-auto py-3 bg-card"
          onClick={() => navigate("/challenges")}
        >
          <Swords className="w-5 h-5 text-primary" />
          <span className="text-[11px]">Challenge</span>
        </Button>
      </div>

      {/* Today's Courts */}
      <motion.div
        className="px-4 mt-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading">Today's Bookings</h2>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/bookings")}>
            View all <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="space-y-2">
          {todayBookings.slice(0, 3).map((booking) => (
            <Card key={booking.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{booking.courtName.split(" ")[1]}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{booking.playerName}</p>
                  <p className="text-xs text-muted-foreground">{booking.courtName}</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {booking.startTime} - {booking.endTime}
              </Badge>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Active Challenges */}
      <motion.div
        className="px-4 mt-5 mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold font-heading">Active Challenges</h2>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/challenges")}>
            View all <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="space-y-2">
          {recentChallenges.filter(c => c.status !== "completed").map((challenge) => (
            <Card key={challenge.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PlayerAvatar initials={challenge.challengerName.split(" ").map(n => n[0]).join("")} size="sm" />
                  <div>
                    <p className="text-sm font-medium">
                      {challenge.challengerName} <span className="text-muted-foreground">vs</span> {challenge.opponentName}
                    </p>
                    {challenge.proposedDate && (
                      <p className="text-xs text-muted-foreground">{challenge.proposedDate}</p>
                    )}
                  </div>
                </div>
                <Badge variant={challenge.status === "pending" ? "default" : "secondary"} className="text-[10px]">
                  {challenge.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
