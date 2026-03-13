import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BadgeCheck, Calendar, LayoutDashboard, Sparkles, Swords, UserCircle2 } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const KEY_LAST_BUILD = "gb_build_id_last_seen";
const KEY_SHOWN_BUILD = "gb_whats_new_shown_for";

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function WhatsNewModal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: profile } = useProfile();

  const [open, setOpen] = useState(false);

  const buildId = typeof __GB_BUILD_ID__ !== "undefined" ? String(__GB_BUILD_ID__) : "dev";

  useEffect(() => {
    const lastSeen = safeGet(KEY_LAST_BUILD);
    const shownFor = safeGet(KEY_SHOWN_BUILD);

    // First visit: establish baseline so we only show on the next update.
    if (!lastSeen) {
      safeSet(KEY_LAST_BUILD, buildId);
      return;
    }

    if (lastSeen !== buildId && shownFor !== buildId) {
      setOpen(true);
    }
  }, [buildId]);

  const items = useMemo(() => {
    const list = [
      {
        key: "challenges",
        title: "Challenges inbox",
        description: "Use the swords icon next to notifications to respond fast.",
        Icon: Swords,
        cta: "Open inbox",
        onClick: () => navigate("/challenges?view=inbox"),
        visible: !!user,
      },
      {
        key: "seasons",
        title: "Seasons improvements",
        description: "Seasons are easier to browse with a cleaner layout and joined counts.",
        Icon: Sparkles,
        cta: "View seasons",
        onClick: () => navigate("/seasons"),
        visible: !!user,
      },
      {
        key: "dashboard",
        title: "Cleaner stats UI",
        description: "Your stats now use Apple Health-style rings for quicker scanning.",
        Icon: LayoutDashboard,
        cta: "Open dashboard",
        onClick: () => navigate("/dashboard"),
        visible: !!user,
      },
      {
        key: "support",
        title: "Feedback button",
        description: "Tap the + button to report issues or propose changes anytime.",
        Icon: Calendar,
        cta: "Open support",
        onClick: () => navigate("/support"),
        visible: !!user,
      },
    ];

    return list.filter((x) => x.visible);
  }, [location, navigate, profile, user]);

  const closeAndMarkSeen = () => {
    safeSet(KEY_LAST_BUILD, buildId);
    safeSet(KEY_SHOWN_BUILD, buildId);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeAndMarkSeen();
      }}
    >
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading inline-flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-primary" />
            What’s new
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {items.length === 0 ? (
            <Card className="p-3 text-sm text-muted-foreground">
              You’re up to date.
            </Card>
          ) : (
            items.map((it) => (
              <Card key={it.key} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <it.Icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{it.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {it.description}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    onClick={() => {
                      closeAndMarkSeen();
                      it.onClick();
                    }}
                  >
                    {it.cta}
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button className="w-full sm:w-auto" onClick={closeAndMarkSeen}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

