import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserCheck, IdCard, Trophy, CreditCard, UserCog, ArrowRight } from "lucide-react";

interface MembershipIntroModalProps {
  open: boolean;
  clubName?: string;
  subdomain?: string;
  onClose: () => void;
}

const DEFAULT_STEPS = [
  {
    icon: IdCard,
    title: "Your membership number",
    body: "The club will issue your unique membership number once your registration is processed.",
  },
  {
    icon: Trophy,
    title: "League play (optional)",
    body: "If you'd like to play league, simply tick the league option during registration. You'll then be activated at the relevant league association once your fees are settled.",
  },
  {
    icon: CreditCard,
    title: "Fees & payment",
    body: "Annual membership fees (and league fees, if applicable) are paid directly to the club. You can review any outstanding amounts anytime under My Account.",
  },
  {
    icon: UserCog,
    title: "Complete your profile",
    body: "Make sure to fill in all your personal details so the club has everything they need — this helps with communication, league registration and event invites.",
  },
];

// CSIR members are existing NSA league players — they bring their own membership number
// and league registration is already on file. The intro therefore skips the "club will
// issue your number" message and the "tick the league option" step.
const CSIR_STEPS = [
  {
    icon: IdCard,
    title: "Your membership number",
    body: "You've already entered your club membership number during signup — it's saved to your profile. You can review or update it under My Account.",
  },
  {
    icon: Trophy,
    title: "NSA league play",
    body: "Your NSA league registration is already linked to your account using the league number on file. No need to opt in — you're ready for league fixtures.",
  },
  {
    icon: CreditCard,
    title: "Fees & payment",
    body: "Annual membership and NSA league fees are paid directly to the club. You can review any outstanding amounts anytime under My Account.",
  },
  {
    icon: UserCog,
    title: "Complete your profile",
    body: "Make sure to fill in any remaining personal details so the club has everything they need — this helps with communication and event invites.",
  },
];

export function MembershipIntroModal({ open, clubName, subdomain, onClose }: MembershipIntroModalProps) {
  const STEPS = (subdomain || "").toLowerCase() === "csir" ? CSIR_STEPS : DEFAULT_STEPS;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mb-3">
            <UserCheck className="w-7 h-7 text-primary" />
          </div>
          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-xl font-heading">
              Welcome to {clubName || "the Club"}!
            </DialogTitle>
            <DialogDescription className="text-sm">
              Here's a quick overview of how your registration works before we get started.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-4 space-y-3 max-h-[55vh] overflow-y-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex gap-3">
                <div className="shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  <Icon className="w-4 h-4 text-foreground" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold leading-tight">{s.title}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="px-6 pb-6 pt-2">
          <Button onClick={onClose} className="w-full sm:w-auto sm:ml-auto">
            Got it, let's start
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
