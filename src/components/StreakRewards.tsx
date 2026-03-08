import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StreakRewardsProps {
  currentPlayStreak: number;
  currentWinStreak: number;
  bestPlayStreak: number;
  bestWinStreak: number;
}

function getMultiplier(streak: number): number {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

function getStreakLabel(streak: number): string {
  if (streak >= 10) return "🔥 On Fire!";
  if (streak >= 5) return "⚡ Hot Streak";
  if (streak >= 3) return "💪 Building";
  return "Start playing!";
}

export function StreakRewards({ currentPlayStreak, currentWinStreak, bestPlayStreak, bestWinStreak }: StreakRewardsProps) {
  const playMultiplier = getMultiplier(currentPlayStreak);
  const winMultiplier = getMultiplier(currentWinStreak);
  const bestMultiplier = Math.max(playMultiplier, winMultiplier);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-destructive" />
          <p className="text-xs font-semibold font-heading">Streak Rewards</p>
          {bestMultiplier > 1 && (
            <Badge className="bg-accent/20 text-accent-foreground border-0 text-[10px] ml-auto">
              <Zap className="w-3 h-3 mr-0.5" /> {bestMultiplier}x XP
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <motion.div
            className="rounded-xl bg-primary/5 border border-primary/15 p-3 text-center"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
          >
            <p className="text-2xl font-bold font-heading text-primary">{currentPlayStreak}</p>
            <p className="text-[10px] text-muted-foreground">Play Streak</p>
            <p className="text-[9px] text-primary font-medium mt-1">{getStreakLabel(currentPlayStreak)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Best: {bestPlayStreak}</p>
          </motion.div>

          <motion.div
            className="rounded-xl bg-accent/5 border border-accent/15 p-3 text-center"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.05 }}
          >
            <p className="text-2xl font-bold font-heading text-accent-foreground">{currentWinStreak}</p>
            <p className="text-[10px] text-muted-foreground">Win Streak</p>
            <p className="text-[9px] text-accent-foreground font-medium mt-1">{getStreakLabel(currentWinStreak)}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Best: {bestWinStreak}</p>
          </motion.div>
        </div>

        <div className="mt-3 text-[10px] text-muted-foreground text-center space-y-0.5">
          <p>3+ weeks = 1.5x XP · 5+ weeks = 2x XP · 10+ weeks = 3x XP</p>
        </div>
      </CardContent>
    </Card>
  );
}
