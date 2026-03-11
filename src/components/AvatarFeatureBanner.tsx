import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ImagePlus, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";

const DISMISSED_KEY = "gb-squash-avatar-banner-dismissed";

export function AvatarFeatureBanner() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_KEY);
    setDismissed(!!stored);
  }, []);

  const hasAvatar = !!(profile as any)?.avatar_url;
  if (!user || !profile || hasAvatar || dismissed) return null;

  return (
    <div className="px-4 mt-3">
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(DISMISSED_KEY, "1");
          }}
          className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ImagePlus className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold font-heading">New: profile avatars</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              You can now pick an avatar in your profile. Tap below, choose one, then hit Save.
            </p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Button
                size="sm"
                className="sm:w-auto"
                onClick={() => navigate("/profile?edit=1&focus=avatar", { state: { backgroundLocation: location } })}
              >
                Choose an avatar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="sm:w-auto"
                onClick={() => navigate("/profile", { state: { backgroundLocation: location } })}
              >
                View profile
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

