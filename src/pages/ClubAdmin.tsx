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
  const visibleTabs = ADMIN_TABS.filter(tab => {
    if (isAdmin) return true;
    if (!tab.permission) return false; // permissions tab only for full admins
    return myPermissions.has(tab.permission);
  });

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
          {/* Tile grid — mockup-styled: white card, colored icon badge, clean label */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5",
                    isActive
                      ? "border-primary ring-2 ring-primary/20 shadow-sm"
                      : "border-border/70 hover:border-border"
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm",
                    ICON_BADGE_STYLES[tab.color] || "bg-primary text-primary-foreground"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-semibold leading-tight text-foreground truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>

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
