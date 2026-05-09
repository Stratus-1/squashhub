import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { useNationalBodyFees, useLeagueAssociations } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Edit2 } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface PayableFee {
  id: string;
  club_id: string;
  payee_type: "league_association" | "national_body";
  payee_name: string;
  payee_ref_id: string | null;
  basis: "per_member" | "per_club" | "per_team";
  amount: number;
  due_month: number;
  due_day: number;
  notes: string | null;
  active: boolean;
}

export function FeesPayableSchedule({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const [editFee, setEditFee] = useState<PayableFee | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: fees = [] } = useQuery({
    queryKey: ["club-fees-payable", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_fees_payable" as any)
        .select("*")
        .eq("club_id", clubId)
        .order("due_month");
      if (error) throw error;
      return (data || []) as PayableFee[];
    },
    enabled: !!clubId,
  });

  const handleToggle = async (fee: PayableFee) => {
    const { error } = await fromExt("club_fees_payable" as any).update({ active: !fee.active }).eq("id", fee.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["club-fees-payable", clubId] });
  };

  const handleDelete = async (fee: PayableFee) => {
    if (!confirm(`Delete payable fee to "${fee.payee_name}"?`)) return;
    const { error } = await fromExt("club_fees_payable" as any).delete().eq("id", fee.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["club-fees-payable", clubId] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">Fees Payable Schedule</h3>
          <p className="text-xs text-muted-foreground">Fees the club owes to leagues, associations, or national bodies</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Payable Fee</Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payable To</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead className="text-right">Amount (R)</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fees.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No payable fees configured.
                </TableCell>
              </TableRow>
            )}
            {fees.map(fee => (
              <TableRow key={fee.id} className={fee.active ? "" : "opacity-50"}>
                <TableCell className="font-medium">{fee.payee_name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {fee.payee_type === "league_association" ? "League / Association" : "National Body"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    {fee.basis === "per_member" ? "Per member" : "Per club"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">R {Number(fee.amount).toFixed(2)}</TableCell>
                <TableCell className="text-sm">{fee.due_day} {SHORT_MONTHS[fee.due_month - 1]}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={fee.active} onCheckedChange={() => handleToggle(fee)} className="mx-auto" />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditFee(fee)}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(fee)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {(editFee || addOpen) && (
        <PayableFeeDialog
          clubId={clubId}
          existing={editFee || undefined}
          open
          onOpenChange={() => { setEditFee(null); setAddOpen(false); }}
        />
      )}
    </div>
  );
}

function PayableFeeDialog({ clubId, existing, open, onOpenChange }: { clubId: string; existing?: PayableFee; open: boolean; onOpenChange: (o: boolean) => void; }) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);

  const [payeeType, setPayeeType] = useState<"league_association" | "national_body">(existing?.payee_type ?? "league_association");
  const [payeeRefId, setPayeeRefId] = useState<string>(existing?.payee_ref_id ?? "");
  const [payeeName, setPayeeName] = useState(existing?.payee_name ?? "");
  const [basis, setBasis] = useState<"per_member" | "per_club">(existing?.basis ?? "per_member");
  const [amount, setAmount] = useState(Number(existing?.amount ?? 0));
  const [dueMonth, setDueMonth] = useState(existing?.due_month ?? 1);
  const [dueDay, setDueDay] = useState(existing?.due_day ?? 1);
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const options = payeeType === "league_association"
    ? associations.map(a => ({ id: a.id, name: a.name + (a.abbreviation ? ` (${a.abbreviation})` : "") }))
    : nationalFees.map(f => ({ id: f.id, name: f.body_name + (f.abbreviation ? ` (${f.abbreviation})` : "") }));

  const handlePayeeSelect = (val: string) => {
    if (val === "__custom__") {
      setPayeeRefId("");
      setPayeeName("");
      return;
    }
    setPayeeRefId(val);
    const found = options.find(o => o.id === val);
    if (found) setPayeeName(found.name);
  };

  const handleSave = async () => {
    if (!payeeName.trim()) { toast.error("Payee name is required"); return; }
    const payload: any = {
      club_id: clubId,
      payee_type: payeeType,
      payee_name: payeeName.trim(),
      payee_ref_id: payeeRefId || null,
      basis,
      amount,
      due_month: dueMonth,
      due_day: dueDay,
      notes: notes || null,
    };
    if (isEdit) {
      const { error } = await fromExt("club_fees_payable" as any).update(payload).eq("id", existing!.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await fromExt("club_fees_payable" as any).insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(isEdit ? "Updated" : "Added");
    qc.invalidateQueries({ queryKey: ["club-fees-payable", clubId] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Payable Fee</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Payable To</Label>
            <Select value={payeeType} onValueChange={v => { setPayeeType(v as any); setPayeeRefId(""); setPayeeName(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="league_association">League / Association (e.g. NSA)</SelectItem>
                <SelectItem value="national_body">National Body (e.g. SSA)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{payeeType === "league_association" ? "Association" : "National Body"}</Label>
            <Select value={payeeRefId || "__custom__"} onValueChange={handlePayeeSelect}>
              <SelectTrigger><SelectValue placeholder="Select or enter custom" /></SelectTrigger>
              <SelectContent>
                {options.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                <SelectItem value="__custom__">— Custom —</SelectItem>
              </SelectContent>
            </Select>
            {(!payeeRefId || payeeRefId === "__custom__") && (
              <Input className="mt-2" value={payeeName} onChange={e => setPayeeName(e.target.value)} placeholder="Enter payee name" />
            )}
          </div>

          <div className="space-y-1">
            <Label>Basis</Label>
            <Select value={basis} onValueChange={v => setBasis(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_member">Per member</SelectItem>
                <SelectItem value="per_club">Per club (fixed)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Amount (R)</Label>
              <Input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label>Due Day</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={dueDay} onChange={e => setDueDay(Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Due Month</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={dueMonth} onChange={e => setDueMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reference, payment method, etc." />
          </div>

          <Button onClick={handleSave} className="w-full">{isEdit ? "Update" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
