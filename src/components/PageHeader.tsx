import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberContext } from "@/contexts/MemberContext";
import { NotificationsDropdown } from "@/components/NotificationsDropdown";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getBackFallback } from "@/lib/breadcrumbs";
import { useProfile } from "@/hooks/use-data";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { TenantSwitcher } from "@/components/TenantSwitcher";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showNotifications?: boolean;
  showChallengesInbox?: boolean;
  showProfile?: boolean;
  profileTo?: string;
  showBack?: boolean;
  backTo?: string;
  actionsOnly?: boolean;
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
  actionsOnly = false,
}: PageHeaderProps) {
  const { user, signOut } = useAuth();
  const { activeMember } = useMemberContext();
  const { data: profile } = useProfile();
  const { data: myClubMember } = useMyClubMember();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: clubData } = useMyClub();
  const clubLogo = clubData?.club?.logo_url;
  const pathname = location.pathname || "/";
  const isTopLevel = pathname === "/" || pathname === "/dashboard" || pathname === "/auth";
  const shouldShowBack = showBack ?? !isTopLevel;
  const fallbackTo = backTo || getBackFallback(pathname);
  const canGoBack = typeof window !== "undefined" && window.history.length > 1;
  const activeMemberId = activeMember?.id;
  const { data: switchedMember } = useQuery({
    queryKey: ["club-member-by-id", activeMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("id, name, avatar_url")
        .eq("id", activeMemberId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string | null; avatar_url: string | null } | null;
    },
    enabled: !!activeMemberId && activeMemberId !== myClubMember?.id,
  });

  const memberName = switchedMember?.name || myClubMember?.name || activeMember?.name || "";
  const avatarUrl = switchedMember?.avatar_url || myClubMember?.avatar_url || (profile as any)?.avatar_url || null;
  const playerName = memberName || (profile as any)?.name || "";
  const initials = playerName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0])
    .join("")
    .toUpperCase() || "??";

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] pb-2">
      <div className="flex items-center justify-between gap-3">
        {!actionsOnly && (
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

          <div className="min-w-0 flex-1 flex items-center gap-2">
            {clubLogo && (
              <img src={clubLogo} alt="Club logo" className="w-8 h-8 object-contain rounded flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <Breadcrumbs className="hidden md:flex mb-1" />
              <h1 className="text-xl font-bold font-heading tracking-tight truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
        </div>
        )}

        {user && (
          <div className="ml-auto flex items-center gap-1.5">
            <TenantSwitcher />
            {showNotifications && <NotificationsDropdown />}
            <button
              type="button"
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-center gap-1.5"
              onClick={() => {
                if (profileTo === "/profile") {
                  navigate(profileTo, { state: { backgroundLocation: location } });
                  return;
                }
                navigate(profileTo);
              }}
              aria-label="Profile"
            >
              <PlayerAvatar initials={initials} avatarUrl={avatarUrl} size="sm" />
              <span className="hidden md:inline text-xs font-medium text-muted-foreground max-w-[120px] truncate">
                {playerName}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              onClick={() => signOut()}
              aria-label="Log out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
