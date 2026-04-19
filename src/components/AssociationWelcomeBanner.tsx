import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { useMyClub } from "@/hooks/use-club";
import { useMemberContext } from "@/contexts/MemberContext";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Network, X, Sparkles } from "lucide-react";

const DISMISSED_KEY = "gb-squash-association-welcome-dismissed";

export function AssociationWelcomeBanner() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (!stored) setDismissed(false);
  }, [profile]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  if (dismissed || !profile || !user) return null;

  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Member";
  const associationName = clubData?.club?.name || "your association";

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
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-heading">
                  Welcome, {firstName}!
                </h3>
                <p className="text-xs text-muted-foreground">
                  This is the hub for {associationName} — manage affiliated clubs, regional leagues and tournaments.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/club-admin")}>
                <Network className="w-4 h-4 mr-1.5" />
                Affiliated Clubs
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
