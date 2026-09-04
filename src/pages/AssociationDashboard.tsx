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
import { useIsAssociationAdmin } from "@/hooks/use-association-admin";

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
import { AssociationLeaguesTab } from "@/components/association-admin/AssociationLeaguesTab";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { PermissionsTab } from "@/components/club-admin/PermissionsTab";
import { CommunicationsTab } from "@/components/club-admin/CommunicationsTab";
import { EmailLogTab } from "@/components/club-admin/EmailLogTab";
import { AssociationRankingsTab } from "@/components/association-admin/AssociationRankingsTab";

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
  { value: "rankings", label: "Rankings", icon: BarChart3, permission: "leagues" },
  { value: "members", label: "Members", icon: Users, permission: "members" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users" },
  { value: "fees", label: "Fees", icon: Receipt, permission: "fees" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance" },
  { value: "comms", label: "Comms", icon: MessageCircle, permission: "communications" },
  { value: "emails", label: "Email Log", icon: MessageCircle, permission: "communications" },
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
  border?: string;
  shadow?: string;
  show?: boolean;
}

const ADMIN_TAB_STYLES: Record<string, string> = {
  association: "border-blue-500/50 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:hover:bg-blue-500/25",
  setup: "border-slate-500/50 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-slate-500/15 dark:text-slate-200 dark:hover:bg-slate-500/25",
  affiliated: "border-sky-500/50 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25",
  leagues: "border-amber-500/50 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25",
  rankings: "border-violet-500/50 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25",
  champs: "border-purple-500/50 bg-purple-50 text-purple-800 hover:bg-purple-100 dark:bg-purple-500/15 dark:text-purple-200 dark:hover:bg-purple-500/25",
  members: "border-emerald-500/50 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25",
  users: "border-cyan-500/50 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-500/15 dark:text-cyan-200 dark:hover:bg-cyan-500/25",
  fees: "border-lime-500/50 bg-lime-50 text-lime-800 hover:bg-lime-100 dark:bg-lime-500/15 dark:text-lime-200 dark:hover:bg-lime-500/25",
  banking: "border-green-500/50 bg-green-50 text-green-800 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-200 dark:hover:bg-green-500/25",
  finance: "border-teal-500/50 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-200 dark:hover:bg-teal-500/25",
  comms: "border-rose-500/50 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25",
  emails: "border-pink-500/50 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:bg-pink-500/15 dark:text-pink-200 dark:hover:bg-pink-500/25",
  settings: "border-slate-500/50 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-slate-500/15 dark:text-slate-200 dark:hover:bg-slate-500/25",
  permissions: "border-red-500/50 bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25",
};

export default function AssociationDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile } = useProfile();
  const { data: myRoles = [] } = useMyRoles();
  const { data: clubData } = useMyClub();
  const association = clubData?.club;
  const { activeMember } = useMemberContext();
  const isClubAdmin = useIsClubAdmin();
  const isAssociationAdmin = useIsAssociationAdmin(association?.id);
  const isPlatformAdmin = myRoles.includes("admin");
  const myPermissions = useMyPermissions();
  const firstName = (activeMember?.name || profile?.name)?.split(" ")[0] || "Member";
  const openProfile = (to: string = "/profile") => navigate(to, { state: { backgroundLocation: location } });

  const visibleAdminTabs = ADMIN_TABS.filter(tab => {
    if (isPlatformAdmin) return true;
    if (tab.adminOnly) return isClubAdmin || isAssociationAdmin;
    if (!tab.permission) return isClubAdmin || isAssociationAdmin;
    return isClubAdmin || isAssociationAdmin || myPermissions.has(tab.permission);
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

  // Tabs promoted onto the dashboard as coloured tiles (still open inside admin view)
  const PROMOTED: { value: string; label: string; description: string; icon: any; color: string; gradient: string; border: string; shadow: string }[] = [
    { value: "affiliated", label: "Affiliated Clubs", description: "Clubs in this association", icon: Network, color: "text-sky-600", gradient: "from-sky-400 to-blue-600", border: "border-sky-200 dark:border-sky-800", shadow: "shadow-sky-500/10" },
    { value: "leagues", label: "Leagues", description: "Seasons, teams & fixtures", icon: Trophy, color: "text-amber-600", gradient: "from-amber-400 to-orange-500", border: "border-amber-200 dark:border-amber-800", shadow: "shadow-amber-500/10" },
    { value: "champs", label: "Tournaments", description: "Draws, entries & results", icon: Medal, color: "text-purple-600", gradient: "from-purple-400 to-fuchsia-600", border: "border-purple-200 dark:border-purple-800", shadow: "shadow-purple-500/10" },
    { value: "rankings", label: "Rankings", description: "Player rankings & data sync", icon: BarChart3, color: "text-violet-600", gradient: "from-violet-400 to-indigo-600", border: "border-violet-200 dark:border-violet-800", shadow: "shadow-violet-500/10" },
    { value: "members", label: "Members", description: "League members across clubs", icon: Users, color: "text-emerald-600", gradient: "from-emerald-400 to-teal-600", border: "border-emerald-200 dark:border-emerald-800", shadow: "shadow-emerald-500/10" },
    { value: "users", label: "Users", description: "Logins & access", icon: UserCheck, color: "text-cyan-600", gradient: "from-cyan-400 to-blue-500", border: "border-cyan-200 dark:border-cyan-800", shadow: "shadow-cyan-500/10" },
    { value: "fees", label: "Fees", description: "League & affiliation fees", icon: Receipt, color: "text-lime-600", gradient: "from-lime-400 to-emerald-600", border: "border-lime-200 dark:border-lime-800", shadow: "shadow-lime-500/10" },
    { value: "finance", label: "Finance", description: "Ledger & club billing", icon: Landmark, color: "text-teal-600", gradient: "from-teal-400 to-cyan-600", border: "border-teal-200 dark:border-teal-800", shadow: "shadow-teal-500/10" },
    { value: "banking", label: "Banking", description: "Bank account & statements", icon: Banknote, color: "text-green-600", gradient: "from-green-400 to-emerald-600", border: "border-green-200 dark:border-green-800", shadow: "shadow-green-500/10" },
    { value: "comms", label: "Comms", description: "Templates & campaigns", icon: MessageCircle, color: "text-rose-600", gradient: "from-rose-400 to-pink-600", border: "border-rose-200 dark:border-rose-800", shadow: "shadow-rose-500/10" },
  ];

  const promotedTiles: OverviewTile[] = PROMOTED
    .filter((p) => visibleAdminTabs.some((t) => t.value === p.value))
    .map((p) => ({
      onClick: () => { setAdminTab(p.value); setView("admin"); },
      label: p.label,
      description: p.description,
      icon: p.icon,
      color: `${p.color} bg-gradient-to-br ${p.gradient}`,
      border: p.border,
      shadow: p.shadow,
    }));

  const overviewTiles: OverviewTile[] = [
    ...(hasAdminAccess ? [{
      onClick: () => {
        const first = visibleAdminTabs.find((t) => !PROMOTED.some((p) => p.value === t.value));
        if (first) setAdminTab(first.value);
        setView("admin");
      },

      label: "Setup",
      description: "Association setup & configuration",
      icon: Settings,
      color: "text-white bg-gradient-to-br from-primary to-primary/80",
      border: "border-primary/30 dark:border-primary/40",
      shadow: "shadow-primary/15",
    }] : []),
    ...promotedTiles,
    {
      to: "/my-account",
      label: "My Account",
      description: "Profile, fees & preferences",
      icon: Wallet,
      color: "text-white bg-gradient-to-br from-indigo-500 to-violet-600",
      border: "border-indigo-200 dark:border-indigo-800",
      shadow: "shadow-indigo-500/10",
    },
    {
      to: "/support",
      label: "Support",
      description: "Get help",
      icon: LifeBuoy,
      color: "text-white bg-gradient-to-br from-orange-500 to-red-500",
      border: "border-orange-200 dark:border-orange-800",
      shadow: "shadow-orange-500/10",
    },
  ];


  const renderAdminTab = () => {
    if (!association) return null;
    switch (adminTab) {
      case "association": return <AssociationInfoTab club={association as any} clubId={association.id} />;
      case "setup": return <AssociationSetupTab clubId={association.id} />;
      case "affiliated": return <AffiliatedClubsTab clubId={association.id} />;
      case "leagues": return <AssociationLeaguesTab clubId={association.id} />;
      case "champs": return <ClubChampsTab clubId={association.id} />;
      case "rankings": return <AssociationRankingsTab clubId={association.id} />;
      case "members": return <AssociationMembersTab clubId={association.id} />;
      case "users": return <UsersTab clubId={association.id} />;
      case "fees": return <AssociationFeesTab clubId={association.id} />;
      case "banking": return <BankingTab club={association as any} clubId={association.id} />;
      case "finance": return <FinanceTab club={association as any} clubId={association.id} />;
      case "comms": return <CommunicationsTab clubId={association.id} />;
      case "emails": return <EmailLogTab clubId={association.id} mode="association" />;
      case "settings": return <SettingsTab club={association as any} clubId={association.id} />;
      case "permissions": return <PermissionsTab clubId={association.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleAdminTabs.find(t => t.value === adminTab);
  const isAdminView = view === "admin";

  return (
    <div className="bottom-nav-safe relative text-[13px]">
      <SEO title="Association Dashboard" description="Your association hub." path="/" noIndex />

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
                    className={cn(
                      "p-3 cursor-pointer transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring border-2 hover:-translate-y-0.5 hover:shadow-md",
                      tile.border || "border-border",
                      tile.shadow || ""
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 shadow-sm", tile.color)}>
                      <tile.icon className="w-5 h-5 text-white" />
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
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("overview")}
                className="h-8 px-2 shrink-0"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-4 h-4 text-primary shrink-0" />
                <h2 className="text-sm font-semibold truncate">{activeTabMeta?.label || "Admin"}</h2>
              </div>
              <select
                aria-label="Go to association admin section"
                value={adminTab}
                onChange={(e) => setAdminTab(e.target.value)}
                className="h-8 max-w-[190px] rounded-md border border-input bg-background px-2 text-xs shrink-0"
              >
                {visibleAdminTabs.map((tab) => <option key={tab.value} value={tab.value}>{tab.label}</option>)}
              </select>
            </div>

            <div className="[&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
              {renderAdminTab()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
