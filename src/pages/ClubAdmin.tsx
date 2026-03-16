import { useState } from "react";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Trophy, DollarSign, Settings, ListOrdered, Medal, Landmark, LayoutGrid, Banknote } from "lucide-react";
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

export default function ClubAdmin() {
  const { user } = useAuth();
  const { data, isLoading } = useMyClub();
  const isAdmin = useIsClubAdmin();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (!data?.club) return <Navigate to="/register-club" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const club = data.club;

  return (
    <div className="min-h-screen bg-background p-3 md:p-5 pb-20 text-[13px]">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          {club.logo_url ? (
            <img src={club.logo_url} alt={`${club.name} logo`} className="w-8 h-8 object-contain rounded-md" />
          ) : (
            <Building2 className="w-6 h-6 text-primary" />
          )}
          <div>
            <h1 className="text-lg font-bold font-heading leading-tight">{club.name}</h1>
            <p className="text-[11px] text-muted-foreground">Club Administration</p>
            {club.subdomain && (
              <p className="text-[10px] text-primary font-mono">
                {club.subdomain}.squashhub.app
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="club" className="w-full [&_.space-y-6]:space-y-4 [&_.space-y-4]:space-y-3 [&_.space-y-3]:space-y-2 [&_h3]:text-sm [&_h3]:font-semibold [&_.p-4]:p-3 [&_.p-3]:p-2.5 [&_.gap-4]:gap-3 [&_.gap-3]:gap-2">
          <TabsList className="flex w-full overflow-x-auto h-8">
            <TabsTrigger value="club" className="text-[11px] flex-1 h-7 px-2"><Building2 className="w-3.5 h-3.5 mr-1 hidden md:inline" />Club</TabsTrigger>
            <TabsTrigger value="settings" className="text-[11px] flex-1 h-7 px-2"><Settings className="w-3.5 h-3.5 mr-1 hidden md:inline" />Settings</TabsTrigger>
            <TabsTrigger value="fees" className="text-[11px] flex-1 h-7 px-2"><DollarSign className="w-3.5 h-3.5 mr-1 hidden md:inline" />Fees</TabsTrigger>
            <TabsTrigger value="courts" className="text-[11px] flex-1 h-7 px-2"><LayoutGrid className="w-3.5 h-3.5 mr-1 hidden md:inline" />Courts</TabsTrigger>
            <TabsTrigger value="banking" className="text-[11px] flex-1 h-7 px-2"><Banknote className="w-3.5 h-3.5 mr-1 hidden md:inline" />Banking</TabsTrigger>
            <TabsTrigger value="finance" className="text-[11px] flex-1 h-7 px-2"><Landmark className="w-3.5 h-3.5 mr-1 hidden md:inline" />Finance</TabsTrigger>
            <TabsTrigger value="members" className="text-[11px] flex-1 h-7 px-2"><Users className="w-3.5 h-3.5 mr-1 hidden md:inline" />Members</TabsTrigger>
            <TabsTrigger value="ladder" className="text-[11px] flex-1 h-7 px-2"><ListOrdered className="w-3.5 h-3.5 mr-1 hidden md:inline" />Ladder</TabsTrigger>
            <TabsTrigger value="leagues" className="text-[11px] flex-1 h-7 px-2"><Trophy className="w-3.5 h-3.5 mr-1 hidden md:inline" />Leagues</TabsTrigger>
            <TabsTrigger value="champs" className="text-[11px] flex-1 h-7 px-2"><Medal className="w-3.5 h-3.5 mr-1 hidden md:inline" />Champs</TabsTrigger>
          </TabsList>

          <TabsContent value="club"><ClubInfoTab club={club} clubId={club.id} /></TabsContent>
          <TabsContent value="members"><MembersTab clubId={club.id} /></TabsContent>
          <TabsContent value="finance"><FinanceTab club={club} clubId={club.id} /></TabsContent>
          <TabsContent value="banking"><BankingTab club={club} clubId={club.id} /></TabsContent>
          <TabsContent value="fees"><FeesTab clubId={club.id} /></TabsContent>
          <TabsContent value="courts"><CourtsTab club={club} clubId={club.id} /></TabsContent>
          <TabsContent value="ladder"><LadderTab clubId={club.id} /></TabsContent>
          <TabsContent value="leagues"><LeaguesTab clubId={club.id} /></TabsContent>
          <TabsContent value="champs"><ClubChampsTab clubId={club.id} /></TabsContent>
          <TabsContent value="settings"><SettingsTab club={club} clubId={club.id} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}