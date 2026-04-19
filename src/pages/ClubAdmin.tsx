import { useState } from "react";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote, Beer, DoorOpen, UserCheck, Globe, ShieldCheck, ChevronLeft } from "lucide-react";

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
import { useMyPermissions, type PermissionSlug } from "@/hooks/use-club-permissions";
import { cn } from "@/lib/utils";


const ADMIN_TABS: { value: string; label: string; icon: any; permission?: PermissionSlug }[] = [
  { value: "club", label: "Club", icon: Building2, permission: "club" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings" },
  { value: "fees", label: "Fees", icon: DollarSign, permission: "fees" },
  { value: "courts", label: "Courts", icon: LayoutGrid, permission: "courts" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance" },
  { value: "members", label: "Members", icon: Users, permission: "members" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users" },
  { value: "visitors", label: "Visitors", icon: Globe, permission: "visitors" },
  { value: "ladder", label: "Ladder", icon: ListOrdered, permission: "ladder" },
  { value: "leagues", label: "Leagues", icon: Trophy, permission: "leagues" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs" },
  { value: "bar", label: "Bar", icon: Beer, permission: "bar" },
  { value: "access", label: "Access", icon: DoorOpen, permission: "access" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck },
];

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

  // Filter tabs by permission — tabs without a permission slug (like "permissions") are only for full-access users
  const visibleTabs = ADMIN_TABS.filter(tab => {
    if (!tab.permission) return isAdmin; // permissions tab only for admins
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
      case "leagues": return <LeaguesTab clubId={club.id} />;
      case "champs": return <ClubChampsTab clubId={club.id} />;
      case "bar": return <HonestyBarTab club={club} clubId={club.id} />;
      case "access": return <AccessControlTab club={club} clubId={club.id} />;
      case "permissions": return <PermissionsTab clubId={club.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleTabs.find(t => t.value === activeTab);

  return (
    <div className="min-h-screen bg-background pb-20 text-[13px]">
      <PageHeader
        title={club.name}
        subtitle="Club Administration"
      />
      <div className="max-w-7xl mx-auto px-3 md:px-5 space-y-4">
        {/* Tile grid — responsive across all breakpoints */}
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2 md:gap-2.5">
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
  );
}
