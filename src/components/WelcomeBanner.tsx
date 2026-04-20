import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile, useLadder } from "@/hooks/use-data";
import { useMyClubMember } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Swords, X, Trophy, Sparkles, HandMetal } from "lucide-react";

const WELCOME_DISMISSED_KEY = "gb-squash-welcome-dismissed";

export function WelcomeBanner() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: myClubMember } = useMyClubMember();
  const { data: ladder } = useLadder();
  const { activeMember, effectiveUserId } = useMemberContext();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);

  const isNewPlayer = profile && (profile.matches_played === 0);

  // Find player's ladder_position using active member
  const activeMemberId = activeMember?.id || (myClubMember as any)?.id;
  const myLadderPosition = useMemo(() => {
    if (!ladder || !activeMemberId) return null;
    const me = ladder.find((p: any) => p.club_member_id === activeMemberId);
    return (me as any)?.ladder_position ?? null;
  }, [ladder, activeMemberId]);

  useEffect(() => {
    if (!profile) return;
    const stored = localStorage.getItem(WELCOME_DISMISSED_KEY);
    if (!stored) {
      setDismissed(false);
    }
  }, [profile]);

  // Suggest an opponent based on current ladder position (same ladder group)
  const suggestedPlayer = useMemo(() => {
    if (!activeMemberId || dismissed || !ladder) return null;

    const me = ladder.find((p: any) => p.club_member_id === activeMemberId);
    if (!me?.ladder_position) return null;

    const myGroupIsLadies = ["female", "ladies", "f"].includes((me.gender || "").toLowerCase());

    const sameGroupPlayers = (ladder || []).filter((p: any) => {
      if (p.club_member_id === activeMemberId) return false;
      if (typeof p.ladder_position !== "number") return false;
      const isLadies = ["female", "ladies", "f"].includes((p.gender || "").toLowerCase());
      return isLadies === myGroupIsLadies;
    });

    // Only suggest a genuinely nearby opponent (within 3 positions). Avoid misleading
    // "fallback to top of group" suggestions when no close opponent exists.
    const MAX_GAP = 3;

    const above = sameGroupPlayers
      .filter((p: any) => p.ladder_position < me.ladder_position && me.ladder_position - p.ladder_position <= MAX_GAP)
      .sort((a: any, b: any) => b.ladder_position - a.ladder_position);
    if (above.length > 0) return above[0];

    const below = sameGroupPlayers
      .filter((p: any) => p.ladder_position > me.ladder_position && p.ladder_position - me.ladder_position <= MAX_GAP)
      .sort((a: any, b: any) => a.ladder_position - b.ladder_position);
    if (below.length > 0) return below[0];

    return null;
  }, [dismissed, ladder, activeMemberId]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
  };

  if (dismissed || !profile) return null;

  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Player";

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
                    <Trophy className="w-3 h-3" /> {myLadderPosition ? `#${myLadderPosition} on ladder` : "Unranked"}
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <HandMetal className="w-3 h-3" /> {profile.matches_played} matches
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
                    {typeof (suggestedPlayer as any).ladder_position === "number"
                      ? `#${(suggestedPlayer as any).ladder_position} on ladder`
                      : "Unranked"}{" "}
                    · {(suggestedPlayer as any).wins || 0}W / {(suggestedPlayer as any).losses || 0}L
                  </p>
                </div>
                <Button
                  size="sm"
                  className="shrink-0"
                  onClick={() => navigate(`/ladder`)}
                >
                  <Swords className="w-4 h-4 mr-1" />
                  Challenge
                </Button>
              </div>
            )}

          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
