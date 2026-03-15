import { useState } from "react";
import { useMyClub, useIsClubAdmin } from "@/hooks/use-club";
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
    <div className="min-h-screen bg-background p-4 md:p-8 pb-24">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          {club.logo_url ? (
            <img src={club.logo_url} alt={`${club.name} logo`} className="w-10 h-10 object-contain rounded-md" />
          ) : (
            <Building2 className="w-8 h-8 text-primary" />
          )}
          <div>
            <h1 className="text-2xl font-bold font-heading">{club.name}</h1>
            <p className="text-sm text-muted-foreground">Club Administration</p>
            {club.subdomain && (
              <p className="text-xs text-primary font-mono mt-0.5">
                {club.subdomain}.squashhub.app
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="club" className="w-full">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="club" className="text-xs md:text-sm flex-1"><Building2 className="w-4 h-4 mr-1 hidden md:inline" />Club</TabsTrigger>
            <TabsTrigger value="members" className="text-xs md:text-sm flex-1"><Users className="w-4 h-4 mr-1 hidden md:inline" />Members</TabsTrigger>
            <TabsTrigger value="finance" className="text-xs md:text-sm flex-1"><Landmark className="w-4 h-4 mr-1 hidden md:inline" />Finance</TabsTrigger>
            <TabsTrigger value="banking" className="text-xs md:text-sm flex-1"><Banknote className="w-4 h-4 mr-1 hidden md:inline" />Banking</TabsTrigger>
            <TabsTrigger value="fees" className="text-xs md:text-sm flex-1"><DollarSign className="w-4 h-4 mr-1 hidden md:inline" />Fees</TabsTrigger>
            <TabsTrigger value="courts" className="text-xs md:text-sm flex-1"><LayoutGrid className="w-4 h-4 mr-1 hidden md:inline" />Courts</TabsTrigger>
            <TabsTrigger value="ladder" className="text-xs md:text-sm flex-1"><ListOrdered className="w-4 h-4 mr-1 hidden md:inline" />Ladder</TabsTrigger>
            <TabsTrigger value="leagues" className="text-xs md:text-sm flex-1"><Trophy className="w-4 h-4 mr-1 hidden md:inline" />Leagues</TabsTrigger>
            <TabsTrigger value="champs" className="text-xs md:text-sm flex-1"><Medal className="w-4 h-4 mr-1 hidden md:inline" />Champs</TabsTrigger>
            <TabsTrigger value="settings" className="text-xs md:text-sm flex-1"><Settings className="w-4 h-4 mr-1 hidden md:inline" />Settings</TabsTrigger>
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