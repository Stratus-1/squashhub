import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { AssociationWelcomeBanner } from "@/components/AssociationWelcomeBanner";
import { ProfileCompletionMeter } from "@/components/ProfileCompletionMeter";
import {
  LayoutDashboard, Building2, Network, Trophy, Medal, Users, UserCheck,
  Settings, Banknote, Landmark, ShieldCheck, ChevronRight, MessageCircle,
  BarChart3, Wallet, LifeBuoy, CalendarDays, Receipt, ShieldAlert, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile, useMyRoles } from "@/hooks/use-data";
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
import { AssociationMembersTab } from "@/components/association-admin/AssociationMembersTab";
import { AssociationFeesTab } from "@/components/association-admin/AssociationFeesTab";
import { AssociationSetupTab } from "@/components/association-admin/AssociationSetupTab";
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

const ADMIN_TABS: TabDef[] = [
  { value: "association", label: "Association", icon: Building2, permission: "club" },
  { value: "setup", label: "Setup", icon: Settings, permission: "settings" },
  { value: "affiliated", label: "Affiliated Clubs", icon: Network, permission: "club" },
  { value: "leagues", label: "Leagues", icon: Trophy, permission: "leagues" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs" },
  { value: "members", label: "Members", icon: Users, permission: "members" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users" },
  { value: "fees", label: "Fees", icon: Receipt, permission: "fees" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance" },
  { value: "settings", label: "Preferences", icon: Settings, permission: "settings" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck, adminOnly: true },
];

interface OverviewTile {
  to?: string;
  onClick?: () => void;
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
  const { data: myRoles = [] } = useMyRoles();
  const { data: clubData } = useMyClub();
  const { activeMember } = useMemberContext();
  const isClubAdmin = useIsClubAdmin();
  const isPlatformAdmin = myRoles.includes("admin");
  const myPermissions = useMyPermissions();

  const association = clubData?.club;
  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Member";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });

  const visibleAdminTabs = ADMIN_TABS.filter(tab => {
    if (isPlatformAdmin) return true;
    if (tab.adminOnly) return isClubAdmin;
    if (!tab.permission) return isClubAdmin;
    return isClubAdmin || myPermissions.has(tab.permission);
  });

  const hasAdminAccess = isPlatformAdmin || visibleAdminTabs.length > 0;

  // "overview" or admin tab value
  const [view, setView] = useState<string>("overview");
  const [adminTab, setAdminTab] = useState<string>(visibleAdminTabs[0]?.value || "");

  // Sync default admin tab once permissions resolve
  if (hasAdminAccess && !visibleAdminTabs.find(t => t.value === adminTab)) {
    setAdminTab(visibleAdminTabs[0].value);
  }

  // Deep-link via ?tab=members etc. → jump to admin view + tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (!tab) return;
    const match = visibleAdminTabs.find(t => t.value === tab);
    if (match) {
      setAdminTab(match.value);
      setView("admin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, visibleAdminTabs.length]);

  const overviewTiles: OverviewTile[] = [
    ...(hasAdminAccess ? [{
      onClick: () => setView("admin"),
      label: "Admin",
      description: "Association management & settings",
      icon: ShieldAlert,
      color: "text-primary bg-primary/10",
    }] : []),
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
      label: "Leagues",
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
      onClick: hasAdminAccess && visibleAdminTabs.some((tab) => tab.value === "settings")
        ? () => { setAdminTab("settings"); setView("admin"); }
        : undefined,
      to: hasAdminAccess && visibleAdminTabs.some((tab) => tab.value === "settings") ? undefined : "/settings",
      label: "Settings",
      description: hasAdminAccess ? "Association preferences" : "Theme & preferences",
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
    switch (adminTab) {
      case "association": return <AssociationInfoTab club={association as any} clubId={association.id} />;
      case "setup": return <AssociationSetupTab clubId={association.id} />;
      case "affiliated": return <AffiliatedClubsTab clubId={association.id} />;
      case "leagues": return <LeaguesTab clubId={association.id} />;
      case "champs": return <ClubChampsTab clubId={association.id} />;
      case "members": return <AssociationMembersTab clubId={association.id} />;
      case "users": return <UsersTab clubId={association.id} />;
      case "fees": return <AssociationFeesTab clubId={association.id} />;
      case "banking": return <BankingTab club={association as any} clubId={association.id} />;
      case "finance": return <FinanceTab club={association as any} clubId={association.id} />;
      case "settings": return <SettingsTab club={association as any} clubId={association.id} />;
      case "permissions": return <PermissionsTab clubId={association.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleAdminTabs.find(t => t.value === adminTab);
  const isAdminView = view === "admin";

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
        {!isAdminView ? (
          <div className="space-y-4">
            <AssociationWelcomeBanner />

            <ProfileCompletionMeter
              profile={profile}
              onAction={(action) => {
                if (action === "edit") openProfile("/profile?edit=1");
                if (action === "edit-then-account") openProfile("/profile?edit=1&next=account");
              }}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {overviewTiles.map((tile) => {
                const handle = () => {
                  if (tile.onClick) tile.onClick();
                  else if (tile.to) navigate(tile.to);
                };
                return (
                  <Card
                    key={tile.label}
                    role="button"
                    tabIndex={0}
                    onClick={handle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handle();
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
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("overview")}
                className="h-8 px-2"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-primary" /> Admin
              </h2>
              <span className="w-[60px]" />
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-11 gap-2 md:gap-2.5">
              {visibleAdminTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = adminTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setAdminTab(tab.value)}
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

            {activeTabMeta && (
              <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                <activeTabMeta.icon className="w-4 h-4 text-primary mt-2" />
                <h3 className="text-sm font-semibold text-foreground mt-2">{activeTabMeta.label}</h3>
              </div>
            )}

            <div className="[&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
              {renderAdminTab()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
