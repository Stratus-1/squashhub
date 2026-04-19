import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { SEO } from "@/components/SEO";
import { AssociationWelcomeBanner } from "@/components/AssociationWelcomeBanner";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import {
  LayoutDashboard, Building2, Network, Trophy, Medal, Users, UserCheck,
  Settings, Banknote, Landmark, ShieldCheck, ChevronRight, MessageCircle,
  BarChart3, Wallet, LifeBuoy, CalendarDays, Receipt
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile } from "@/hooks/use-data";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { useMyPermissions, type PermissionSlug } from "@/hooks/use-club-permissions";
import { useMemberContext } from "@/contexts/MemberContext";

import { AssociationInfoTab } from "@/components/association-admin/AssociationInfoTab";
import { AffiliatedClubsTab } from "@/components/association-admin/AffiliatedClubsTab";
import { SettingsTab } from "@/components/club-admin/SettingsTab";
import { BankingTab } from "@/components/club-admin/BankingTab";
import { FinanceTab } from "@/components/club-admin/FinanceTab";
import { FeesTab } from "@/components/club-admin/FeesTab";
import { MembersTab } from "@/components/club-admin/MembersTab";
import { UsersTab } from "@/components/club-admin/UsersTab";
import { LeaguesTab } from "@/components/club-admin/LeaguesTab";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { PermissionsTab } from "@/components/club-admin/PermissionsTab";

interface TabDef {
  value: string;
  label: string;
  icon: any;
  permission?: PermissionSlug;
  adminOnly?: boolean;
}

const ASSOC_TABS: TabDef[] = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "association", label: "Association", icon: Building2, permission: "club" },
  { value: "affiliated", label: "Affiliated Clubs", icon: Network, permission: "club" },
  { value: "leagues", label: "Regional Leagues", icon: Trophy, permission: "leagues" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs" },
  { value: "members", label: "Members", icon: Users, permission: "members" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking" },
  { value: "fees", label: "Fees", icon: Receipt, permission: "fees" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck, adminOnly: true },
];

interface OverviewTile {
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
  const { data: profile } = useProfile();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const isClubAdmin = useIsClubAdmin();
  const myPermissions = useMyPermissions();

  const association = clubData?.club;
  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Member";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });

  const visibleTabs = ASSOC_TABS.filter(tab => {
    if (tab.value === "overview") return true;
    if (tab.adminOnly) return isClubAdmin;
    if (!tab.permission) return isClubAdmin;
    return isClubAdmin || myPermissions.has(tab.permission);
  });

  const [activeTab, setActiveTab] = useState("overview");

  if (visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
    setActiveTab(visibleTabs[0].value);
  }

  const overviewTiles: OverviewTile[] = [
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
  ];

  const renderAdminTab = () => {
    if (!association) return null;
    switch (activeTab) {
      case "association": return <AssociationInfoTab club={association as any} clubId={association.id} />;
      case "affiliated": return <AffiliatedClubsTab clubId={association.id} />;
      case "leagues": return <LeaguesTab clubId={association.id} />;
      case "champs": return <ClubChampsTab clubId={association.id} />;
      case "members": return <MembersTab clubId={association.id} />;
      case "users": return <UsersTab clubId={association.id} />;
      case "banking": return <BankingTab club={association as any} clubId={association.id} />;
      case "finance": return <FinanceTab club={association as any} clubId={association.id} />;
      case "settings": return <SettingsTab club={association as any} clubId={association.id} />;
      case "permissions": return <PermissionsTab clubId={association.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleTabs.find(t => t.value === activeTab);

  return (
    <div className="bottom-nav-safe relative text-[13px]">
      <SEO title="Home" description="Your association hub." path="/" noIndex />

      <PageHeader
        title={association?.name || "Association"}
        subtitle={`Welcome back, ${firstName}`}
        showNotifications
        showProfile
        showChallengesInbox={false}
      />

      <div className="max-w-7xl mx-auto px-3 md:px-5 mt-3 space-y-4">
        {/* Tab grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-11 gap-2 md:gap-2.5">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 rounded-lg border p-2.5 md:p-3 transition-colors text-center min-h-[64px] md:min-h-[72px]",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-[11px] font-medium leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTabMeta && activeTab !== "overview" && (
          <div className="flex items-center gap-2 pt-1 border-t border-border/60">
            <activeTabMeta.icon className="w-4 h-4 text-primary mt-2" />
            <h2 className="text-sm font-semibold text-foreground mt-2">{activeTabMeta.label}</h2>
          </div>
        )}

        {/* Tab content */}
        {activeTab === "overview" ? (
          <div className="space-y-4">
            <AssociationWelcomeBanner />

            <ProfileCompletionMeter
              profile={profile}
              onAction={(action) => {
                if (action === "edit") openProfile("/profile?edit=1");
              }}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {overviewTiles.map((tile) => (
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
        ) : (
          <div className="[&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
            {renderAdminTab()}
          </div>
        )}
      </div>
    </div>
  );
}
