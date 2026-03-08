import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

type Step = { key: string; label: string; done: boolean; action?: string };

interface ProfileCompletionMeterProps {
  profile: any;
  onAction?: (action: string) => void;
}

export function ProfileCompletionMeter({ profile, onAction }: ProfileCompletionMeterProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!profile || dismissed) return null;

  const steps: Step[] = [
    { key: "name", label: "Add your name", done: !!profile.name && profile.name !== "" && profile.name !== "New Player" },
    { key: "phone", label: "Add phone number", done: !!profile.phone && String(profile.phone).trim().length > 0, action: "edit" },
    { key: "avatar", label: "Upload avatar", done: !!profile.avatar_url, action: "avatar" },
    { key: "availability", label: "Set availability", done: false, action: "availability" },
  ];

  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  if (pct === 100) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
      >
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold font-heading">Complete your profile</p>
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed(true)}
              >
                Dismiss
              </button>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <Progress value={pct} className="h-2 flex-1" />
              <span className="text-xs font-bold text-primary tabular-nums">{pct}%</span>
            </div>
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div
                  key={step.key}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    step.done ? "text-muted-foreground" : "text-foreground"
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={cn(step.done && "line-through")}>{step.label}</span>
                  {!step.done && step.action && onAction && (
                    <button
                      className="ml-auto text-primary text-[10px] font-medium flex items-center gap-0.5 hover:underline"
                      onClick={() => onAction(step.action!)}
                    >
                      Add <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
