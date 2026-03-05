import { PageHeader } from "@/components/PageHeader";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Clock, Trophy } from "lucide-react";
import { recentChallenges, recentMatches } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const statusConfig = {
  pending: { color: "bg-accent/20 text-accent-foreground", icon: Clock },
  accepted: { color: "bg-primary/15 text-primary", icon: Check },
  declined: { color: "bg-destructive/15 text-destructive", icon: X },
  completed: { color: "bg-muted text-muted-foreground", icon: Trophy },
};

export default function Challenges() {
  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Challenges" subtitle="Challenge & compete" />

      <Tabs defaultValue="challenges" className="px-4 mt-2">
        <TabsList className="w-full">
          <TabsTrigger value="challenges" className="flex-1">Challenges</TabsTrigger>
          <TabsTrigger value="results" className="flex-1">Match Results</TabsTrigger>
        </TabsList>

        <TabsContent value="challenges" className="mt-3 space-y-2">
          {recentChallenges.map((challenge, i) => {
            const config = statusConfig[challenge.status];
            const StatusIcon = config.icon;

            return (
              <motion.div
                key={challenge.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <StatusIcon className="w-4 h-4 text-muted-foreground" />
                      <Badge className={cn("text-[10px]", config.color)} variant="secondary">
                        {challenge.status}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{challenge.createdAt}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar
                        initials={challenge.challengerName.split(" ").map(n => n[0]).join("")}
                        size="sm"
                      />
                      <span className="text-sm font-medium">{challenge.challengerName}</span>
                    </div>
                    <span className="text-xs font-heading font-bold text-muted-foreground">VS</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{challenge.opponentName}</span>
                      <PlayerAvatar
                        initials={challenge.opponentName.split(" ").map(n => n[0]).join("")}
                        size="sm"
                      />
                    </div>
                  </div>

                  {challenge.proposedDate && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Proposed: {challenge.proposedDate}
                    </p>
                  )}

                  {challenge.status === "pending" && (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="flex-1 h-8 text-xs">Accept</Button>
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">Decline</Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </TabsContent>

        <TabsContent value="results" className="mt-3 space-y-2">
          {recentMatches.map((match, i) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{match.date}</span>
                  {!match.confirmed && (
                    <Badge variant="secondary" className="text-[10px] bg-accent/20">
                      Awaiting confirmation
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar
                      initials={match.playerAName.split(" ").map(n => n[0]).join("")}
                      size="sm"
                    />
                    <div>
                      <p className={cn(
                        "text-sm font-medium",
                        match.winnerId === match.playerA && "text-win"
                      )}>
                        {match.playerAName}
                      </p>
                    </div>
                  </div>

                  <span className="text-lg font-heading font-bold text-primary">{match.score}</span>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-medium",
                        match.winnerId === match.playerB && "text-win"
                      )}>
                        {match.playerBName}
                      </p>
                    </div>
                    <PlayerAvatar
                      initials={match.playerBName.split(" ").map(n => n[0]).join("")}
                      size="sm"
                    />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
