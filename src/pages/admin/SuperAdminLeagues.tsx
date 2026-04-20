import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Calendar, MapPin, Users, Trophy, List, Pencil, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export default function SuperAdminLeagues() {
  const [selectedAssociation, setSelectedAssociation] = useState<string | null>(null);
  const [fixtureSearch, setFixtureSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const { data: associations } = useQuery({
    queryKey: ["admin-associations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_associations")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Auto-select first association
  const activeAssociation = selectedAssociation || associations?.[0]?.id || null;
  const activeAssociationName = associations?.find((a) => a.id === activeAssociation)?.name || "";

  const { data: fixtures } = useQuery({
    queryKey: ["admin-fixtures", activeAssociation],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .eq("association_id", activeAssociation!)
        .order("fixture_date", { ascending: true })
        .limit(3000);
      if (error) throw error;
      return data;
    },
    enabled: !!activeAssociation,
  });

  const { data: members } = useQuery({
    queryKey: ["admin-league-members", activeAssociation],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_members" as any)
        .select("*")
        .eq("association_id", activeAssociation!)
        .order("surname")
        .limit(3000);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeAssociation,
  });

  const filteredFixtures = (fixtures || []).filter((f) =>
    !fixtureSearch ||
    f.division?.toLowerCase().includes(fixtureSearch.toLowerCase()) ||
    f.home_team_code?.toLowerCase().includes(fixtureSearch.toLowerCase()) ||
    f.away_team_code?.toLowerCase().includes(fixtureSearch.toLowerCase()) ||
    f.venue_name?.toLowerCase().includes(fixtureSearch.toLowerCase())
  );

  const filteredMembers = (members || []).filter((m: any) =>
    !memberSearch ||
    m.user_code?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.surname?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.first_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.club_name?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const uniqueClubs = [...new Set((members || []).map((m: any) => m.club_name).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">League Management</h2>
        <p className="text-muted-foreground text-sm mt-1">Manage associations, fixtures, and members</p>
      </div>

      {/* Association selector */}
      {associations && associations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {associations.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAssociation(a.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                activeAssociation === a.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:bg-muted"
              }`}
            >
              <Trophy className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
              {a.name}
            </button>
          ))}
        </div>
      )}

      {activeAssociation && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">League</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold">{activeAssociationName}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Fixtures</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fixtures?.length ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Members</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{members?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">{uniqueClubs.length} clubs</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="fixtures" className="space-y-4">
            <TabsList>
              <TabsTrigger value="fixtures" className="gap-1.5">
                <List className="h-4 w-4" /> Fixtures
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-1.5">
                <Users className="h-4 w-4" /> Members
              </TabsTrigger>
            </TabsList>

            {/* Fixtures Tab */}
            <TabsContent value="fixtures" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by division, team or venue..."
                  value={fixtureSearch}
                  onChange={(e) => setFixtureSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="space-y-2">
                {filteredFixtures.map((f) => (
                  <Card key={f.id} className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">
                          {f.fixture_date ? format(parseISO(f.fixture_date), "dd MMM yyyy") : "TBC"}
                        </span>
                        <Badge variant="outline" className="text-xs">{f.division}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold">{f.home_team_code}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="font-semibold">{f.away_team_code}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {f.venue_name || "TBC"}
                      </div>
                    </div>
                  </Card>
                ))}
                {filteredFixtures.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No fixtures found</p>
                )}
              </div>
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by NSF number, name or club..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="rounded-md border overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">NSF #</TableHead>
                      <TableHead>Surname</TableHead>
                      <TableHead>First Name</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead className="text-center w-[80px]">Matches</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead>Qualifications</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.slice(0, 200).map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.user_code}</TableCell>
                        <TableCell className="font-medium">{m.surname}</TableCell>
                        <TableCell>{m.first_name}</TableCell>
                        <TableCell className="text-sm">{m.club_name}</TableCell>
                        <TableCell className="text-center">{m.league_matches || 0}</TableCell>
                        <TableCell>
                          <Badge variant={m.user_state === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                            {m.user_state}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.qualifications || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filteredMembers.length > 200 && (
                <p className="text-sm text-muted-foreground text-center">
                  Showing 200 of {filteredMembers.length} members. Use search to narrow results.
                </p>
              )}
              {filteredMembers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No members found</p>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {(!associations || associations.length === 0) && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No leagues registered yet.</p>
        </Card>
      )}
    </div>
  );
}
