import { useState } from "react";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote, Beer, DoorOpen, UserCheck } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const ADMIN_TABS = [
  { value: "club", label: "Club", icon: Building2 },
  { value: "settings", label: "Settings", icon: Settings },
  { value: "fees", label: "Fees", icon: DollarSign },
  { value: "courts", label: "Courts", icon: LayoutGrid },
  { value: "banking", label: "Banking", icon: Banknote },
  { value: "finance", label: "Finance", icon: Landmark },
  { value: "members", label: "Members", icon: Users },
  { value: "ladder", label: "Ladder", icon: ListOrdered },
  { value: "leagues", label: "Leagues", icon: Trophy },
  { value: "champs", label: "Champs", icon: Medal },
  { value: "bar", label: "Bar", icon: Beer },
  { value: "access", label: "Access", icon: DoorOpen },
] as const;

export default function ClubAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useMyClub();
  const isAdmin = useIsClubAdmin();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("club");

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (!data?.club) return <Navigate to="/register-club" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const club = data.club;

  const renderContent = () => {
    switch (activeTab) {
      case "club": return <ClubInfoTab club={club} clubId={club.id} />;
      case "settings": return <SettingsTab club={club} clubId={club.id} />;
      case "fees": return <FeesTab clubId={club.id} />;
      case "courts": return <CourtsTab club={club} clubId={club.id} />;
      case "banking": return <BankingTab club={club} clubId={club.id} />;
      case "finance": return <FinanceTab club={club} clubId={club.id} />;
      case "members": return <MembersTab clubId={club.id} />;
      case "ladder": return <LadderTab clubId={club.id} />;
      case "leagues": return <LeaguesTab clubId={club.id} />;
      case "champs": return <ClubChampsTab clubId={club.id} />;
      case "bar": return <HonestyBarTab club={club} clubId={club.id} />;
      case "access": return <AccessControlTab club={club} clubId={club.id} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 text-[13px]">
      <PageHeader
        title={club.name}
        subtitle="Club Administration"
      />
      <div className="max-w-7xl mx-auto px-3 md:px-5 space-y-4">

        {/* Mobile: icon tile grid */}
        {isMobile ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {ADMIN_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-lg border p-2.5 transition-colors text-center",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="w-4.5 h-4.5" />
                    <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <div>{renderContent()}</div>
          </div>
        ) : (
          /* Desktop: horizontal tabs */
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full [&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
            <TabsList className="flex w-full overflow-x-auto h-8">
              {ADMIN_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="text-[11px] flex-1 h-7 px-2">
                  <tab.icon className="w-3.5 h-3.5 mr-1" />{tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {ADMIN_TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                {renderContent()}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
      <BackToDashboard />
    </div>
  );
}