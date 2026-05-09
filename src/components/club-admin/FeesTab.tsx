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
import { FeesPayableSchedule } from "./FeesPayableSchedule";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type FeeType = "membership" | "league" | "league_affiliation" | "national" | "registration" | "other";

interface UnifiedFee {
  id: string;
  name: string;
  type: FeeType;
  typeLabel: string;
  amount: number;
  feeClass: "club_income" | "pass_through";
  proRate: boolean;
  active: boolean;
  dueMonth: number; // 1-12
  dueDay: number; // 1-31
  source: "member_fee_categories" | "league_associations" | "national_body_fees";
  raw: MemberFeeCategory | LeagueAssociation | NationalBodyFee;
}

export function FeesTab({ clubId, tenantType = "club" }: { clubId: string; tenantType?: string }) {
  const isAssociation = tenantType === "association";
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);
  const { data: feeCategories = [] } = useFeeCategories(clubId);
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: clubData } = useMyClub();
  const qc = useQueryClient();
  const club = clubData?.club;
  const [reminderDays, setReminderDays] = useState(club?.fee_reminder_days_before ?? 14);
  const [editFee, setEditFee] = useState<UnifiedFee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tenantName, setTenantName] = useState<string>("");

  // Fetch tenant (association) name to auto-fill league_affiliation fees
  useMemo(() => {
    if (!isAssociation) return;
    fromExt("clubs").select("name").eq("id", clubId).maybeSingle().then(({ data }: any) => {
      if (data?.name) setTenantName(data.name);
    });
  }, [clubId, isAssociation]);

  // Build unified fee list
  const fees = useMemo<UnifiedFee[]>(() => {
    const list: UnifiedFee[] = [];
    feeCategories.forEach(c => list.push({
      id: c.id, name: c.name, type: "membership", typeLabel: "Membership",
      amount: c.annual_fee, feeClass: c.fee_class, proRate: (c as any).pro_rate ?? true,
      active: (c as any).active ?? true, dueMonth: (c as any).due_month ?? 1, dueDay: (c as any).due_day ?? 1,
      source: "member_fee_categories", raw: c,
    }));
    associations.forEach(a => {
      // Skip associations where members pay the league directly — these don't belong in the club's fee schedule.
      if ((a as any).members_pay_directly) return;
      list.push({
        id: a.id, name: a.name + (a.abbreviation ? ` (${a.abbreviation})` : ""), type: "league", typeLabel: "League",
        amount: a.fee_annual ?? 0, feeClass: a.fee_class, proRate: (a as any).pro_rate ?? false,
        active: (a as any).active ?? true, dueMonth: a.fee_due_month ?? 1, dueDay: (a as any).due_day ?? 1,
        source: "league_associations", raw: a,
      });
    });
    nationalFees.forEach(f => {
      const ft = (f as any).fee_type;
      let type: FeeType = "national";
      let typeLabel = "National Body";
      if (ft === "other") { type = "other"; typeLabel = "Other"; }
      else if (ft === "registration") { type = "registration"; typeLabel = "Registration"; }
      else if (ft === "league_affiliation") { type = "league_affiliation"; typeLabel = "League Affiliation"; }
      list.push({
        id: f.id, name: f.body_name + (f.abbreviation ? ` (${f.abbreviation})` : ""), 
        type, typeLabel,
        amount: f.fee_annual ?? 0, feeClass: f.fee_class, proRate: (f as any).pro_rate ?? false,
        active: (f as any).active ?? true, dueMonth: f.fee_due_month ?? 1, dueDay: (f as any).due_day ?? 1,
        source: "national_body_fees", raw: f,
      });
    });
    return list;
  }, [feeCategories, associations, nationalFees]);

  const handleReminderDays = async (value: number) => {
    setReminderDays(value);
    const { error } = await fromExt("clubs").update({ fee_reminder_days_before: value }).eq("id", clubId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["my-club"] });
  };

  const handleToggleActive = async (fee: UnifiedFee) => {
    const newActive = !fee.active;
    const { error } = await fromExt(fee.source as any).update({ active: newActive }).eq("id", fee.id);
    if (error) { toast.error(error.message); return; }

    // Sync member fee payment records: inactive = mark paid, active = mark unpaid
    const feeTypes = fee.source === "member_fee_categories"
      ? ["club", "membership"]
      : fee.source === "league_associations"
        ? ["association"]
        : ["national", "national_body"];

    // Get all club members for this club
    const { data: members } = await fromExt("club_members").select("id").eq("club_id", clubId);
    const memberIds = (members || []).map((m: any) => m.id);

    if (memberIds.length > 0) {
      const { error: updateErr } = await fromExt("club_member_fee_payments")
        .update({ paid: !newActive, paid_at: !newActive ? new Date().toISOString() : null })
        .in("club_member_id", memberIds)
        .in("fee_type", feeTypes);
      if (updateErr) console.error("Failed to sync fee payments:", updateErr.message);
    }

    const key = fee.source === "member_fee_categories" ? "fee-categories" : fee.source === "league_associations" ? "league-associations" : "national-body-fees";
    qc.invalidateQueries({ queryKey: [key] });
    qc.invalidateQueries({ queryKey: ["club-member-fees"] });
    toast.success(`Fee ${newActive ? "activated" : "deactivated"}`);
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

      {/* Fees Receivable Schedule */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Fees Receivable Schedule</h3>
            <p className="text-xs text-muted-foreground">Fees the club charges to members — all treated as club income</p>
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Fee</Button>
        </div>

        {/* Info: league association fees paid directly to the association */}
        <Card className="p-3 mb-3 border-primary/30 bg-primary/5">
          <p className="text-xs text-foreground leading-relaxed">
            <strong>League association fees:</strong> If members pay a league association (e.g. HSA, WPSA) <em>directly</em> via EFT or card, do <strong>NOT</strong> add the fee here. Instead, open the <strong>Leagues</strong> tab → edit the association → enable <em>"Members pay [association] directly"</em>. The fee will be excluded from this schedule and members settle with the association themselves.
            <br />
            Only add a league fee here when your club <strong>collects</strong> it from members on behalf of the association.
          </p>
        </Card>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fee Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount (R)</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-center">Pro-rate</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No fees configured. Add membership, league, or national body fees.
                  </TableCell>
                </TableRow>
              )}
              {fees.map(fee => (
                <TableRow key={`${fee.source}-${fee.id}`} className={fee.active ? "" : "opacity-50"}>
                  <TableCell className="font-medium">{fee.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{fee.typeLabel}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">R {fee.amount.toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{fee.type === "registration" ? <span className="text-muted-foreground italic">On join</span> : `${fee.dueDay} ${SHORT_MONTHS[fee.dueMonth - 1]}`}</TableCell>
                  <TableCell className="text-center">{fee.proRate ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={fee.active} onCheckedChange={() => handleToggleActive(fee)} className="mx-auto" />
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
      </div>

      {/* Fees Payable Schedule */}
      <FeesPayableSchedule clubId={clubId} />

      {editFee && (
        <FeeDialog clubId={clubId} open onOpenChange={() => setEditFee(null)} existing={editFee} tenantType={tenantType} tenantName={tenantName} />
      )}
      {addOpen && (
        <FeeDialog clubId={clubId} open onOpenChange={() => setAddOpen(false)} tenantType={tenantType} tenantName={tenantName} />
      )}

      <Card className="p-4 bg-muted/50 space-y-3">
        <div className="flex items-center gap-3">
          <Label className="whitespace-nowrap">Reminder days before due date:</Label>
          <Input type="number" min={1} max={90} className="w-20" value={reminderDays} onChange={e => handleReminderDays(Number(e.target.value))} />
        </div>
        <p className="text-xs text-muted-foreground">
          <strong>Pro-rate:</strong> When enabled, self-registering members are charged a proportional fee based on months remaining.
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
  tenantType?: string;
  tenantName?: string;
}

function FeeDialog({ clubId, open, onOpenChange, existing, tenantType = "club", tenantName = "" }: FeeDialogProps) {
  const isAssociation = tenantType === "association";
  const isEdit = !!existing;
  const [feeType, setFeeType] = useState<FeeType>(existing?.type ?? (isAssociation ? "league_affiliation" : "membership"));
  const qc = useQueryClient();

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
  const [feeClass, setFeeClass] = useState<"club_income" | "pass_through">(existing?.feeClass ?? (feeType === "membership" || feeType === "other" || feeType === "registration" || feeType === "league_affiliation" ? "club_income" : "pass_through"));
  const [proRate, setProRate] = useState(existing?.proRate ?? (feeType === "membership" || feeType === "league_affiliation"));
  const [feeDueMonth, setFeeDueMonth] = useState(existing?.dueMonth ?? 1);
  const [feeDueDay, setFeeDueDay] = useState(existing?.dueDay ?? 1);
  const [description, setDescription] = useState(() => {
    if (existing?.source === "member_fee_categories") return (existing.raw as MemberFeeCategory).description || "";
    return "";
  });
  const [sortOrder, setSortOrder] = useState(() => {
    if (existing?.source === "member_fee_categories") return (existing.raw as MemberFeeCategory).sort_order ?? 0;
    return 0;
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

  const handleTypeChange = (t: FeeType) => {
    setFeeType(t);
    if (!isEdit) {
      setFeeClass(t === "membership" || t === "other" || t === "registration" || t === "league_affiliation" ? "club_income" : "pass_through");
      setProRate(t === "membership" || t === "league_affiliation");
    }
  };

  const mapFeeTypeForDb = (t: FeeType): string => {
    if (t === "other") return "other";
    if (t === "registration") return "registration";
    if (t === "league_affiliation") return "league_affiliation";
    return "national";
  };

  const hideNameForAffiliation = isAssociation && feeType === "league_affiliation";

  const handleSave = async () => {
    const finalName = hideNameForAffiliation ? (name.trim() || tenantName || "League Affiliation") : name;
    if (!finalName.trim()) { toast.error("Fee name is required"); return; }
    const finalAbbreviation = hideNameForAffiliation ? "" : abbreviation;

    // "other" and "registration" fees are stored in national_body_fees with fee_type column
    const table = feeType === "membership" ? "member_fee_categories"
      : feeType === "league" ? "league_associations"
      : "national_body_fees";

    const invalidateKey = table === "member_fee_categories" ? "fee-categories"
      : table === "league_associations" ? "league-associations"
      : "national-body-fees";

    if (table === "member_fee_categories") {
      const payload = { name: finalName, description, annual_fee: amount, sort_order: sortOrder, fee_class: feeClass, pro_rate: proRate, due_month: feeDueMonth, due_day: feeDueDay };
      if (isEdit) {
        const { error } = await fromExt("member_fee_categories").update(payload).eq("id", existing!.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await fromExt("member_fee_categories").insert({ ...payload, club_id: clubId });
        if (error) { toast.error(error.message); return; }
      }
    } else if (table === "league_associations") {
      const payload = { name: finalName, abbreviation: finalAbbreviation, fee_annual: amount, fee_due_month: feeDueMonth, due_day: feeDueDay, fee_payable_to: payableTo, fee_payment_details: paymentDetails, fee_class: feeClass, pro_rate: proRate };
      if (isEdit) {
        const { error } = await fromExt("league_associations").update(payload).eq("id", existing!.id);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await fromExt("league_associations").insert({ ...payload, club_id: clubId });
        if (error) { toast.error(error.message); return; }
      }
    } else {
      const payload = { body_name: finalName, abbreviation: finalAbbreviation, fee_annual: amount, fee_due_month: feeDueMonth, due_day: feeDueDay, fee_payable_to: payableTo, fee_payment_details: paymentDetails, fee_class: feeClass, pro_rate: proRate, fee_type: mapFeeTypeForDb(feeType) };
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

  const nameLabel = feeType === "membership" ? "Category Name"
    : feeType === "registration" ? "Fee Name"
    : feeType === "other" ? "Fee Name"
    : feeType === "league_affiliation" ? "Affiliation Name"
    : "Organisation Name";
  const namePlaceholder = feeType === "membership" ? "e.g. Student, Pensioner, Normal"
    : feeType === "league" ? "e.g. Western Cape Squash"
    : feeType === "league_affiliation" ? "e.g. Provincial League Affiliation"
    : feeType === "registration" ? "e.g. Registration Fee, Joining Fee"
    : feeType === "other" ? "e.g. Parking, Locker Rental"
    : "e.g. Squash South Africa";

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
                {!isAssociation && <SelectItem value="membership">Membership</SelectItem>}
                {!isAssociation && <SelectItem value="league">League Association</SelectItem>}
                <SelectItem value="league_affiliation">League Affiliation Fee</SelectItem>
                {!isAssociation && <SelectItem value="national">National Body (e.g. SSA)</SelectItem>}
                <SelectItem value="registration">Registration (once-off, new members only)</SelectItem>
                <SelectItem value="other">Other (e.g. Parking, Locker)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Name (hidden for association league_affiliation — auto-filled from association setup) */}
          {!hideNameForAffiliation && (
            <div className="space-y-1">
              <Label>{nameLabel}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={namePlaceholder} />
            </div>
          )}

          {/* Abbreviation (league/national only — hidden for association league_affiliation) */}
          {(feeType === "league" || feeType === "national" || (feeType === "league_affiliation" && !hideNameForAffiliation)) && (
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

          {/* Amount + Due Month (hide date for registration — it's once-off on join) */}
          {feeType === "registration" ? (
            <div className="space-y-1">
              <Label>Registration Fee (R)</Label>
              <Input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground">Once-off fee charged when a new member joins the club</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Annual Fee (R)</Label>
                <Input type="number" min={0} value={amount} onChange={e => setAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Due Day</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={feeDueDay} onChange={e => setFeeDueDay(Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Due Month</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={feeDueMonth} onChange={e => setFeeDueMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Sort order (membership only) */}
          {feeType === "membership" && (
            <div className="space-y-1">
              <Label>Sort Order</Label>
              <Input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
            </div>
          )}

          {/* Payable to / Payment details (league/national/other — not registration or league_affiliation, since affiliation is treated like membership/association income) */}
          {feeType !== "membership" && feeType !== "registration" && feeType !== "league_affiliation" && (
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

          {/* Pro-rate */}
          {feeType !== "registration" && (
            <div className="flex items-center gap-2 h-10">
              <Switch checked={proRate} onCheckedChange={setProRate} id="pro-rate" />
              <Label htmlFor="pro-rate" className="cursor-pointer">Pro-rate</Label>
            </div>
          )}

          <Button onClick={handleSave} className="w-full">{isEdit ? "Update" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
