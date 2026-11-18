import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Building2, PlusCircle, LogOut } from "lucide-react";
import { usePlatformAssociation } from "@/hooks/use-platform-association";
import { NsaClubImportPanel } from "@/components/association-admin/NsaClubImportPanel";
import { moveClubToAssociation } from "@/lib/federation/move-club";

interface StructureClub {
  club_id: string;
  name: string;
  subdomain: string | null;
  logo_url: string | null;
}

interface OrgRow { id: string; kind: string; name: string; club_id: string | null; metadata: any; active: boolean }

export function AffiliatedClubsTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const db = supabase as any;
  const { data: platformAssoc } = usePlatformAssociation(clubId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubContact, setNewClubContact] = useState("");
  const [newClubEmail, setNewClubEmail] = useState("");

  // This association's organisation in the national structure
  const { data: myOrgId = null } = useQuery({
    queryKey: ["association-structure-org", clubId],
    queryFn: async () => {
      const { data, error } = await db.rpc("federation_tenant_org", { _tenant_id: clubId });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });

  // Clubs of this association — straight from the national structure
  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["association-structure-clubs", clubId],
    queryFn: async () => {
      const { data, error } = await db.rpc("association_structure_clubs", { _tenant_id: clubId });
      if (error) throw error;
      return ((data || []) as StructureClub[]).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    },
  });

  // Structure: associations (for Move to…) and every club's current association
  const { data: structure } = useQuery({
    queryKey: ["federation-structure-lite"],
    staleTime: 60_000,
    queryFn: async () => {
      const [orgRes, relRes] = await Promise.all([
        db.from("organisations").select("id, kind, name, club_id, metadata, active").in("kind", ["association", "club"]),
        db.from("organisation_relationships").select("parent_org_id, child_org_id, effective_to"),
      ]);
      if (orgRes.error) throw orgRes.error;
      if (relRes.error) throw relRes.error;
      const orgs = (orgRes.data || []) as OrgRow[];
      const byId = new Map(orgs.map((o) => [o.id, o]));
      const today = new Date().toISOString().slice(0, 10);
      const seniorOf = new Map<string, string>(); // club_id -> association name
      for (const r of (relRes.data || []) as any[]) {
        if (r.effective_to && r.effective_to < today) continue;
        const child = byId.get(r.child_org_id);
        const parent = byId.get(r.parent_org_id);
        if (child?.kind === "club" && child.club_id && parent?.kind === "association" && parent.metadata?.junior !== "true") {
          seniorOf.set(child.club_id, parent.name);
        }
      }
      const associations = orgs
        .filter((o) => o.kind === "association" && o.active && o.metadata?.junior !== "true")
        .sort((a, b) => a.name.localeCompare(b.name));
      return { associations, seniorOf };
    },
  });

  const { data: allClubs = [] } = useQuery({
    queryKey: ["all-clubs-for-structure"],
    enabled: pickerOpen,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await fromExt("clubs").select("id, name, subdomain").eq("tenant_type", "club").order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string; subdomain: string | null }[];
    },
  });

  const mine = useMemo(() => new Set(clubs.map((c) => c.club_id)), [clubs]);
  const myName = structure?.associations.find((a) => a.id === myOrgId)?.name ?? "this association";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["association-structure-clubs"] });
    qc.invalidateQueries({ queryKey: ["federation-structure-lite"] });
    qc.invalidateQueries({ queryKey: ["federation-hierarchy"] });
    qc.invalidateQueries({ queryKey: ["association-tenant-context"] });
  };

  const move = useMutation({
    mutationFn: async ({ club, to }: { club: string; to: string | null }) => moveClubToAssociation(club, to),
    onSuccess: () => { refresh(); toast.success("Club moved"); setPickerOpen(false); },
    onError: (e: any) => toast.error(e.message || "Could not move the club"),
  });

  const confirmMove = (clubIdToMove: string, clubName: string, to: string | null) => {
    const from = structure?.seniorOf.get(clubIdToMove);
    const toName = to ? structure?.associations.find((a) => a.id === to)?.name ?? "the selected association" : null;
    const msg = to
      ? `Move ${clubName} ${from ? `from ${from} ` : ""}to ${toName}?${from && from !== toName ? ` ${from}'s admins will be told.` : ""} The change is recorded.`
      : `Remove ${clubName} from ${myName}? It goes to "Clubs with no association" — the club itself is not deleted.`;
    if (window.confirm(msg)) move.mutate({ club: clubIdToMove, to });
  };

  const createPendingClub = useMutation({
    mutationFn: async () => {
      const name = newClubName.trim();
      if (!name) throw new Error("Club name is required");
      if (!myOrgId) throw new Error("This association is not in the national structure yet.");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: club, error: clubErr } = await fromExt("clubs")
        .insert({ name, tenant_type: "club", email: newClubEmail.trim() || null, phone: newClubContact.trim() || null, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (clubErr) throw clubErr;
      await moveClubToAssociation((club as any).id, myOrgId);
    },
    onSuccess: () => {
      refresh();
      toast.success("Pending club created and added");
      setCreateOpen(false);
      setNewClubName("");
      setNewClubContact("");
      setNewClubEmail("");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create club"),
  });

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Affiliated Clubs ({clubs.length})</h3>
            <p className="text-xs text-muted-foreground">
              Clubs that belong to this association in the Squash South Africa structure. Moving a club here updates the structure everywhere.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={!myOrgId}>
                  <Plus className="w-4 h-4 mr-1" /> Bring a club in
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search clubs..." value={search} onValueChange={setSearch} />
                  <CommandList>
                    <CommandEmpty>No clubs found.</CommandEmpty>
                    <CommandGroup>
                      {allClubs.filter((c) => !mine.has(c.id)).map((c) => {
                        const current = structure?.seniorOf.get(c.id);
                        return (
                          <CommandItem key={c.id} value={`${c.name} ${current ?? ""}`} onSelect={() => myOrgId && confirmMove(c.id, c.name, myOrgId)}>
                            <Building2 className="w-4 h-4 mr-2 opacity-60 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{c.name}</span>
                              <span className="text-xs text-muted-foreground truncate">{current ? `Now in ${current}` : "No association"}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!myOrgId}>
              <PlusCircle className="w-4 h-4 mr-1" /> New Club
            </Button>
          </div>
        </div>

        {!myOrgId && !isLoading ? (
          <p className="text-sm text-muted-foreground">This association is not linked to the national structure yet. Ask Super Admin to link it.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : clubs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No clubs in this association yet.</p>
            <p className="text-xs mt-1">Use "Bring a club in" to add one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clubs.map((c) => (
              <div key={c.club_id} className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 p-3 rounded-md border bg-card">
                <div className="flex items-center gap-3 min-w-0 flex-1 basis-full sm:basis-0">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt={c.name} className="w-10 h-10 rounded object-contain border" />
                  ) : (
                    <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.subdomain && <p className="text-xs text-muted-foreground truncate">{c.subdomain}.squashhub.co.za</p>}
                  </div>
                </div>
                <Select value="" onValueChange={(v) => confirmMove(c.club_id, c.name, v)}>
                  <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Move to…" /></SelectTrigger>
                  <SelectContent>
                    {(structure?.associations || []).filter((a) => a.id !== myOrgId).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => confirmMove(c.club_id, c.name, null)}>
                  <LogOut className="w-4 h-4 mr-1" /> Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Club</DialogTitle>
            <DialogDescription>
              Create a placeholder club that will register on SquashHub later. The club starts as <span className="font-medium">pending</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="new-club-name">Club Name *</Label>
              <Input id="new-club-name" value={newClubName} onChange={(e) => setNewClubName(e.target.value)} placeholder="e.g. Riverside Squash Club" />
            </div>
            <div>
              <Label htmlFor="new-club-email">Contact Email</Label>
              <Input id="new-club-email" type="email" value={newClubEmail} onChange={(e) => setNewClubEmail(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <Label htmlFor="new-club-phone">Contact Phone</Label>
              <Input id="new-club-phone" value={newClubContact} onChange={(e) => setNewClubContact(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createPendingClub.mutate()} disabled={createPendingClub.isPending || !newClubName.trim()}>
              {createPendingClub.isPending ? "Creating..." : "Create & add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {platformAssoc?.external_source?.toLowerCase() === "nsa" && (
        <Card className="p-4">
          <NsaClubImportPanel />
        </Card>
      )}
    </div>
  );
}

