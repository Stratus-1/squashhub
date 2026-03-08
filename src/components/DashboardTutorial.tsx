import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar, Trophy, Swords, Bell, User, ChevronRight, ChevronLeft, X, Sparkles } from "lucide-react";

const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "Your Dashboard",
    description: "This is your home base. See your stats, upcoming matches, and court availability at a glance.",
  },
  {
    icon: Calendar,
    title: "Book a Court",
    description: "Tap 'Book Court' to reserve a time slot. You'll see real-time availability for both courts.",
  },
  {
    icon: Trophy,
    title: "Climb the Ladder",
    description: "Check your ranking, view the leaderboard, and track your progress over the season.",
  },
  {
    icon: Swords,
    title: "Challenge Players",
    description: "Send a challenge to any ranked player. Propose a time and the system handles the rest.",
  },
  {
    icon: Bell,
    title: "Stay Notified",
    description: "Get push notifications for challenges, match results, and booking reminders — even when offline.",
  },
  {
    icon: User,
    title: "Your Profile",
    description: "Update your info, connect Strava, manage availability, and view head-to-head stats.",
  },
];

const STORAGE_KEY = "gb-squash-tutorial-seen";

export function DashboardTutorial({ force = false }: { force?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (force) {
      setVisible(true);
      setStep(0);
      return;
    }
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay so dashboard renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [force]);

  const dismiss = useCallback(() => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  const next = () => {
    if (step >= TOUR_STEPS.length - 1) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (!visible) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <Card className="w-full max-w-sm p-5 relative overflow-hidden">
              {/* Close button */}
              <button
                onClick={dismiss}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Skip tutorial"
              >
                <X className="w-4 h-4" />
              </button>

              <Progress value={progress} className="h-1 mb-4" />

              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="text-lg font-bold font-heading">{current.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
                  {current.description}
                </p>
              </div>

              <div className="flex items-center justify-between mt-5">
                {step > 0 ? (
                  <Button variant="ghost" size="sm" onClick={back}>
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
                    Skip
                  </Button>
                )}
                <div className="flex items-center gap-1.5">
                  {TOUR_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === step ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  ))}
                </div>
                <Button size="sm" onClick={next}>
                  {step >= TOUR_STEPS.length - 1 ? "Got it!" : "Next"}
                  {step < TOUR_STEPS.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
