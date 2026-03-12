import { useState } from "react";
import { useNationalBodyFees, useMyClub, NationalBodyFee, Club } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function FeesTab({ clubId }: { clubId: string }) {
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: clubData } = useMyClub();
  const [addOpen, setAddOpen] = useState(false);
  const qc = useQueryClient();
  const club = clubData?.club;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this fee entry?")) return;
    const { error } = await fromExt("national_body_fees").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["national-body-fees"] }); }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Club membership fee summary */}
      {club && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <h3 className="font-semibold mb-2">Club Membership Fee</h3>
          <p className="text-lg font-bold">R{club.member_fee_annual ?? 0} <span className="text-sm font-normal text-muted-foreground">per year</span></p>
          <p className="text-xs text-muted-foreground">Due in {MONTHS[(club.member_fee_due_month ?? 1) - 1]} • Reminders sent {club.fee_reminder_days_before ?? 14} days before</p>
        </Card>
      )}

      {/* National body fees */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">National Body Fees (SSA etc.)</h3>
          <NationalFeeDialog clubId={clubId} open={addOpen} onOpenChange={setAddOpen} />
        </div>
        <div className="space-y-2">
          {nationalFees.map(f => (
            <Card key={f.id} className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{f.body_name} {f.abbreviation ? `(${f.abbreviation})` : ""}</p>
                <p className="text-xs text-muted-foreground">R{f.fee_annual ?? 0}/year • Due: {MONTHS[(f.fee_due_month ?? 1) - 1]}</p>
                {f.fee_payable_to && <p className="text-xs text-muted-foreground">Payable to: {f.fee_payable_to}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
