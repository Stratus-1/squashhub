import { useState, useMemo } from "react";
import { useNationalBodyFees, useMyClub, useFeeCategories, useLeagueAssociations, NationalBodyFee, MemberFeeCategory, LeagueAssociation } from "@/hooks/use-club";
import { fromExt } from "@/lib/supabase-ext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type FeeType = "membership" | "league" | "national" | "other";

interface UnifiedFee {
  id: string;
  name: string;
  type: FeeType;
  typeLabel: string;
  amount: number;
  feeClass: "club_income" | "pass_through";
  proRate: boolean;
  source: "member_fee_categories" | "league_associations" | "national_body_fees";
  raw: MemberFeeCategory | LeagueAssociation | NationalBodyFee;
}

export function FeesTab({ clubId }: { clubId: string }) {
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: clubData } = useMyClub();
  const qc = useQueryClient();
  const club = clubData?.club;
  const [dueMonth, setDueMonth] = useState(club?.member_fee_due_month ?? 1);
  const [reminderDays, setReminderDays] = useState(club?.fee_reminder_days_before ?? 14);
  const [editFee, setEditFee] = useState<UnifiedFee | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Build unified fee list
  const fees = useMemo<UnifiedFee[]>(() => {
    const list: UnifiedFee[] = [];
    feeCategories.forEach(c => list.push({
      id: c.id, name: c.name, type: "membership", typeLabel: "Membership",
      amount: c.annual_fee, feeClass: c.fee_class, proRate: (c as any).pro_rate ?? true,
      source: "member_fee_categories", raw: c,
    }));
    associations.forEach(a => list.push({
      id: a.id, name: a.name + (a.abbreviation ? ` (${a.abbreviation})` : ""), type: "league", typeLabel: "League",
      amount: a.fee_annual ?? 0, feeClass: a.fee_class, proRate: (a as any).pro_rate ?? false,
      source: "league_associations", raw: a,
    }));
    nationalFees.forEach(f => list.push({
      id: f.id, name: f.body_name + (f.abbreviation ? ` (${f.abbreviation})` : ""), type: "national", typeLabel: "National Body",
      amount: f.fee_annual ?? 0, feeClass: f.fee_class, proRate: (f as any).pro_rate ?? false,
      source: "national_body_fees", raw: f,
    }));
    return list;
  }, [feeCategories, associations, nationalFees]);

  const handleDueSettings = async (field: string, value: number) => {
    if (field === "member_fee_due_month") setDueMonth(value);
    else setReminderDays(value);
    const { error } = await fromExt("clubs").update({ [field]: value }).eq("id", clubId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["my-club"] });
  };

  const handleDelete = async (fee: UnifiedFee) => {
    if (!confirm(`Delete "${fee.name}"?`)) return;
    const { error } = await fromExt(fee.source as any).delete().eq("id", fee.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: [fee.source === "member_fee_categories" ? "fee-categories" : fee.source === "league_associations" ? "league-associations" : "national-body-fees"] });
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Payment due settings */}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Payment Due Date</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Due Month</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={dueMonth} onChange={e => handleDueSettings("member_fee_due_month", Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Reminder Days Before</Label>
            <Input type="number" min={1} max={90} value={reminderDays} onChange={e => handleDueSettings("fee_reminder_days_before", Number(e.target.value))} />
          </div>
        </div>
      </Card>

      {/* Unified fees table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Fee Schedule</h3>
            <p className="text-xs text-muted-foreground">All fees charged to members — membership, league, national body, and other</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Fee</Button>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fee Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount (R)</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead className="text-center">Pro-rate</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No fees configured. Add membership, league, or national body fees.
                  </TableCell>
                </TableRow>
              )}
              {fees.map(fee => (
                <TableRow key={`${fee.source}-${fee.id}`}>
                  <TableCell className="font-medium">{fee.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{fee.typeLabel}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">R {fee.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={fee.feeClass === "pass_through" ? "outline" : "secondary"} className="text-[10px]">
                      {fee.feeClass === "pass_through" ? "Pass-through" : "Club Income"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{fee.proRate ? "Yes" : "No"}</TableCell>
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
      </div>

      {editFee && (
        <FeeDialog
          clubId={clubId}
          open
          onOpenChange={() => setEditFee(null)}
          existing={editFee}
        />
      )}
      {addOpen && (
        <FeeDialog
          clubId={clubId}
          open
          onOpenChange={() => setAddOpen(false)}
        />
      )}

      <Card className="p-4 bg-muted/50">
        <p className="text-sm text-muted-foreground">
          <strong>Fee reminders:</strong> Members who play league are automatically notified about league and national body fees {club?.fee_reminder_days_before ?? 14} days before the due date.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          <strong>Pro-rate:</strong> When enabled, self-registering members are charged a proportional fee based on months remaining. Admin-added members pay the full annual fee.
        </p>
      </Card>
    </div>
  );
}

/* ─── Unified Add / Edit Dialog ─── */

interface FeeDialogProps {
  clubId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing?: UnifiedFee;
}

function FeeDialog({ clubId, open, onOpenChange, existing }: FeeDialogProps) {
  const isEdit = !!existing;
  const [feeType, setFeeType] = useState<FeeType>(existing?.type ?? "membership");
  const qc = useQueryClient();

  // Common fields
  const [name, setName] = useState(() => {
    if (!existing) return "";
    if (existing.source === "member_fee_categories") return (existing.raw as MemberFeeCategory).name;
    if (existing.source === "league_associations") return (existing.raw as LeagueAssociation).name;
    return (existing.raw as NationalBodyFee).body_name;
  });
  const [abbreviation, setAbbreviation] = useState(() => {
    if (!existing) return "";
    if (existing.source === "league_associations") return (existing.raw as LeagueAssociation).abbreviation || "";
    if (existing.source === "national_body_fees") return (existing.raw as NationalBodyFee).abbreviation || "";
    return "";
  });
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [feeClass, setFeeClass] = useState<"club_income" | "pass_through">(existing?.feeClass ?? (feeType === "membership" ? "club_income" : "pass_through"));
  const [proRate, setProRate] = useState(existing?.proRate ?? (feeType === "membership"));
  const [description, setDescription] = useState(() => {
    if (existing?.source === "member_fee_categories") return (existing.raw as MemberFeeCategory).description || "";
    return "";
  });
  const [sortOrder, setSortOrder] = useState(() => {
    if (existing?.source === "member_fee_categories") return (existing.raw as MemberFeeCategory).sort_order ?? 0;
    return 0;
  });
  // League / national extra fields
  const [feeDueMonth, setFeeDueMonth] = useState(() => {
    if (existing?.source === "league_associations") return (existing.raw as LeagueAssociation).fee_due_month ?? 1;
    if (existing?.source === "national_body_fees") return (existing.raw as NationalBodyFee).fee_due_month ?? 1;
    return 1;
  });
  const [payableTo, setPayableTo] = useState(() => {
    if (existing?.source === "league_associations") return (existing.raw as LeagueAssociation).fee_payable_to || "";
    if (existing?.source === "national_body_fees") return (existing.raw as NationalBodyFee).fee_payable_to || "";
    return "";
  });
  const [paymentDetails, setPaymentDetails] = useState(() => {
    if (existing?.source === "league_associations") return (existing.raw as LeagueAssociation).fee_payment_details || "";
    if (existing?.source === "national_body_fees") return (existing.raw as NationalBodyFee).fee_payment_details || "";
    return "";
  });

  // Auto-set defaults when type changes (only for new)
  const handleTypeChange = (t: FeeType) => {
    setFeeType(t);
    if (!isEdit) {
      setFeeClass(t === "membership" ? "club_income" : "pass_through");
      setProRate(t === "membership");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Fee name is required"); return; }

    const table = feeType === "membership" ? "member_fee_categories"
      : feeType === "league" ? "league_associations"
      : "national_body_fees";

    const invalidateKey = table === "member_fee_categories" ? "fee-categories"
      : table === "league_associations" ? "league-associations"
      : "national-body-fees";

    if (table === "member_fee_categories") {
      const payload = { name, description, annual_fee: amount, sort_order: sortOrder, fee_class: feeClass, pro_rate: proRate };
      if (isEdit) {
        const { error } = await fromExt("member_fee_categories").update(payload).eq("id", existing!.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await fromExt("member_fee_categories").insert({ ...payload, club_id: clubId });
        if (error) { toast.error(error.message); return; }
      }
    } else if (table === "league_associations") {
      const payload = { name, abbreviation, fee_annual: amount, fee_due_month: feeDueMonth, fee_payable_to: payableTo, fee_payment_details: paymentDetails, fee_class: feeClass, pro_rate: proRate };
      if (isEdit) {
        const { error } = await fromExt("league_associations").update(payload).eq("id", existing!.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await fromExt("league_associations").insert({ ...payload, club_id: clubId });
        if (error) { toast.error(error.message); return; }
      }
    } else {
      const payload = { body_name: name, abbreviation, fee_annual: amount, fee_due_month: feeDueMonth, fee_payable_to: payableTo, fee_payment_details: paymentDetails, fee_class: feeClass, pro_rate: proRate };
      if (isEdit) {
        const { error } = await fromExt("national_body_fees").update(payload).eq("id", existing!.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await fromExt("national_body_fees").insert({ ...payload, club_id: clubId });
        if (error) { toast.error(error.message); return; }
      }
    }

    toast.success(isEdit ? "Updated" : "Added");
    qc.invalidateQueries({ queryKey: [invalidateKey] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Fee</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Fee Type selector */}
          <div className="space-y-1">
            <Label>Fee Type</Label>
            <Select value={feeType} onValueChange={v => handleTypeChange(v as FeeType)} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="membership">Membership</SelectItem>
                <SelectItem value="league">League Association</SelectItem>
                <SelectItem value="national">National Body (e.g. SSA)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <Label>{feeType === "membership" ? "Category Name" : "Organisation Name"}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={feeType === "membership" ? "e.g. Student, Pensioner, Normal" : feeType === "league" ? "e.g. Western Cape Squash" : "e.g. Squash South Africa"} />
          </div>

          {/* Abbreviation (league/national only) */}
          {feeType !== "membership" && (
            <div className="space-y-1">
              <Label>Abbreviation</Label>
              <Input value={abbreviation} onChange={e => setAbbreviation(e.target.value)} placeholder="e.g. WCS, SSA" />
            </div>
          )}

          {/* Description (membership only) */}
          {feeType === "membership" && (
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Under 25 years old" />
            </div>
          )}

          {/* Amount + Sort/Due month */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Annual Fee (R)</Label>
              <Input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            {feeType === "membership" ? (
              <div className="space-y-1">
                <Label>Sort Order</Label>
                <Input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Due Month</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={feeDueMonth} onChange={e => setFeeDueMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Payable to / Payment details (league/national) */}
          {feeType !== "membership" && (
            <>
              <div className="space-y-1">
                <Label>Payable To</Label>
                <Input value={payableTo} onChange={e => setPayableTo(e.target.value)} placeholder="Organisation or account name" />
              </div>
              <div className="space-y-1">
                <Label>Payment Details</Label>
                <Input value={paymentDetails} onChange={e => setPaymentDetails(e.target.value)} placeholder="Bank details or reference" />
              </div>
            </>
          )}

          {/* Classification + Pro-rate */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <Label>Classification</Label>
              <Select value={feeClass} onValueChange={v => setFeeClass(v as "club_income" | "pass_through")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="club_income">Club Income</SelectItem>
                  <SelectItem value="pass_through">Pass-through</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 h-10">
              <Switch checked={proRate} onCheckedChange={setProRate} id="pro-rate" />
              <Label htmlFor="pro-rate" className="cursor-pointer">Pro-rate</Label>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            {feeClass === "pass_through" ? "Pass-through: Club collects on behalf of external body → Credits Creditors GL" : "Club Income: Revenue for the club → Credits Fee Income GL"}
          </p>

          <Button onClick={handleSave} className="w-full">{isEdit ? "Update" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
