import { useAuth } from "@/contexts/AuthContext";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Swords, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getBackFallback } from "@/lib/breadcrumbs";
import { useIncomingChallengesCount } from "@/hooks/use-data";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showNotifications?: boolean;
  showChallengesInbox?: boolean;
  showProfile?: boolean;
  profileTo?: string;
  showBack?: boolean;
  backTo?: string;
}

export function PageHeader({
  title,
  subtitle,
  showNotifications = true,
  showChallengesInbox = true,
  showProfile = false,
  profileTo = "/profile",
  showBack,
  backTo,
}: PageHeaderProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname || "/";
  const isTopLevel = pathname === "/" || pathname === "/dashboard" || pathname === "/auth";
  const shouldShowBack = showBack ?? !isTopLevel;
  const fallbackTo = backTo || getBackFallback(pathname);
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;
  const { data: incomingCount } = useIncomingChallengesCount();

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-start gap-2">
          {shouldShowBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 -ml-2 mt-0.5 shrink-0"
              onClick={() => (canGoBack ? navigate(-1) : navigate(fallbackTo))}
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          ) : null}

          <div className="min-w-0 flex-1">
            <Breadcrumbs className="hidden md:flex mb-1" />
            <h1 className="text-xl font-bold font-heading tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>

        {user && (showNotifications || showChallengesInbox || showProfile) && (
          <div className="flex items-center gap-2">
            {showNotifications && <NotificationsDropdown />}
            {showChallengesInbox ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative h-9 w-9"
                onClick={() => navigate("/challenges?view=inbox")}
                aria-label="Challenges inbox"
              >
                <Swords className="w-5 h-5" />
                {(incomingCount ?? 0) > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold tabular-nums inline-flex items-center justify-center shadow-sm">
                    {(incomingCount ?? 0) > 99 ? "99+" : incomingCount}
                  </span>
                ) : null}
              </Button>
            ) : null}
            {showProfile && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => {
                  if (profileTo === "/profile") {
                    navigate(profileTo, { state: { backgroundLocation: location } });
                    return;
                  }
                  navigate(profileTo);
                }}
                aria-label="Profile"
              >
                <User className="w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
