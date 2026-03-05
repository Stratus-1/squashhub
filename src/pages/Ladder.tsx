import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Swords, TrendingUp } from "lucide-react";
import { players } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Ladder() {
  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Player Ladder" subtitle={`${players.length} players ranked`} />

      <div className="px-4 mt-3 space-y-2 mb-4">
        {players
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
          .map((player, index) => {
            const winRate = player.matchesPlayed > 0
              ? Math.round((player.wins / player.matchesPlayed) * 100)
              : 0;

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={cn(
                  "p-3 flex items-center gap-3",
                  index === 0 && "border-accent/50 bg-accent/5",
                  index === 1 && "border-primary/30 bg-primary/5",
                  index === 2 && "border-primary/20 bg-primary/[0.02]"
                )}>
                  {/* Rank */}
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0",
                    index === 0 ? "bg-accent text-accent-foreground" :
                    index <= 2 ? "bg-primary/15 text-primary" :
                    "bg-secondary text-muted-foreground"
                  )}>
                    {player.rank}
                  </div>

                  <PlayerAvatar initials={player.avatar} size="sm" />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{player.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {player.wins}W - {player.losses}L
                      </span>
                      <span className="text-[11px] text-win font-medium flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3" />
                        {winRate}%
                      </span>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1">
                    <Swords className="w-3 h-3" />
                    Challenge
                  </Button>
                </Card>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}
