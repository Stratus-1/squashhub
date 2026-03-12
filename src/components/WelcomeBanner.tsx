import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, X, Trophy, Sparkles, HandMetal } from "lucide-react";

const WELCOME_DISMISSED_KEY = "gb-squash-welcome-dismissed";

export function WelcomeBanner() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);

  const isNewPlayer = profile && (profile.matches_played === 0);

  useEffect(() => {
    if (!profile) return;
    const stored = localStorage.getItem(WELCOME_DISMISSED_KEY);
    if (!stored) {
      setDismissed(false);
    }
  }, [profile]);

  // Find a suggested opponent close to their rank
  const { data: suggestedPlayer } = useQuery({
    queryKey: ["suggested-challenge", user?.id, profile?.rank],
    queryFn: async () => {
      if (!user?.id) return null;

      // If ranked, suggest someone within 2 ladder positions (prefer above).
      if (profile?.rank) {
        const aboveFrom = Math.max(1, profile.rank - 2);
        const aboveTo = Math.max(1, profile.rank - 1);
        if (aboveTo >= aboveFrom) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, name, rank, wins, losses, matches_played")
            .neq("id", user.id)
            .gte("rank", aboveFrom)
            .lte("rank", aboveTo)
            .order("rank", { ascending: false })
            .limit(1);
          if (!error && data && data.length > 0) return data[0];
        }

        const belowFrom = Math.min(20, profile.rank + 1);
        const belowTo = Math.min(20, profile.rank + 2);
        if (belowTo >= belowFrom) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, name, rank, wins, losses, matches_played")
            .neq("id", user.id)
            .gte("rank", belowFrom)
            .lte("rank", belowTo)
            .order("rank", { ascending: true })
            .limit(1);
          if (!error && data && data.length > 0) return data[0];
        }
      }

      // Fallback: find any active player with matches
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, rank, wins, losses, matches_played")
        .neq("id", user.id)
        .gt("matches_played", 0)
        .order("matches_played", { ascending: false })
        .limit(5);

      if (error || !data || data.length === 0) return null;
      // Pick a random one for variety
      return data[Math.floor(Math.random() * data.length)];
    },
    enabled: !!user?.id && !!profile && !dismissed,
    staleTime: 1000 * 60 * 5,
  });

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
  };

  if (dismissed || !profile) return null;

  const firstName = profile.name?.split(" ")[0] || "Player";

  return (
    <AnimatePresence>
      <motion.div
        className="px-4 mt-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
      >
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
          <button
            onClick={handleDismiss}
            className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors z-10"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-4 space-y-3">
            {/* Welcome message */}
            {isNewPlayer ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-heading">
                      Welcome to the club, {firstName}! 🎉
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      You're now on the ladder. Play your first match to get ranked!
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary" className="gap-1">
                    <Trophy className="w-3 h-3" /> Unranked
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <HandMetal className="w-3 h-3" /> 0 matches
                  </Badge>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Swords className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-heading">
                    Ready for your next match, {firstName}?
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Keep climbing the ladder — challenge someone today!
                  </p>
                </div>
              </div>
            )}

            {/* Suggested challenge */}
            {suggestedPlayer && (
              <div className="rounded-lg bg-card border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Suggested opponent
                  </p>
                  <p className="text-sm font-semibold truncate mt-0.5">
                    {(suggestedPlayer as any).name || "Unknown"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {typeof (suggestedPlayer as any).rank === "number"
                      ? `Rank #${(suggestedPlayer as any).rank}`
                      : "Unranked"}{" "}
                    · {(suggestedPlayer as any).wins || 0}W / {(suggestedPlayer as any).losses || 0}L
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => navigate(`/challenges/new?opponent=${(suggestedPlayer as any).id}`)}
                >
                  <Swords className="w-4 h-4 mr-1" />
                  Challenge
                </Button>
              </div>
            )}

            {/* CTA for new players without a suggestion */}
            {!suggestedPlayer && isNewPlayer && (
              <Button
                size="sm"
                className="w-full"
                onClick={() => navigate("/bookings")}
              >
                <Trophy className="w-4 h-4 mr-1" />
                Book a Court
              </Button>
            )}
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
