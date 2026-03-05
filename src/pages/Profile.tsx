import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trophy, Target, TrendingUp, Calendar, Settings, LogOut } from "lucide-react";
import { players, recentMatches } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const currentPlayer = players[3]; // Lisa Chen

export default function Profile() {
  const winRate = currentPlayer.matchesPlayed > 0
    ? Math.round((currentPlayer.wins / currentPlayer.matchesPlayed) * 100)
    : 0;

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Profile" />

      {/* Profile Header */}
      <motion.div
        className="flex flex-col items-center px-4 mt-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <PlayerAvatar initials={currentPlayer.avatar} rank={currentPlayer.rank} size="lg" />
        <h2 className="text-lg font-bold font-heading mt-3">{currentPlayer.name}</h2>
        <p className="text-sm text-muted-foreground">Member since {currentPlayer.joinDate}</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 px-4 mt-4">
        <StatCard label="Rank" value={`#${currentPlayer.rank}`} icon={<Trophy className="w-4 h-4" />} />
        <StatCard label="Played" value={currentPlayer.matchesPlayed} icon={<Target className="w-4 h-4" />} />
        <StatCard label="Wins" value={currentPlayer.wins} variant="win" />
        <StatCard label="Win %" value={`${winRate}%`} icon={<TrendingUp className="w-4 h-4" />} />
      </div>

      {/* Recent Matches */}
      <div className="px-4 mt-5">
        <h3 className="text-sm font-semibold font-heading mb-2">Recent Matches</h3>
        <div className="space-y-2">
          {recentMatches.slice(0, 3).map((match) => (
            <Card key={match.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{match.date}</span>
              </div>
              <div className="text-sm font-medium">
                {match.playerAName.split(" ")[0]} vs {match.playerBName.split(" ")[0]}
              </div>
              <Badge variant="secondary" className="text-xs font-heading">{match.score}</Badge>
            </Card>
          ))}
        </div>
      </div>

      <Separator className="my-5 mx-4" />

      {/* Actions */}
      <div className="px-4 space-y-2 mb-4">
        <Button variant="outline" className="w-full justify-start gap-3">
          <Settings className="w-4 h-4" /> Edit Profile
        </Button>
        <Button variant="outline" className="w-full justify-start gap-3 text-destructive hover:text-destructive">
          <LogOut className="w-4 h-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
}
