import { useState } from "react";
import { useMyClub, useIsClubAdmin, useUpdateClub, useClubMembers, useLeagueAssociations, useLeagues, useNationalBodyFees } from "@/hooks/use-club";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Users, Trophy, DollarSign, Settings } from "lucide-react";
import { ClubDetailsTab } from "@/components/club-admin/ClubDetailsTab";
import { MembersTab } from "@/components/club-admin/MembersTab";
import { LeaguesTab } from "@/components/club-admin/LeaguesTab";
import { FeesTab } from "@/components/club-admin/FeesTab";

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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-heading">{club.name}</h1>
            <p className="text-sm text-muted-foreground">Club Administration</p>
          </div>
        </div>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" className="text-xs md:text-sm"><Settings className="w-4 h-4 mr-1 hidden md:inline" />Details</TabsTrigger>
            <TabsTrigger value="members" className="text-xs md:text-sm"><Users className="w-4 h-4 mr-1 hidden md:inline" />Members</TabsTrigger>
            <TabsTrigger value="leagues" className="text-xs md:text-sm"><Trophy className="w-4 h-4 mr-1 hidden md:inline" />Leagues</TabsTrigger>
            <TabsTrigger value="fees" className="text-xs md:text-sm"><DollarSign className="w-4 h-4 mr-1 hidden md:inline" />Fees</TabsTrigger>
          </TabsList>

          <TabsContent value="details"><ClubDetailsTab club={club} /></TabsContent>
          <TabsContent value="members"><MembersTab clubId={club.id} /></TabsContent>
          <TabsContent value="leagues"><LeaguesTab clubId={club.id} /></TabsContent>
          <TabsContent value="fees"><FeesTab clubId={club.id} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
