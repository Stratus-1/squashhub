import { useState, useEffect } from "react";
import { Club, useUpdateClub } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";



export function ClubDetailsTab({ club }: { club: Club }) {
  const updateClub = useUpdateClub();
  const [form, setForm] = useState({
    name: club.name || "",
    address: club.address || "",
    email: club.email || "",
    phone: club.phone || "",
    bank_name: club.bank_name || "",
    bank_account_name: club.bank_account_name || "",
    bank_account_number: club.bank_account_number || "",
    bank_branch_code: club.bank_branch_code || "",
    bank_reference: club.bank_reference || "",
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const handleSave = async () => {
    try {
      await updateClub.mutateAsync({ id: club.id, ...form });
      toast.success("Club details saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Club Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Club Name</Label><Input value={form.name} onChange={set("name")} /></div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={set("address")} /></div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={set("email")} /></div>
          <div className="space-y-1"><Label>Phone</Label><Input type="tel" value={form.phone} onChange={set("phone")} /></div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Bank Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Bank Name</Label><Input value={form.bank_name} onChange={set("bank_name")} /></div>
          <div className="space-y-1"><Label>Account Name</Label><Input value={form.bank_account_name} onChange={set("bank_account_name")} /></div>
          <div className="space-y-1"><Label>Account Number</Label><Input value={form.bank_account_number} onChange={set("bank_account_number")} /></div>
          <div className="space-y-1"><Label>Branch Code</Label><Input value={form.bank_branch_code} onChange={set("bank_branch_code")} /></div>
          <div className="space-y-1"><Label>Payment Reference</Label><Input value={form.bank_reference} onChange={set("bank_reference")} /></div>
        </div>
      </Card>


      <Button onClick={handleSave} disabled={updateClub.isPending} className="w-full md:w-auto">
        {updateClub.isPending ? "Saving..." : "Save Club Details"}
      </Button>

      <CourtsSection clubId={club.id} />
    </div>
  );
}

function CourtsSection({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [newCourt, setNewCourt] = useState("");

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["club-courts", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("courts").select("*").eq("club_id", clubId).order("name");
      if (error) throw error;
      return data as { id: number; name: string; club_id: string }[];
    },
  });

  const handleAdd = async () => {
    if (!newCourt.trim()) return;
    const { error } = await fromExt("courts").insert({ name: newCourt.trim(), club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Court added"); setNewCourt(""); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this court?")) return;
    const { error } = await fromExt("courts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Court removed"); qc.invalidateQueries({ queryKey: ["club-courts"] }); }
  };

  return (
    <Card className="p-6 space-y-4">
      <h3 className="font-semibold">Courts ({courts.length})</h3>
      <div className="space-y-2">
        {courts.map(c => (
          <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">{c.name}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        ))}
        {courts.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No courts added yet</p>}
      </div>
      <div className="flex gap-2">
        <Input value={newCourt} onChange={e => setNewCourt(e.target.value)} placeholder="e.g. Court 1" className="flex-1" onKeyDown={e => e.key === "Enter" && handleAdd()} />
        <Button size="sm" onClick={handleAdd}><Plus className="w-4 h-4 mr-1" />Add</Button>
      </div>
    </Card>
  );
}
