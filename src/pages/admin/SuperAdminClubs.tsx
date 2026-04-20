import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SEO } from "@/components/SEO";
import { Building2, Search, Users, Pencil, Trash2, ExternalLink, Globe } from "lucide-react";

type Club = {
  id: string;
  name: string;
  subdomain: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  tenant_type: string;
  created_at: string;
  member_count?: number;
};

export default function SuperAdminClubs() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editClub, setEditClub] = useState<Club | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subdomain: "", email: "", phone: "", address: "" });
  const [deleteConfirm, setDeleteConfirm] = useState<Club | null>(null);

  const { data: clubs = [], isLoading } = useQuery({
    queryKey: ["sa-clubs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name, subdomain, address, email, phone, logo_url, tenant_type, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Get member counts
      const { data: members } = await supabase
        .from("club_members")
        .select("club_id");

      const countMap = new Map<string, number>();
      (members || []).forEach((m: any) => {
        countMap.set(m.club_id, (countMap.get(m.club_id) || 0) + 1);
      });

      return (data || []).map((c: any) => ({
        ...c,
        member_count: countMap.get(c.id) || 0,
      })) as Club[];
    },
  });

  const filtered = clubs.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.subdomain || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  const updateMutation = useMutation({
    mutationFn: async (club: { id: string; name: string; subdomain: string; email: string; phone: string; address: string }) => {
      const { error } = await supabase
        .from("clubs")
        .update({
          name: club.name,
          subdomain: club.subdomain || null,
          email: club.email || null,
          phone: club.phone || null,
          address: club.address || null,
        })
        .eq("id", club.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Club updated");
      queryClient.invalidateQueries({ queryKey: ["sa-clubs"] });
      setEditClub(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (clubId: string) => {
      // Delete members first, then club
      await supabase.from("club_members").delete().eq("club_id", clubId);
      const { error } = await supabase.from("clubs").delete().eq("id", clubId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Club deleted");
      queryClient.invalidateQueries({ queryKey: ["sa-clubs"] });
      setDeleteConfirm(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (club: Club) => {
    setEditClub(club);
    setEditForm({
      name: club.name,
      subdomain: club.subdomain || "",
      email: club.email || "",
      phone: club.phone || "",
      address: club.address || "",
    });
  };

  return (
    <div className="space-y-6">
      <SEO title="Manage Clubs — Super Admin" noIndex />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Clubs</h2>
          <p className="text-sm text-muted-foreground mt-1">{clubs.length} registered clubs</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clubs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Club</TableHead>
              <TableHead>Subdomain</TableHead>
              <TableHead className="text-center">Members</TableHead>
              
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No clubs found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((club) => (
                <TableRow key={club.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {club.logo_url ? (
                        <img src={club.logo_url} alt="" className="h-8 w-8 rounded-md object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <span className="font-medium text-foreground">{club.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {club.subdomain ? (
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{club.subdomain}.squashhub.co.za</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {club.member_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{club.email || "—"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(club)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteConfirm(club)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editClub} onOpenChange={(o) => !o && setEditClub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Club</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Club Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Subdomain</Label>
              <Input value={editForm.subdomain} onChange={(e) => setEditForm((f) => ({ ...f, subdomain: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditClub(null)}>Cancel</Button>
            <Button
              onClick={() => editClub && updateMutation.mutate({ id: editClub.id, ...editForm })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Club</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This will remove all members and data. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Club"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
