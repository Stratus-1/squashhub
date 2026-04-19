import { useState } from "react";
import { Club } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Building2, Users, Trophy, Settings, Medal, Landmark, Banknote, UserCheck, ShieldCheck, Network } from "lucide-react";

import { AssociationInfoTab } from "@/components/association-admin/AssociationInfoTab";
import { AffiliatedClubsTab } from "@/components/association-admin/AffiliatedClubsTab";
import { SettingsTab } from "@/components/club-admin/SettingsTab";
import { BankingTab } from "@/components/club-admin/BankingTab";
import { FinanceTab } from "@/components/club-admin/FinanceTab";
import { MembersTab } from "@/components/club-admin/MembersTab";
import { UsersTab } from "@/components/club-admin/UsersTab";
import { LeaguesTab } from "@/components/club-admin/LeaguesTab";
import { ClubChampsTab } from "@/components/club-admin/ClubChampsTab";
import { PermissionsTab } from "@/components/club-admin/PermissionsTab";
import { useMyPermissions, type PermissionSlug } from "@/hooks/use-club-permissions";
import { cn } from "@/lib/utils";

const ASSOC_TABS: { value: string; label: string; icon: any; permission?: PermissionSlug }[] = [
  { value: "association", label: "Association", icon: Building2, permission: "club" },
  { value: "settings", label: "Settings", icon: Settings, permission: "settings" },
  { value: "affiliated", label: "Affiliated Clubs", icon: Network, permission: "club" },
  { value: "leagues", label: "Regional Leagues", icon: Trophy, permission: "leagues" },
  { value: "champs", label: "Tournaments", icon: Medal, permission: "champs" },
  { value: "members", label: "Members", icon: Users, permission: "members" },
  { value: "users", label: "Users", icon: UserCheck, permission: "users" },
  { value: "banking", label: "Banking", icon: Banknote, permission: "banking" },
  { value: "finance", label: "Finance", icon: Landmark, permission: "finance" },
  { value: "permissions", label: "Permissions", icon: ShieldCheck },
];

interface Props {
  club: Club;
  isAdmin: boolean;
}

export function AssociationAdmin({ club, isAdmin }: Props) {
  const myPermissions = useMyPermissions();
  const [activeTab, setActiveTab] = useState("association");

  const visibleTabs = ASSOC_TABS.filter(tab => {
    if (!tab.permission) return isAdmin;
    return myPermissions.has(tab.permission);
  });

  if (visibleTabs.length > 0 && !visibleTabs.find(t => t.value === activeTab)) {
    setActiveTab(visibleTabs[0].value);
  }

  const renderContent = () => {
    switch (activeTab) {
      case "association": return <AssociationInfoTab club={club} clubId={club.id} />;
      case "settings": return <SettingsTab club={club} clubId={club.id} />;
      case "affiliated": return <AffiliatedClubsTab clubId={club.id} />;
      case "leagues": return <LeaguesTab clubId={club.id} />;
      case "champs": return <ClubChampsTab clubId={club.id} />;
      case "members": return <MembersTab clubId={club.id} />;
      case "users": return <UsersTab clubId={club.id} />;
      case "banking": return <BankingTab club={club} clubId={club.id} />;
      case "finance": return <FinanceTab club={club} clubId={club.id} />;
      case "permissions": return <PermissionsTab clubId={club.id} />;
      default: return null;
    }
  };

  const activeTabMeta = visibleTabs.find(t => t.value === activeTab);

  return (
    <div className="min-h-screen bg-background pb-20 text-[13px]">
      <PageHeader
        title={club.name}
        subtitle="Association Administration"
      />
      <div className="max-w-7xl mx-auto px-3 md:px-5 space-y-4">
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

export default AssociationAdmin;
