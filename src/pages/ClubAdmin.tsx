import { useState } from "react";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote, Beer, DoorOpen, UserCheck, Globe, ShieldCheck, ChevronLeft, Mail, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { useSetupStatus, type SetupStatusMap } from "@/hooks/use-setup-status";
import { RankingPointsTab } from "@/components/club-admin/RankingPointsTab";

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


type AdminTab = { value: string; label: string; icon: any; permission?: PermissionSlug; color: string; noStatus?: boolean };

const SETUP_TABS: AdminTab[] = [
  { value: "club", label: "Club", icon: Building2, permission: "club", color: "blue" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings", color: "slate" },
  { value: "courts", label: "Courts", icon: LayoutGrid, permission: "courts", color: "cyan" },
  { value: "fees", label: "Fees", icon: DollarSign, permission: "fees", color: "emerald" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking", color: "green" },
  { value: "access", label: "Access", icon: DoorOpen, permission: "access", color: "pink" },
  { value: "comms", label: "Comms", icon: Mail, permission: "communications", color: "blue" },
  { value: "ladder", label: "Ladder", icon: ListOrdered, permission: "ladder", color: "orange", noStatus: true },
  { value: "ranking-points", label: "Ranking Pts", icon: Sparkles, permission: "ladder", color: "yellow", noStatus: true },
  { value: "leagues", label: "Leagues", icon: Trophy, permission: "leagues", color: "amber", noStatus: true },
  { value: "bar", label: "Bar", icon: Beer, permission: "bar", color: "rose", noStatus: true },
  { value: "permissions", label: "Permissions", icon: ShieldCheck, color: "red", noStatus: true },
];

const OPERATIONS_TABS: AdminTab[] = [
  { value: "members", label: "Members", icon: Users, permission: "members", color: "indigo" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users", color: "violet" },
  { value: "visitors", label: "Visitors", icon: Globe, permission: "visitors", color: "sky" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs", color: "yellow" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance", color: "teal" },
];

const ADMIN_TABS: AdminTab[] = [...SETUP_TABS, ...OPERATIONS_TABS];

const COLOR_STYLES: Record<string, string> = {
  blue: "border-blue-500/50 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-200 dark:hover:bg-blue-500/25",
  slate: "border-slate-400/60 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:hover:bg-slate-500/25",
  emerald: "border-emerald-500/50 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25",
  cyan: "border-cyan-500/50 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-500/15 dark:text-cyan-200 dark:hover:bg-cyan-500/25",
  green: "border-green-500/50 bg-green-50 text-green-800 hover:bg-green-100 dark:bg-green-500/15 dark:text-green-200 dark:hover:bg-green-500/25",
  teal: "border-teal-500/50 bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-500/15 dark:text-teal-200 dark:hover:bg-teal-500/25",
  indigo: "border-indigo-500/50 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25",
  violet: "border-violet-500/50 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25",
  sky: "border-sky-500/50 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-200 dark:hover:bg-sky-500/25",
  orange: "border-orange-500/50 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:bg-orange-500/15 dark:text-orange-200 dark:hover:bg-orange-500/25",
  amber: "border-amber-500/50 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25",
  yellow: "border-yellow-500/50 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-500/15 dark:text-yellow-200 dark:hover:bg-yellow-500/25",
  rose: "border-rose-500/50 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25",
  pink: "border-pink-500/50 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:bg-pink-500/15 dark:text-pink-200 dark:hover:bg-pink-500/25",
  red: "border-red-500/50 bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25",
};

export default function ClubAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useMyClub();
  const isAdmin = useIsClubAdmin();
  const myPermissions = useMyPermissions();
  const [activeTab, setActiveTab] = useState("club");

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (!data?.club) return <Navigate to="/register-club" replace />;
  if (!isAdmin && myPermissions.size === 0) return <Navigate to="/dashboard" replace />;

  const club = data.club;

  // Associations have a unified dashboard at "/" — there's no separate admin page.
  if ((club as any).tenant_type === "association") {
    return <Navigate to="/" replace />;
  }

  // Filter tabs by permission — full admins (club captain/admin or platform super-admin) see everything
  const permFilter = (tab: AdminTab) => {
    if (isAdmin) return true;
    if (!tab.permission) return false; // permissions tab only for full admins
    return myPermissions.has(tab.permission);
  };
  const visibleSetup = SETUP_TABS.filter(permFilter);
  const visibleOps = OPERATIONS_TABS.filter(permFilter);
  const visibleTabs = [...visibleSetup, ...visibleOps];

  const setupStatus = useSetupStatus(club.id, club);

  // If active tab isn't visible, switch to first visible
  if (visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
    setActiveTab(visibleTabs[0].value);
  }

  const renderContent = () => {
    switch (activeTab) {
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

  return (
    <div className="min-h-screen pb-20 text-[13px]">
      <div>
        <PageHeader
          title={club.name}
          subtitle="Club Administration"
        />
        <div className="max-w-7xl mx-auto px-3 md:px-5 space-y-4">
          {/* Setup & Configuration tiles — with completion status */}
          {visibleSetup.length > 0 && (
            <div className="rounded-xl border border-border bg-card/95 backdrop-blur p-3 md:p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">Setup &amp; Configuration</h3>
                {(() => {
                  const total = visibleSetup.filter(t => !t.noStatus).length;
                  const done = visibleSetup.filter(t => !t.noStatus && setupStatus[t.value as keyof SetupStatusMap] === "complete").length;
                  return <span className="text-[10px] md:text-[11px] font-medium text-muted-foreground">{done}/{total} complete</span>;
                })()}
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 md:gap-2.5">
                {visibleSetup.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.value;
                  const showStatus = !tab.noStatus;
                  const status = showStatus ? setupStatus[tab.value as keyof SetupStatusMap] : undefined;
                  const isComplete = status === "complete";
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      title={showStatus ? (isComplete ? "Complete" : "Please complete") : undefined}
                      className={cn(
                        "relative flex flex-col items-center justify-center gap-1.5 rounded-lg border p-2.5 md:p-3 transition-colors text-center min-h-[64px] md:min-h-[72px]",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : COLOR_STYLES[tab.color] || "bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      {showStatus && (
                        isComplete ? (
                          <CheckCircle2 className="absolute top-1 right-1 w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-600 dark:text-emerald-400 fill-background" />
                        ) : (
                          <AlertCircle className="absolute top-1 right-1 w-3 h-3 md:w-3.5 md:h-3.5 text-amber-600 dark:text-amber-400 fill-background" />
                        )
                      )}
                      <Icon className="w-4 h-4 md:w-5 md:h-5" />
                      <span className="text-[10px] md:text-[11px] font-semibold leading-tight">{tab.label}</span>
                      {showStatus && (
                        <span className={cn(
                          "text-[8px] md:text-[9px] font-medium leading-none uppercase tracking-wide",
                          isActive ? "opacity-90" : isComplete ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                        )}>
                          {isComplete ? "Complete" : "Please complete"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Operations tiles */}
          {visibleOps.length > 0 && (
            <div className="rounded-xl border border-border bg-card/95 backdrop-blur p-3 md:p-4 shadow-sm space-y-2.5">
              <h3 className="text-[11px] md:text-xs font-bold uppercase tracking-wider text-muted-foreground">Operations &amp; Finance</h3>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 md:gap-2.5">
                {visibleOps.map((tab) => {
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
                          : COLOR_STYLES[tab.color] || "bg-card text-foreground border-border hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4 md:w-5 md:h-5" />
                      <span className="text-[10px] md:text-[11px] font-semibold leading-tight">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active section header + content */}
          {activeTabMeta && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/60">
              <activeTabMeta.icon className="w-4 h-4 text-primary mt-2" />
              <h2 className="text-sm font-semibold text-foreground mt-2">{activeTabMeta.label}</h2>
            </div>
          )}

          <div className="[&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
            {renderContent()}
          </div>
        </div>
        <BackToDashboard />
      </div>
    </div>
  );
}
