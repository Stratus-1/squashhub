import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { User, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "basics", label: "Basics" },
  { id: "squash", label: "Squash" },
  { id: "done", label: "Done" },
];

export function OnboardingWizard({
  open,
  onComplete,
}: {
  open: boolean;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(user?.user_metadata?.name || "");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [dominantHand, setDominantHand] = useState("");
  const [yearsPlaying, setYearsPlaying] = useState("");
  const [playingStyle, setPlayingStyle] = useState("");
  const [bio, setBio] = useState("");

  const progress = ((step + 1) / STEPS.length) * 100;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updates: Record<string, any> = {
        name: name.trim() || "New Player",
        phone: phone.trim() || null,
      };

      // These columns may exist on extended profiles
      if (location.trim()) updates.location = location.trim();
      if (dominantHand) updates.dominant_hand = dominantHand;
      if (yearsPlaying) updates.years_playing = yearsPlaying;
      if (playingStyle.trim()) updates.playing_style = playingStyle.trim();
      if (bio.trim()) updates.bio = bio.trim();

      const { error } = await (supabase as any)
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      toast.success("Profile saved! Welcome to the club 🎉");
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step === STEPS.length - 1) {
      handleSave();
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const back = () => setStep((s) => Math.max(s - 1, 0));

  const canProceed = () => {
    if (step === 1) return name.trim().length >= 2;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md gap-0 p-0 overflow-hidden [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="px-6 pt-6 pb-2">
          <Progress value={progress} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>

        <div className="px-6 pb-6 min-h-[280px] flex flex-col">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-6"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-primary" />
                </div>
                <DialogHeader className="items-center">
                  <DialogTitle className="text-xl font-heading">Welcome to the Club!</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground max-w-[280px]">
                    Let's set up your profile so other players can find and challenge you.
                  </DialogDescription>
                </DialogHeader>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="basics"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 space-y-4 pt-2"
              >
                <DialogHeader>
                  <DialogTitle className="text-lg font-heading">Your Details</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    How should other players know you?
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="onb-name">Full Name *</Label>
                    <Input
                      id="onb-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. John Smith"
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="onb-phone">Phone (optional)</Label>
                    <Input
                      id="onb-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+27 82 123 4567"
                    />
                  </div>
                  <div>
                    <Label htmlFor="onb-location">Location (optional)</Label>
                    <Input
                      id="onb-location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Cape Town"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="squash"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 space-y-4 pt-2"
              >
                <DialogHeader>
                  <DialogTitle className="text-lg font-heading">Squash Info</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Tell us about your game — all optional.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Dominant Hand</Label>
                    <Select value={dominantHand} onValueChange={setDominantHand}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select hand" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="right">Right</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="ambidextrous">Ambidextrous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Experience</Label>
                    <Select value={yearsPlaying} onValueChange={setYearsPlaying}>
                      <SelectTrigger>
                        <SelectValue placeholder="Years playing" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner (&lt;1 year)</SelectItem>
                        <SelectItem value="intermediate">Intermediate (1-3 years)</SelectItem>
                        <SelectItem value="experienced">Experienced (3-10 years)</SelectItem>
                        <SelectItem value="veteran">Veteran (10+ years)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="onb-style">Playing Style</Label>
                    <Input
                      id="onb-style"
                      value={playingStyle}
                      onChange={(e) => setPlayingStyle(e.target.value)}
                      placeholder="e.g. Aggressive, Defensive"
                    />
                  </div>
                  <div>
                    <Label htmlFor="onb-bio">Short Bio</Label>
                    <Textarea
                      id="onb-bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="A few words about you..."
                      rows={2}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="done"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-6"
              >
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-8 h-8 text-primary" />
                </div>
                <DialogHeader className="items-center">
                  <DialogTitle className="text-xl font-heading">You're All Set!</DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground max-w-[280px]">
                    Your profile is ready. Book a court, climb the ladder, or challenge a rival!
                  </DialogDescription>
                </DialogHeader>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between mt-auto pt-4">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={back}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            ) : (
              <div />
            )}
            <Button size="sm" onClick={next} disabled={!canProceed() || saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              {step === STEPS.length - 1 ? "Let's Go!" : "Next"}
              {step < STEPS.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
