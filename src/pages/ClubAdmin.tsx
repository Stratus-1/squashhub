import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote, Beer, DoorOpen, UserCheck, Globe, ShieldCheck, ChevronLeft, Mail, Sparkles, LayoutDashboard } from "lucide-react";
import { RankingPointsTab } from "@/components/club-admin/RankingPointsTab";
import { AdminDashboardOverview } from "@/components/club-admin/AdminDashboardOverview";

import { ClubInfoTab } from "@/components/club-admin/ClubInfoTab";
import { FinanceTab } from "@/components/club-admin/FinanceTab";
import { BankingTab } from "@/components/club-admin/BankingTab";
import { CourtsTab } from "@/components/club-admin/CourtsTab";
import { MembersTab } from "@/components/club-admin/MembersTab";
import { LadderTab } from "@/components/club-admin/LadderTab";
import { LeaguesTab } from "@/components/club-admin/LeaguesTab";
import { FeesTab } from "@/components/club-admin/FeesTab";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { SettingsTab } from "@/components/club-admin/SettingsTab";
import { HonestyBarTab } from "@/components/club-admin/HonestyBarTab";
import { AccessControlTab } from "@/components/club-admin/AccessControlTab";
import { UsersTab } from "@/components/club-admin/UsersTab";
import { VisitorsTab } from "@/components/club-admin/VisitorsTab";
import { PermissionsTab } from "@/components/club-admin/PermissionsTab";
import { CommunicationsTab } from "@/components/club-admin/CommunicationsTab";
import { useMyPermissions, type PermissionSlug } from "@/hooks/use-club-permissions";
import { cn } from "@/lib/utils";
import squashCourtBg from "@/assets/squash-court-bg.jpg";


const ADMIN_TABS: { value: string; label: string; icon: any; permission?: PermissionSlug; color: string }[] = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, color: "blue" },
  { value: "club", label: "Club", icon: Building2, permission: "club", color: "blue" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings", color: "slate" },
  { value: "fees", label: "Fees", icon: DollarSign, permission: "fees", color: "emerald" },
  { value: "courts", label: "Courts", icon: LayoutGrid, permission: "courts", color: "cyan" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking", color: "green" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance", color: "teal" },
  { value: "members", label: "Members", icon: Users, permission: "members", color: "indigo" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users", color: "violet" },
  { value: "visitors", label: "Visitors", icon: Globe, permission: "visitors", color: "sky" },
  { value: "ladder", label: "Ladder", icon: ListOrdered, permission: "ladder", color: "orange" },
  { value: "ranking-points", label: "Ranking Pts", icon: Sparkles, permission: "ladder", color: "yellow" },
  { value: "leagues", label: "Leagues", icon: Trophy, permission: "leagues", color: "amber" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs", color: "yellow" },
  { value: "bar", label: "Bar", icon: Beer, permission: "bar", color: "rose" },
  { value: "access", label: "Access", icon: DoorOpen, permission: "access", color: "pink" },
  { value: "comms", label: "Comms", icon: Mail, permission: "communications", color: "blue" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck, color: "red" },
];

// Solid colored icon-badge styles (mockup-inspired: white tile, colored rounded icon square)
const ICON_BADGE_STYLES: Record<string, string> = {
  blue: "bg-blue-500 text-white",
  slate: "bg-slate-500 text-white",
  emerald: "bg-emerald-500 text-white",
  cyan: "bg-cyan-500 text-white",
  green: "bg-green-500 text-white",
  teal: "bg-teal-500 text-white",
  indigo: "bg-indigo-500 text-white",
  violet: "bg-violet-500 text-white",
  sky: "bg-sky-500 text-white",
  orange: "bg-orange-500 text-white",
  amber: "bg-amber-500 text-white",
  yellow: "bg-yellow-500 text-white",
  rose: "bg-rose-500 text-white",
  pink: "bg-pink-500 text-white",
  red: "bg-red-500 text-white",
};

export default function ClubAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useMyClub();
  const isAdmin = useIsClubAdmin();
  const myPermissions = useMyPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "dashboard";
  const [activeTab, setActiveTab] = useState<string>(tabFromUrl);

  useEffect(() => {
    if (tabFromUrl !== activeTab) setActiveTab(tabFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl]);

  const handleSetTab = (tab: string) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "dashboard") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (!data?.club) return <Navigate to="/register-club" replace />;
  if (!isAdmin && myPermissions.size === 0) return <Navigate to="/dashboard" replace />;

  const club = data.club;

  if ((club as any).tenant_type === "association") {
    return <Navigate to="/" replace />;
  }

  const visibleTabs = ADMIN_TABS.filter(tab => {
    if (tab.value === "dashboard") return true;
    if (isAdmin) return true;
    if (!tab.permission) return false;
    return myPermissions.has(tab.permission);
  });

  if (visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
    handleSetTab("dashboard");
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <AdminDashboardOverview clubId={club.id} clubName={club.name} onTab={handleSetTab} />;
      case "club": return <ClubInfoTab club={club} clubId={club.id} />;
      case "settings": return <SettingsTab club={club} clubId={club.id} />;
      case "fees": return <FeesTab clubId={club.id} />;
      case "courts": return <CourtsTab club={club} clubId={club.id} />;
      case "banking": return <BankingTab club={club} clubId={club.id} />;
      case "finance": return <FinanceTab club={club} clubId={club.id} />;
      case "members": return <MembersTab clubId={club.id} />;
      case "users": return <UsersTab clubId={club.id} />;
      case "visitors": return <VisitorsTab clubId={club.id} />;
      case "ladder": return <LadderTab clubId={club.id} />;
      case "ranking-points": return <RankingPointsTab clubId={club.id} />;
      case "leagues": return <LeaguesTab clubId={club.id} />;
      case "champs": return <ClubChampsTab clubId={club.id} />;
      case "bar": return <HonestyBarTab club={club} clubId={club.id} />;
      case "access": return <AccessControlTab club={club} clubId={club.id} />;
      case "comms": return <CommunicationsTab clubId={club.id} />;
      case "permissions": return <PermissionsTab clubId={club.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleTabs.find(t => t.value === activeTab);
  const isOverview = activeTab === "dashboard";

  return (
    <div className="min-h-screen pb-20 text-[13px]">
      <div>
        <PageHeader
          title={club.name}
          subtitle={isOverview ? "Welcome back 👋" : "Club Administration"}
        />
        <div className="max-w-7xl mx-auto px-3 md:px-5 space-y-4">
          {!isOverview && activeTabMeta && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg shadow-sm",
                  ICON_BADGE_STYLES[activeTabMeta.color] || "bg-primary text-primary-foreground"
                )}>
                  <activeTabMeta.icon className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-foreground">{activeTabMeta.label}</h2>
              </div>
              <button
                onClick={() => handleSetTab("dashboard")}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </button>
            </div>
          )}

          {isOverview && (
            <div className="md:hidden rounded-xl border border-border bg-card p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-2">Admin Sections</h3>
              <div className="grid grid-cols-3 gap-2">
                {visibleTabs.filter(t => t.value !== "dashboard").map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      onClick={() => handleSetTab(t.value)}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background p-2.5 hover:bg-muted/50 active:scale-95 transition"
                    >
                      <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg shadow-sm",
                        ICON_BADGE_STYLES[t.color] || "bg-primary text-primary-foreground"
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-medium text-foreground text-center leading-tight">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={isOverview ? "" : "[&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2"}>
            {renderContent()}
          </div>
        </div>
        <BackToDashboard />
      </div>
    </div>
  );
}
