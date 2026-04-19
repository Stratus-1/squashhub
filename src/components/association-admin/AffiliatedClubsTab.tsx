import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Building2, PlusCircle } from "lucide-react";

interface Affiliation {
  id: string;
  club_id: string;
  status: string;
  created_at: string;
  clubs?: { id: string; name: string; subdomain?: string; logo_url?: string };
}

interface ClubOption {
  id: string;
  name: string;
  subdomain?: string;
}

export function AffiliatedClubsTab({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newClubName, setNewClubName] = useState("");
  const [newClubContact, setNewClubContact] = useState("");
  const [newClubEmail, setNewClubEmail] = useState("");

  // Affiliated clubs for this association
  const { data: affiliations = [], isLoading } = useQuery({
    queryKey: ["association-affiliations", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("association_affiliated_clubs")
        .select("id, club_id, status, created_at, clubs:club_id(id, name, subdomain, logo_url)")
        .eq("association_tenant_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Affiliation[];
    },
  });

  // Available clubs (tenant_type='club') not yet affiliated
  const { data: availableClubs = [] } = useQuery({
    queryKey: ["available-clubs-for-affiliation", clubId, affiliations.map(a => a.club_id).join(",")],
    queryFn: async () => {
      const affiliatedIds = affiliations.map(a => a.club_id);
      let query = fromExt("clubs")
        .select("id, name, subdomain")
        .eq("tenant_type", "club")
        .order("name");
      if (affiliatedIds.length > 0) {
        query = query.not("id", "in", `(${affiliatedIds.join(",")})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ClubOption[];
    },
    enabled: pickerOpen,
  });

  const addAffiliation = useMutation({
    mutationFn: async (newClubId: string) => {
      const { error } = await fromExt("association_affiliated_clubs").insert({
        association_tenant_id: clubId,
        club_id: newClubId,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["association-affiliations", clubId] });
      toast.success("Club affiliation added");
      setPickerOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to add"),
  });

  const createPendingClub = useMutation({
    mutationFn: async () => {
      const name = newClubName.trim();
      if (!name) throw new Error("Club name is required");
      const { data: { user } } = await supabase.auth.getUser();
      const { data: club, error: clubErr } = await fromExt("clubs")
        .insert({
          name,
          tenant_type: "club",
          email: newClubEmail.trim() || null,
          phone: newClubContact.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (clubErr) throw clubErr;
      const { error: affErr } = await fromExt("association_affiliated_clubs").insert({
        association_tenant_id: clubId,
        club_id: (club as any).id,
        status: "pending",
      });
      if (affErr) throw affErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["association-affiliations", clubId] });
      toast.success("Pending club created and affiliated");
      setCreateOpen(false);
      setNewClubName("");
      setNewClubContact("");
      setNewClubEmail("");
    },
    onError: (e: any) => toast.error(e.message || "Failed to create club"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await fromExt("association_affiliated_clubs").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["association-affiliations", clubId] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  const removeAffiliation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromExt("association_affiliated_clubs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["association-affiliations", clubId] });
      toast.success("Affiliation removed");
    },
    onError: (e: any) => toast.error(e.message || "Failed to remove"),
  });

  const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
    if (s === "active") return "default";
    if (s === "pending") return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Affiliated Clubs</h3>
            <p className="text-xs text-muted-foreground">Clubs that belong to this association</p>
          </div>
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-1" /> Add Existing
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search clubs..." value={search} onValueChange={setSearch} />
                  <CommandList>
                    <CommandEmpty>No clubs available.</CommandEmpty>
                    <CommandGroup>
                      {availableClubs.map(c => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => addAffiliation.mutate(c.id)}
                        >
                          <Building2 className="w-4 h-4 mr-2 opacity-60" />
                          <div className="flex flex-col">
                            <span>{c.name}</span>
                            {c.subdomain && <span className="text-xs text-muted-foreground">{c.subdomain}</span>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusCircle className="w-4 h-4 mr-1" /> New Club
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : affiliations.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No affiliated clubs yet.</p>
            <p className="text-xs mt-1">Click "Add Club" to affiliate one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {affiliations.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {a.clubs?.logo_url ? (
                    <img src={a.clubs.logo_url} alt={a.clubs.name} className="w-10 h-10 rounded object-contain border" />
                  ) : (
                    <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{a.clubs?.name || "Unknown club"}</p>
                    {a.clubs?.subdomain && (
                      <p className="text-xs text-muted-foreground truncate">{a.clubs.subdomain}.squashhub.co.za</p>
                    )}
                  </div>
                </div>
                <Badge variant={statusVariant(a.status)} className="capitalize">{a.status}</Badge>
                <Select value={a.status} onValueChange={(v) => updateStatus.mutate({ id: a.id, status: v })}>
                  <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Remove ${a.clubs?.name || "this club"} from this association?`)) {
                      removeAffiliation.mutate(a.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
