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

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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
    member_fee_annual: club.member_fee_annual ?? 0,
    member_fee_due_month: club.member_fee_due_month ?? 1,
    fee_reminder_days_before: club.fee_reminder_days_before ?? 14,
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

      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Membership Fees</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1"><Label>Annual Fee (R)</Label><Input type="number" min={0} value={form.member_fee_annual} onChange={set("member_fee_annual")} /></div>
          <div className="space-y-1">
            <Label>Due Month</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.member_fee_due_month} onChange={set("member_fee_due_month") as any}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Reminder Days Before</Label><Input type="number" min={1} max={90} value={form.fee_reminder_days_before} onChange={set("fee_reminder_days_before")} /></div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={updateClub.isPending} className="w-full md:w-auto">
        {updateClub.isPending ? "Saving..." : "Save Club Details"}
      </Button>
    </div>
  );
}
