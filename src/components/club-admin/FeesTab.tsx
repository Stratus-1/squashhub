import { useState } from "react";
import { useNationalBodyFees, useMyClub, useFeeCategories, NationalBodyFee, Club, MemberFeeCategory } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function FeesTab({ clubId }: { clubId: string }) {
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: clubData } = useMyClub();
  const [addNatOpen, setAddNatOpen] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [editCat, setEditCat] = useState<MemberFeeCategory | null>(null);
  const qc = useQueryClient();
  const club = clubData?.club;

  const handleDeleteNat = async (id: string) => {
    if (!confirm("Delete this fee entry?")) return;
    const { error } = await fromExt("national_body_fees").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["national-body-fees"] }); }
  };

  const handleDeleteCat = async (id: string) => {
    if (!confirm("Delete this fee category? Members using it will be unassigned.")) return;
    const { error } = await fromExt("member_fee_categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["fee-categories"] }); }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Club membership fee summary */}
      {club && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <h3 className="font-semibold mb-2">Club Membership Fee</h3>
          <p className="text-lg font-bold">R{club.member_fee_annual ?? 0} <span className="text-sm font-normal text-muted-foreground">per year (default)</span></p>
          <p className="text-xs text-muted-foreground">Due in {MONTHS[(club.member_fee_due_month ?? 1) - 1]} • Reminders sent {club.fee_reminder_days_before ?? 14} days before</p>
        </Card>
      )}

      {/* Member fee categories */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Member Fee Categories</h3>
            <p className="text-xs text-muted-foreground">Define different fee tiers for member types</p>
          </div>
          <FeeCategoryDialog clubId={clubId} open={addCatOpen} onOpenChange={setAddCatOpen} />
        </div>
        <div className="space-y-2">
          {feeCategories.map(cat => (
            <Card key={cat.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{cat.name}</p>
                <p className="text-xs text-muted-foreground">R{cat.annual_fee}/year{cat.description ? ` — ${cat.description}` : ""}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditCat(cat)}><Edit2 className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteCat(cat.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </Card>
          ))}
          {feeCategories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No fee categories configured. Add categories like Student, Pensioner, Normal, Spouse, Family.</p>}
        </div>
      </div>

      {editCat && <FeeCategoryDialog clubId={clubId} open onOpenChange={() => { setEditCat(null); }} existing={editCat} />}

      {/* National body fees */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">National Body Fees (SSA etc.)</h3>
          <NationalFeeDialog clubId={clubId} open={addNatOpen} onOpenChange={setAddNatOpen} />
        </div>
        <div className="space-y-2">
          {nationalFees.map(f => (
            <Card key={f.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{f.body_name} {f.abbreviation ? `(${f.abbreviation})` : ""}</p>
                <p className="text-xs text-muted-foreground">R{f.fee_annual ?? 0}/year • Due: {MONTHS[(f.fee_due_month ?? 1) - 1]}</p>
                {f.fee_payable_to && <p className="text-xs text-muted-foreground">Payable to: {f.fee_payable_to}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteNat(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </Card>
          ))}
          {nationalFees.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No national body fees configured</p>}
        </div>
      </div>

      <Card className="p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          <strong>Fee reminders:</strong> Members who elect to play league will be automatically notified about league association fees and SSA fees {club?.fee_reminder_days_before ?? 14} days before the due date.
          Adjust the reminder days in the Club Details tab.
        </p>
      </Card>
    </div>
  );
}

function FeeCategoryDialog({ clubId, open, onOpenChange, existing }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void; existing?: MemberFeeCategory }) {
  const [form, setForm] = useState({
    name: existing?.name || "",
    description: existing?.description || "",
    annual_fee: existing?.annual_fee ?? 0,
    sort_order: existing?.sort_order ?? 0,
  });
  const qc = useQueryClient();

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (existing) {
      const { error } = await fromExt("member_fee_categories").update({ ...form }).eq("id", existing.id);
      if (error) toast.error(error.message);
      else { toast.success("Updated"); onOpenChange(false); qc.invalidateQueries({ queryKey: ["fee-categories"] }); }
    } else {
      const { error } = await fromExt("member_fee_categories").insert({ ...form, club_id: clubId });
      if (error) toast.error(error.message);
      else { toast.success("Added"); onOpenChange(false); qc.invalidateQueries({ queryKey: ["fee-categories"] }); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!existing && <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Category</Button></DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Fee Category</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Category Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Student, Pensioner, Family" /></div>
          <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Under 25 years old" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Annual Fee (R)</Label><Input type="number" value={form.annual_fee} onChange={e => setForm(p => ({ ...p, annual_fee: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: Number(e.target.value) }))} /></div>
          </div>
          <Button onClick={handleSave} className="w-full">{existing ? "Update" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NationalFeeDialog({ clubId, open, onOpenChange }: { clubId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [form, setForm] = useState({ body_name: "Squash South Africa", abbreviation: "SSA", fee_annual: 0, fee_due_month: 1, fee_payable_to: "", fee_payment_details: "" });
  const qc = useQueryClient();

  const handleSave = async () => {
    if (!form.body_name.trim()) return;
    const { error } = await fromExt("national_body_fees").insert({ ...form, club_id: clubId });
    if (error) toast.error(error.message);
    else { toast.success("Added"); onOpenChange(false); qc.invalidateQueries({ queryKey: ["national-body-fees"] }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Fee</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add National Body Fee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Body Name</Label><Input value={form.body_name} onChange={e => setForm(p => ({ ...p, body_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Abbreviation</Label><Input value={form.abbreviation} onChange={e => setForm(p => ({ ...p, abbreviation: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Annual Fee (R)</Label><Input type="number" value={form.fee_annual} onChange={e => setForm(p => ({ ...p, fee_annual: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>Due Month</Label><Input type="number" min={1} max={12} value={form.fee_due_month} onChange={e => setForm(p => ({ ...p, fee_due_month: Number(e.target.value) }))} /></div>
          </div>
          <div className="space-y-1"><Label>Payable To</Label><Input value={form.fee_payable_to} onChange={e => setForm(p => ({ ...p, fee_payable_to: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Payment Details</Label><Input value={form.fee_payment_details} onChange={e => setForm(p => ({ ...p, fee_payment_details: e.target.value }))} /></div>
          <Button onClick={handleSave} className="w-full">Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
