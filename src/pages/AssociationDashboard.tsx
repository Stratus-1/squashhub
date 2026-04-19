import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { AssociationWelcomeBanner } from "@/components/AssociationWelcomeBanner";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import {
  Network, Trophy, Medal, CalendarDays, Users, Settings,
  ChevronRight, ShieldCheck, MessageCircle, BarChart3, Wallet, LifeBuoy
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile } from "@/hooks/use-data";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMyPermissions } from "@/hooks/use-club-permissions";
import { useMemberContext } from "@/contexts/MemberContext";
import { useAuth } from "@/contexts/AuthContext";

interface Tile {
  to: string;
  label: string;
  description: string;
  icon: any;
  color: string;
  show?: boolean;
}

export default function AssociationDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const isClubAdmin = useIsClubAdmin();
  const myPermissions = useMyPermissions();
  const hasAnyAdminAccess = isClubAdmin || myPermissions.size > 0;

  const association = clubData?.club;
  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Member";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });

  const tiles: Tile[] = [
    {
      to: "/challenges",
      label: "Challenges",
      description: "Inter-club challenges & invitations",
      icon: Trophy,
      color: "text-amber-500 bg-amber-500/10",
    },
    {
      to: "/events",
      label: "Events",
      description: "Association events & gatherings",
      icon: CalendarDays,
      color: "text-purple-500 bg-purple-500/10",
    },
    {
      to: "/league-games",
      label: "Regional Leagues",
      description: "Fixtures, standings & results",
      icon: Medal,
      color: "text-blue-500 bg-blue-500/10",
    },
    {
      to: "/feed",
      label: "Feed",
      description: "Latest activity across the association",
      icon: MessageCircle,
      color: "text-emerald-500 bg-emerald-500/10",
    },
    {
      to: "/analytics",
      label: "Analytics",
      description: "Stats & insights",
      icon: BarChart3,
      color: "text-cyan-500 bg-cyan-500/10",
    },
    {
      to: "/my-account",
      label: "My Account",
      description: "Profile, fees & preferences",
      icon: Wallet,
      color: "text-rose-500 bg-rose-500/10",
    },
    {
      to: "/club-admin",
      label: "Association Admin",
      description: "Affiliated clubs, members & finance",
      icon: ShieldCheck,
      color: "text-primary bg-primary/10",
      show: hasAnyAdminAccess,
    },
    {
      to: "/settings",
      label: "Settings",
      description: "Theme & preferences",
      icon: Settings,
      color: "text-slate-500 bg-slate-500/10",
    },
    {
      to: "/support",
      label: "Support",
      description: "Get help",
      icon: LifeBuoy,
      color: "text-orange-500 bg-orange-500/10",
    },
  ].filter(t => t.show !== false);

  return (
    <div className="bottom-nav-safe relative">
      <SEO title="Home" description="Your association hub." path="/" noIndex />

      <PageHeader
        title={association?.name || "Association"}
        subtitle={`Welcome back, ${firstName}`}
        showNotifications
        showProfile
        showChallengesInbox={false}
      />

      <AssociationWelcomeBanner />

      <div className="px-4 mt-2">
        <ProfileCompletionMeter
          profile={profile}
          onAction={(action) => {
            if (action === "edit") openProfile("/profile?edit=1");
          }}
        />
      </div>

      <div className="px-4 mt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <Card
              key={tile.to}
              role="button"
              tabIndex={0}
              onClick={() => navigate(tile.to)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(tile.to);
                }
              }}
              className="p-3 cursor-pointer hover:border-primary/40 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-2", tile.color)}>
                <tile.icon className="w-5 h-5" />
              </div>
              <div className="flex items-center justify-between gap-1">
                <h3 className="text-sm font-semibold leading-tight truncate">{tile.label}</h3>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{tile.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
