import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trophy, Medal, Star, Crown, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { useSeasons, useSeasonAwards } from "@/hooks/use-analytics";
import { useState } from "react";
import { cn } from "@/lib/utils";

const AWARD_ICONS: Record<string, any> = {
  champion: Crown,
  most_improved: Star,
  most_active: Flame,
  runner_up: Medal,
  default: Trophy,
};

const AWARD_COLORS: Record<string, string> = {
  champion: "text-accent-foreground bg-accent/20",
  most_improved: "text-primary bg-primary/10",
  most_active: "text-destructive bg-destructive/10",
  runner_up: "text-muted-foreground bg-muted",
};

export default function Seasons() {
  const { data: seasons, isLoading } = useSeasons();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const activeSeason = (seasons || []).find((s: any) => s.status === "active");
  const pastSeasons = (seasons || []).filter((s: any) => s.status === "completed");
  const viewingId = selectedSeasonId || activeSeason?.id || pastSeasons[0]?.id;

  const { data: awards, isLoading: awardsLoading } = useSeasonAwards(viewingId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <PageHeader title="Seasons" subtitle="Quarterly competitions & awards" />

      {/* Season selector */}
      {seasons && seasons.length > 0 ? (
        <div className="px-4 mt-3 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {(seasons || []).map((season: any) => (
              <button
                key={season.id}
                onClick={() => setSelectedSeasonId(season.id)}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all border",
                  viewingId === season.id
                    ? "bg-primary text-primary-foreground border-primary shadow-md"
                    : "bg-card border-border/50 hover:bg-secondary"
                )}
              >
                {season.name}
                {season.status === "active" && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                )}
              </button>
            ))}
          </div>

          {/* Current season info */}
          {viewingId && (() => {
            const season = (seasons || []).find((s: any) => s.id === viewingId);
            if (!season) return null;
            return (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold font-heading">{season.name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {season.start_date} → {season.end_date}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "text-[10px]",
                        season.status === "active"
                          ? "bg-accent/20 text-accent-foreground border-0"
                          : season.status === "completed"
                            ? "bg-primary/15 text-primary border-0"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {season.status === "active" ? "🔴 Live" : season.status === "completed" ? "✅ Completed" : "Upcoming"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Awards */}
          {awardsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : awards && awards.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold font-heading uppercase tracking-wider text-muted-foreground">Awards</p>
              {awards.map((award: any, i: number) => {
                const Icon = AWARD_ICONS[award.award_type] || AWARD_ICONS.default;
                const colorClass = AWARD_COLORS[award.award_type] || AWARD_COLORS.runner_up;
                return (
                  <motion.div
                    key={award.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card>
                      <CardContent className="p-3 flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colorClass)}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{award.award_label}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">{award.award_type.replace(/_/g, " ")}</p>
                        </div>
                        {award.stat_value && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{award.stat_value}</Badge>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-center">
              <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">No awards yet for this season.</p>
              <p className="text-xs text-muted-foreground">Awards are given at the end of each quarter.</p>
            </Card>
          )}
        </div>
      ) : (
        <div className="px-4 mt-8 text-center">
          <Trophy className="w-12 h-12 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">No seasons created yet.</p>
          <p className="text-xs text-muted-foreground">The club admin will set up quarterly seasons.</p>
        </div>
      )}
    </div>
  );
}
