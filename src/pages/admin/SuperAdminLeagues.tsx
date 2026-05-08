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
import { Search, Calendar, MapPin, Users, Trophy, List, Pencil, Trash2, AlertTriangle, ScrollText, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import AssociationRulesTab from "@/components/super-admin/league/AssociationRulesTab";
import AssociationPenaltiesTab from "@/components/super-admin/league/AssociationPenaltiesTab";

export default function SuperAdminLeagues() {
  const queryClient = useQueryClient();
  const [selectedAssociation, setSelectedAssociation] = useState<string | null>(null);
  const [fixtureSearch, setFixtureSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", short_code: "", region: "", season_year: new Date().getFullYear(), status: "active" });
  const [syncing, setSyncing] = useState(false);
  const [syncingMembers, setSyncingMembers] = useState(false);

  const activeAssociationObj = (a: any[] | undefined, id: string | null) =>
    (a ?? []).find((x) => x.id === id) || null;

  const handleSyncFromNsa = async (assocId: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-sync-fixtures", {
        body: { association_id: assocId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success((data as any)?.summary || "Fixtures synced");
      queryClient.invalidateQueries({ queryKey: ["admin-fixtures", assocId] });
      queryClient.invalidateQueries({ queryKey: ["admin-associations"] });
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncMembersFromNsa = async (assocId: string) => {
    setSyncingMembers(true);
    try {
      const { data, error } = await supabase.functions.invoke("nsa-sync-members", {
        body: { association_id: assocId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success((data as any)?.summary || "Members synced");
      queryClient.invalidateQueries({ queryKey: ["admin-league-members", assocId] });
      queryClient.invalidateQueries({ queryKey: ["admin-associations"] });
    } catch (e: any) {
      toast.error(e?.message || "Member sync failed");
    } finally {
      setSyncingMembers(false);
    }
  };

  const openEdit = (a: any) => {
    setForm({
      name: a.name ?? "",
      short_code: a.short_code ?? "",
      region: a.region ?? "",
      season_year: a.season_year ?? new Date().getFullYear(),
      status: a.status ?? "active",
    });
    setEditing(a);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("platform_league_associations")
      .update({
        name: form.name.trim(),
        short_code: form.short_code.trim().toUpperCase(),
        region: form.region.trim(),
        season_year: Number(form.season_year),
        status: form.status,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("League updated");
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: ["admin-associations"] });
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase
      .from("platform_league_associations")
      .delete()
      .eq("id", deleting.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Deleted ${deleting.name}`);
    if (selectedAssociation === deleting.id) setSelectedAssociation(null);
    setDeleting(null);
    queryClient.invalidateQueries({ queryKey: ["admin-associations"] });
  };

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

  // Auto-select first association — prefer one linked to an external source (e.g. NSA)
  const activeAssociation =
    selectedAssociation ||
    associations?.find((a: any) => a.external_source)?.id ||
    associations?.[0]?.id ||
    null;
  const activeAssociationDetails = activeAssociationObj(associations as any[] | undefined, activeAssociation);
  const activeAssociationName = associations?.find((a) => a.id === activeAssociation)?.name || "";

  const { data: fixtures } = useQuery({
    queryKey: ["admin-fixtures", activeAssociation],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_league_fixtures")
        .select("*")
        .eq("association_id", activeAssociation!)
        .order("fixture_date", { ascending: true })
        .range(0, 49999);
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
        .range(0, 49999);
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
    m.club_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.affiliation?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const uniqueClubs = [...new Set((members || []).map((m: any) => m.club_name).filter(Boolean))].sort();

  // Which NSA user_codes are linked to a local club_member via affiliations?
  const { data: linkedCodes } = useQuery({
    queryKey: ["admin-league-members-linked", activeAssociation],
    queryFn: async () => {
      const { data: las } = await supabase
        .from("league_associations")
        .select("id")
        .eq("platform_association_id", activeAssociation!);
      const ids = (las ?? []).map((r: any) => r.id);
      if (ids.length === 0) return new Set<string>();
      const { data: affs } = await supabase
        .from("member_association_affiliations")
        .select("league_association_number")
        .in("association_id", ids)
        .range(0, 49999);
      const set = new Set<string>();
      for (const a of affs ?? []) {
        if (a.league_association_number) set.add(String(a.league_association_number).toUpperCase());
      }
      return set;
    },
    enabled: !!activeAssociation,
  });

  // Group filtered members by club_name → team (affiliation)
  const groupedMembers = (() => {
    const byClub = new Map<string, Map<string, any[]>>();
    for (const m of filteredMembers) {
      const club = m.club_name || "— No club —";
      const team = m.affiliation || "— No team —";
      if (!byClub.has(club)) byClub.set(club, new Map());
      const teamMap = byClub.get(club)!;
      if (!teamMap.has(team)) teamMap.set(team, []);
      teamMap.get(team)!.push(m);
    }
    return [...byClub.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([club, teams]) => ({
        club,
        teams: [...teams.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([team, players]) => {
            const active = players.filter((p) => p.user_state === "ACTIVE").length;
            return { team, players, active, inactive: players.length - active };
          }),
      }));
  })();

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
            <div
              key={a.id}
              className={`flex items-stretch rounded-lg overflow-hidden border ${
                activeAssociation === a.id
                  ? "border-primary"
                  : "border-border"
              }`}
            >
              <button
                onClick={() => setSelectedAssociation(a.id)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeAssociation === a.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground hover:bg-muted"
                }`}
              >
                <Trophy className="inline-block h-4 w-4 mr-1.5 -mt-0.5" />
                {a.name}
              </button>
              <button
                onClick={() => openEdit(a)}
                title="Edit league"
                className="px-2 bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-l border-border transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDeleting(a)}
                title="Delete league"
                className="px-2 bg-card hover:bg-destructive/10 text-muted-foreground hover:text-destructive border-l border-border transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
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
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold">{members?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">{uniqueClubs.length} clubs</p>
                {activeAssociationDetails?.external_source ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSyncMembersFromNsa(activeAssociationDetails.id)}
                    disabled={syncingMembers}
                    className="h-8"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncingMembers ? "animate-spin" : ""}`} />
                    {syncingMembers ? "Syncing…" : "Sync members from NSA"}
                  </Button>
                ) : null}
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
              <TabsTrigger value="penalties" className="gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Penalties
              </TabsTrigger>
              <TabsTrigger value="rules" className="gap-1.5">
                <ScrollText className="h-4 w-4" /> Rules
              </TabsTrigger>
            </TabsList>

            {/* Fixtures Tab */}
            <TabsContent value="fixtures" className="space-y-4">
              {(() => {
                const a = activeAssociationObj(associations as any[], activeAssociation);
                if (!a?.external_source) return null;
                return (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-muted/30">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground uppercase tracking-wide">{a.external_source}</span>
                      {a.external_season ? <span className="ml-1">· season {a.external_season}</span> : null}
                      {a.last_fixtures_sync_at ? (
                        <span className="ml-2">
                          · last synced {formatDistanceToNow(new Date(a.last_fixtures_sync_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="ml-2 text-amber-600">· never synced</span>
                      )}
                      {a.last_fixtures_sync_summary ? (
                        <div className="text-[11px] mt-0.5 opacity-75">{a.last_fixtures_sync_summary}</div>
                      ) : null}
                    </div>
                    <Button size="sm" onClick={() => handleSyncFromNsa(a.id)} disabled={syncing}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                      {syncing ? "Syncing…" : "Sync from NSA"}
                    </Button>
                  </div>
                );
              })()}
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
              {(() => {
                const a = activeAssociationObj(associations as any[], activeAssociation);
                if (!a?.external_source) return null;
                return (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-muted/30">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground uppercase tracking-wide">{a.external_source}</span>
                      {a.external_season ? <span className="ml-1">· season {a.external_season}</span> : null}
                      {a.last_members_sync_at ? (
                        <span className="ml-2">
                          · last synced {formatDistanceToNow(new Date(a.last_members_sync_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="ml-2 text-amber-600">· never synced</span>
                      )}
                      {a.last_members_sync_summary ? (
                        <div className="text-[11px] mt-0.5 opacity-75">{a.last_members_sync_summary}</div>
                      ) : null}
                    </div>
                    <Button size="sm" onClick={() => handleSyncMembersFromNsa(a.id)} disabled={syncingMembers}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${syncingMembers ? "animate-spin" : ""}`} />
                      {syncingMembers ? "Syncing…" : "Sync members from NSA"}
                    </Button>
                  </div>
                );
              })()}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by NSF number, name or club..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="rounded-md border overflow-auto max-h-[600px] divide-y">
                {groupedMembers.map((g) => {
                  const totalActive = g.teams.reduce((s, t) => s + t.active, 0);
                  const totalInactive = g.teams.reduce((s, t) => s + t.inactive, 0);
                  return (
                    <details key={g.club} className="group" open={memberSearch.length > 0}>
                      <summary className="cursor-pointer select-none px-3 py-2 bg-muted/40 hover:bg-muted/60 flex items-center justify-between text-sm font-medium">
                        <span>{g.club}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          {g.teams.length} team{g.teams.length === 1 ? "" : "s"} · {totalActive} active
                          {totalInactive > 0 ? ` · ${totalInactive} inactive` : ""}
                        </span>
                      </summary>
                      <div className="divide-y">
                        {g.teams.map((t) => (
                          <details key={t.team} className="group/team" open={memberSearch.length > 0 || g.teams.length <= 3}>
                            <summary className="cursor-pointer select-none px-6 py-1.5 hover:bg-muted/30 flex items-center justify-between text-xs">
                              <span className="font-mono font-semibold">{t.team}</span>
                              <span className="text-muted-foreground">
                                {t.active} active{t.inactive > 0 ? ` · ${t.inactive} inactive` : ""}
                              </span>
                            </summary>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-[100px] pl-10">NSF #</TableHead>
                                  <TableHead>Surname</TableHead>
                                  <TableHead>First Name</TableHead>
                                  <TableHead className="text-center w-[80px]">Matches</TableHead>
                                  <TableHead className="w-[80px]">Status</TableHead>
                                  <TableHead className="w-[100px]">Linked</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {t.players.map((m: any) => {
                                  const isLinked = linkedCodes?.has(String(m.user_code).toUpperCase());
                                  return (
                                    <TableRow key={m.id}>
                                      <TableCell className="font-mono text-xs pl-10">{m.user_code}</TableCell>
                                      <TableCell className="font-medium">{m.surname}</TableCell>
                                      <TableCell>{m.first_name}</TableCell>
                                      <TableCell className="text-center">{m.league_matches || 0}</TableCell>
                                      <TableCell>
                                        <Badge variant={m.user_state === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                                          {m.user_state}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        {isLinked ? (
                                          <Badge variant="outline" className="text-[10px]">linked</Badge>
                                        ) : (
                                          <span className="text-[10px] text-muted-foreground">—</span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </details>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
              {filteredMembers.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No members found</p>
              )}
            </TabsContent>

            {/* Penalties Tab */}
            <TabsContent value="penalties" className="space-y-4">
              {activeAssociation ? <AssociationPenaltiesTab associationId={activeAssociation} /> : <p className="text-sm text-muted-foreground">Select a league to view penalties.</p>}
            </TabsContent>

            {/* Rules Tab */}
            <TabsContent value="rules" className="space-y-4">
              {activeAssociation ? <AssociationRulesTab associationId={activeAssociation} /> : <p className="text-sm text-muted-foreground">Select a league to configure rules.</p>}
            </TabsContent>
          </Tabs>
        </>
      )}

      {(!associations || associations.length === 0) && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No leagues registered yet.</p>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit League Association</DialogTitle>
            <DialogDescription>Update the platform-wide league details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="la-name">Name</Label>
              <Input id="la-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="la-code">Short Code</Label>
                <Input id="la-code" value={form.short_code} onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="la-year">Season Year</Label>
                <Input id="la-year" type="number" value={form.season_year} onChange={(e) => setForm((f) => ({ ...f, season_year: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-region">Region</Label>
              <Input id="la-region" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="la-status">Status</Label>
              <select
                id="la-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.short_code.trim()}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the league association along with all of its imported fixtures and members. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
