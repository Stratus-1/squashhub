import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Trash2, Edit2, Copy, Lock } from "lucide-react";
import { useClubCurrency } from "@/hooks/use-currency";
import { coveredPayableIds, isPayableSeasonLocked, isRetiredCopy, payableSeasons } from "@/lib/finance/payable-schedule";

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
  season_year: number;
}

interface SetRate {
  key: string;
  payee: string;
  source: "association" | "national";
  basisLabel: string;
  amount: number;
  due: string;
}

const assocBasisLabel = (b: string) => (b === "member" ? "Per member" : b === "league_team" ? "Per team" : "Per club");
const nationalBasisLabel = (b: string) => (b === "per_court" ? "Per court" : b === "per_member" ? "Per member" : "Per club");

export function FeesPayableSchedule({ clubId, season: seasonProp, onSeasonChange }: { clubId: string; season?: number; onSeasonChange?: (y: number) => void }) {
  const qc = useQueryClient();
  const { format: money, symbol: currencySymbol } = useClubCurrency();
  const thisYear = new Date().getFullYear();
  const [ownSeason, setOwnSeason] = useState(thisYear + 1);
  const season = seasonProp ?? ownSeason;
  const setSeason = (y: number) => (onSeasonChange ? onSeasonChange(y) : setOwnSeason(y));
  const locked = isPayableSeasonLocked(season, thisYear);
  const [editFee, setEditFee] = useState<PayableFee | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const { data: allFees = [] } = useQuery({
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

  const { data: assocStatement = [] } = useQuery({
    queryKey: ["club-association-statement", clubId, season],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_association_statement", { _club_id: clubId, _season_year: season });
      if (error) throw error;
      return (data || []) as { association_tenant_id: string; association_name: string; fee_item_id: string; label: string; basis: string; amount: number; due_month: number | null; due_day: number | null }[];
    },
    enabled: !!clubId,
  });

  const { data: nationalStatement = [] } = useQuery({
    queryKey: ["national-body-statement", clubId, season],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_national_body_statement", { _club_id: clubId, _season_year: season });
      if (error) throw error;
      return (data || []) as { organisation_name: string; fee_id: string; label: string; basis: string; amount: number }[];
    },
    enabled: !!clubId,
  });

  const { data: assocRows = [] } = useQuery({
    queryKey: ["assoc-payable-associations"],
    queryFn: async () => {
      const { data, error } = await fromExt("league_associations").select("id, name, tenant_association_id");
      if (error) throw error;
      return (data || []) as { id: string; name: string; tenant_association_id: string | null }[];
    },
  });

  const { data: nbLinks = [] } = useQuery({
    queryKey: ["assoc-payable-nb-links"],
    queryFn: async () => {
      const { data, error } = await fromExt("league_association_national_bodies").select("league_association_id, national_body_fee_id");
      if (error) throw error;
      return (data || []) as { league_association_id: string; national_body_fee_id: string }[];
    },
  });

  const seasons = useMemo(() => payableSeasons(thisYear, allFees.filter((f) => !isRetiredCopy(f)).map((f) => f.season_year)), [thisYear, allFees]);

  const seasonFees = allFees.filter((f) => f.season_year === season && !isRetiredCopy(f));
  const covered = coveredPayableIds(seasonFees, assocStatement, nationalStatement, assocRows, nbLinks);
  const fees = seasonFees.filter((f) => !covered.has(f.id));

  const setRates: SetRate[] = [
    ...assocStatement.map((r) => ({
      key: `a-${r.fee_item_id}`, payee: r.association_name, source: "association" as const,
      basisLabel: assocBasisLabel(r.basis), amount: Number(r.amount),
      due: r.due_month ? `${r.due_day ?? 1} ${SHORT_MONTHS[r.due_month - 1]}` : "—",
    })),
    ...nationalStatement.map((r) => ({
      key: `n-${r.fee_id}`, payee: r.organisation_name, source: "national" as const,
      basisLabel: nationalBasisLabel(r.basis), amount: Number(r.amount), due: "—",
    })),
  ];

  // Rows from the previous season that would still be needed this season.
  const prevFees = allFees.filter((f) => f.season_year === season - 1 && !isRetiredCopy(f));
  const prevCovered = coveredPayableIds(prevFees, assocStatement, nationalStatement, assocRows, nbLinks);
  const copyable = prevFees.filter((f) => !prevCovered.has(f.id));
  const canCopy = !locked && seasonFees.length === 0 && copyable.length > 0;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["club-fees-payable", clubId] });
    qc.invalidateQueries({ queryKey: ["assoc-payable-fees", clubId] });
  };

  const handleCopy = async () => {
    setCopying(true);
    const rows = copyable.map((f) => ({
      club_id: clubId, payee_type: f.payee_type, payee_name: f.payee_name, payee_ref_id: f.payee_ref_id,
      basis: f.basis, amount: f.amount, due_month: f.due_month, due_day: f.due_day, notes: f.notes,
      active: f.active, season_year: season,
    }));
    const { error } = await fromExt("club_fees_payable" as any).insert(rows);
    setCopying(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Copied ${rows.length} fee${rows.length === 1 ? "" : "s"} from ${season - 1} — update the amounts for ${season}`);
    refresh();
  };

  const handleToggle = async (fee: PayableFee) => {
    const { error } = await fromExt("club_fees_payable" as any).update({ active: !fee.active }).eq("id", fee.id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };

  const handleDelete = async (fee: PayableFee) => {
    if (!confirm(`Delete the ${season} payable fee to "${fee.payee_name}"?`)) return;
    const { error } = await fromExt("club_fees_payable" as any).delete().eq("id", fee.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    refresh();
  };

  const empty = setRates.length === 0 && fees.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold">Fees Payable Schedule — {season}</h3>
          <p className="text-xs text-muted-foreground">
            {locked
              ? `Record of what the club owed for ${season}. Read-only.`
              : "Fees the club owes to leagues, associations, or national bodies for this season"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
            <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Season"><SelectValue /></SelectTrigger>
            <SelectContent>
              {seasons.map((y) => <SelectItem key={y} value={String(y)}>{y} fees</SelectItem>)}
            </SelectContent>
          </Select>
          {canCopy && (
            <Button size="sm" variant="outline" disabled={copying} onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-1" />Copy {season - 1} fees
            </Button>
          )}
          {!locked && <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Payable Fee</Button>}
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Payable To</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead className="text-right">Amount ({currencySymbol})</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empty && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No payable fees recorded for {season}.
                </TableCell>
              </TableRow>
            )}
            {setRates.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.payee}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {r.source === "association" ? "League / Association" : "National Body"}
                  </Badge>
                </TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{r.basisLabel}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{money(r.amount)}</TableCell>
                <TableCell className="text-sm">{r.due}</TableCell>
                <TableCell className="text-center text-[10px] text-muted-foreground" colSpan={2}>
                  <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" />Set by {r.payee}</span>
                </TableCell>
              </TableRow>
            ))}
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
                    {fee.basis === "per_member" ? "Per member" : fee.basis === "per_team" ? "Per team" : "Per club"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(Number(fee.amount))}</TableCell>
                <TableCell className="text-sm">{fee.due_day} {SHORT_MONTHS[fee.due_month - 1]}</TableCell>
                <TableCell className="text-center">
                  <Switch disabled={locked} checked={fee.active} onCheckedChange={() => handleToggle(fee)} className="mx-auto" />
                </TableCell>
                <TableCell>
                  {!locked && (
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit" onClick={() => setEditFee(fee)}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Delete" onClick={() => handleDelete(fee)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {covered.size > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          {covered.size} of the club's own {season} row{covered.size === 1 ? " is" : "s are"} hidden because the association or national body set its own {season} rate.
        </p>
      )}

      {(editFee || addOpen) && (
        <PayableFeeDialog
          clubId={clubId}
          season={season}
          existing={editFee || undefined}
          open
          onOpenChange={() => { setEditFee(null); setAddOpen(false); }}
        />
      )}
    </div>
  );
}

function PayableFeeDialog({ clubId, season, existing, open, onOpenChange }: { clubId: string; season: number; existing?: PayableFee; open: boolean; onOpenChange: (o: boolean) => void; }) {
  const qc = useQueryClient();
  const { symbol: currencySymbol } = useClubCurrency();
  const isEdit = !!existing;
  const { data: associations = [] } = useLeagueAssociations(clubId);
  const { data: nationalFees = [] } = useNationalBodyFees(clubId);

  const [payeeType, setPayeeType] = useState<"league_association" | "national_body">(existing?.payee_type ?? "league_association");
  const [payeeRefId, setPayeeRefId] = useState<string>(existing?.payee_ref_id ?? "");
  const [payeeName, setPayeeName] = useState(existing?.payee_name ?? "");
  const [basis, setBasis] = useState<"per_member" | "per_club" | "per_team">(existing?.basis ?? "per_member");
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
      season_year: existing?.season_year ?? season,
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
    qc.invalidateQueries({ queryKey: ["assoc-payable-fees", clubId] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{isEdit ? "Edit" : "Add"} Payable Fee — {existing?.season_year ?? season}</DialogTitle></DialogHeader>
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
                <SelectItem value="per_team">Per team</SelectItem>
                <SelectItem value="per_club">Per club (fixed)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Amount ({currencySymbol})</Label>
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
