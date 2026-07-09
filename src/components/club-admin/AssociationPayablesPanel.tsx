import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { postJournal } from "@/lib/post-journal";
import { Building2, Plus, CheckCircle2, Clock, Wallet, XCircle, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

interface Props { clubId: string }

type Basis = "per_member" | "per_team" | "per_club";

interface PayableFee {
  id: string;
  payee_name: string;
  payee_type: "league_association" | "national_body";
  payee_ref_id: string | null;
  basis: Basis;
  amount: number;
}
interface EligibleMember {
  club_member_id: string;
  name: string;
  member_number: string | null;
  league_number: string | null;
}
interface BatchRow {
  id: string;
  payable_fee_id: string | null;
  national_body_fee_id: string | null;
  season_label: string;
  total_amount: number;
  member_count: number;
  basis: string | null;
  unit_amount: number | null;
  status: "pending" | "paid" | "void";
  paid_at: string | null;
  paid_amount: number | null;
  payment_reference: string | null;
  created_at: string;
}

const basisLabel = (b: Basis) => b === "per_member" ? "Per member" : b === "per_team" ? "Per team" : "Per club";
const basisUnit = (b: Basis) => b === "per_member" ? "member" : b === "per_team" ? "team" : "club";

export function AssociationPayablesPanel({ clubId }: Props) {
  const qc = useQueryClient();
  const [generateFee, setGenerateFee] = useState<PayableFee | null>(null);
  const [settleBatch, setSettleBatch] = useState<BatchRow | null>(null);

  /* ─── Fees the club owes (from Fees Payable Schedule) ─── */
  const { data: fees = [] } = useQuery({
    queryKey: ["assoc-payable-fees", clubId],
    queryFn: async (): Promise<PayableFee[]> => {
      const { data, error } = await fromExt("club_fees_payable" as any)
        .select("id, payee_name, payee_type, payee_ref_id, basis, amount, active")
        .eq("club_id", clubId)
        .eq("active", true)
        .order("payee_name");
      if (error) throw error;
      return (data || []).map((f: any) => ({
        id: f.id,
        payee_name: f.payee_name,
        payee_type: f.payee_type,
        payee_ref_id: f.payee_ref_id,
        basis: f.basis,
        amount: Number(f.amount) || 0,
      }));
    },
    enabled: !!clubId,
  });

  /* ─── Existing batches for this club ─── */
  const { data: batches = [] } = useQuery({
    queryKey: ["assoc-payable-batches", clubId],
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await fromExt("club_association_payable_batches" as any)
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const outstandingByFee = useMemo(() => {
    const m: Record<string, number> = {};
    batches.forEach((b) => {
      if (b.status === "pending" && b.payable_fee_id) {
        m[b.payable_fee_id] = (m[b.payable_fee_id] || 0) + Number(b.total_amount || 0);
      }
    });
    return m;
  }, [batches]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Association Payables</h3>
        <Badge variant="outline" className="text-[10px]">{fees.length} fee{fees.length === 1 ? "" : "s"} configured</Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Generate lump-sum payables for the fees in your Fees Payable Schedule. The club is invoiced; each batch
        keeps a permanent audit trail of who/what was covered.
      </p>

      {fees.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No payable fees configured. Add them under Fees → Fees Payable Schedule.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {fees.map((f) => (
            <Card key={f.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{f.payee_name}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">{basisLabel(f.basis)}</Badge>
                </div>
                <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                  R{f.amount.toFixed(2)} / {basisUnit(f.basis)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Wallet className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Outstanding:</span>
                <span className={outstandingByFee[f.id] ? "text-destructive font-semibold tabular-nums" : "tabular-nums"}>
                  R{(outstandingByFee[f.id] || 0).toFixed(2)}
                </span>
              </div>
              <Button size="sm" className="w-full gap-1.5 h-8" onClick={() => setGenerateFee(f)}>
                <Plus className="w-3.5 h-3.5" /> Generate Payable
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Batches list */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-semibold">Batches</h4>
          <Badge variant="outline" className="text-[10px]">{batches.length}</Badge>
        </div>
        {batches.length === 0 ? (
          <Card className="p-4 text-xs text-muted-foreground text-center">No batches generated yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Payee</TableHead>
                  <TableHead className="text-[10px]">Basis</TableHead>
                  <TableHead className="text-[10px]">Season</TableHead>
                  <TableHead className="text-[10px] text-right">Units</TableHead>
                  <TableHead className="text-[10px] text-right">Total</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px]">Created</TableHead>
                  <TableHead className="text-[10px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const fee = fees.find((x) => x.id === b.payable_fee_id);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs font-medium">{fee?.payee_name || "—"}</TableCell>
                      <TableCell className="text-xs">{b.basis ? basisLabel(b.basis as Basis) : "—"}</TableCell>
                      <TableCell className="text-xs">{b.season_label}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{b.member_count}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">R{Number(b.total_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        {b.status === "pending" && <Badge variant="outline" className="text-[10px] gap-1"><Clock className="w-3 h-3" /> Pending</Badge>}
                        {b.status === "paid" && <Badge className="text-[10px] gap-1 bg-green-600"><CheckCircle2 className="w-3 h-3" /> Paid</Badge>}
                        {b.status === "void" && <Badge variant="destructive" className="text-[10px] gap-1"><XCircle className="w-3 h-3" /> Void</Badge>}
                      </TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">{format(new Date(b.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right">
                        {b.status === "pending" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSettleBatch(b)}>
                            Settle
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {generateFee && (
        <GenerateDialog
          clubId={clubId}
          fee={generateFee}
          existingBatches={batches}
          onClose={() => setGenerateFee(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["assoc-payable-batches", clubId] });
            qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
            setGenerateFee(null);
          }}
        />
      )}

      {settleBatch && (
        <SettleDialog
          clubId={clubId}
          batch={settleBatch}
          fee={fees.find((x) => x.id === settleBatch.payable_fee_id) || null}
          onClose={() => setSettleBatch(null)}
          onSettled={() => {
            qc.invalidateQueries({ queryKey: ["assoc-payable-batches", clubId] });
            qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
            setSettleBatch(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Resolve which league_associations this fee maps to ─── */
async function resolveAssocIds(fee: PayableFee): Promise<string[]> {
  if (fee.payee_type === "league_association" && fee.payee_ref_id) {
    return [fee.payee_ref_id];
  }
  if (fee.payee_type === "national_body" && fee.payee_ref_id) {
    const { data } = await fromExt("league_association_national_bodies")
      .select("league_association_id")
      .eq("national_body_fee_id", fee.payee_ref_id);
    return (data || []).map((r: any) => r.league_association_id);
  }
  return [];
}

/* ─── Generate Payable Dialog ─── */
function GenerateDialog({
  clubId, fee, existingBatches, onClose, onCreated,
}: {
  clubId: string;
  fee: PayableFee;
  existingBatches: BatchRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const defaultSeason = String(new Date().getFullYear());
  const [seasonLabel, setSeasonLabel] = useState(defaultSeason);
  const [submitting, setSubmitting] = useState(false);

  const isPerMember = fee.basis === "per_member";
  const isPerTeam = fee.basis === "per_team";
  const isPerClub = fee.basis === "per_club";

  /* Eligible members (per_member only) */
  const { data: eligible = [], isLoading } = useQuery({
    queryKey: ["assoc-payable-eligible", clubId, fee.id, seasonLabel],
    queryFn: async (): Promise<EligibleMember[]> => {
      const assocIds = await resolveAssocIds(fee);
      if (assocIds.length === 0) return [];

      const { data: affils, error: afErr } = await fromExt("member_association_affiliations")
        .select("club_member_id, association_id, league_association_number, active")
        .in("association_id", assocIds)
        .eq("active", true);
      if (afErr) throw afErr;

      const map = new Map<string, { league_number: string | null }>();
      (affils || []).forEach((a: any) => {
        if (!map.has(a.club_member_id)) map.set(a.club_member_id, { league_number: a.league_association_number || null });
      });
      const memberIds = Array.from(map.keys());
      if (memberIds.length === 0) return [];

      const { data: members, error: mErr } = await fromExt("club_members")
        .select("id, name, club_member_number, status, club_id")
        .eq("club_id", clubId)
        .in("id", memberIds);
      if (mErr) throw mErr;

      const { data: existingLines } = await fromExt("club_association_payable_lines")
        .select("club_member_id, batch_id")
        .in("club_member_id", memberIds);
      const seasonBatchIds = new Set(
        existingBatches
          .filter((b) => b.payable_fee_id === fee.id && b.season_label === seasonLabel && b.status !== "void")
          .map((b) => b.id),
      );
      const alreadyBilled = new Set(
        (existingLines || []).filter((l: any) => seasonBatchIds.has(l.batch_id)).map((l: any) => l.club_member_id),
      );

      return (members || [])
        .filter((m: any) => (m.status || "active") === "active" && !alreadyBilled.has(m.id))
        .map((m: any) => ({
          club_member_id: m.id,
          name: m.name,
          member_number: m.club_member_number || null,
          league_number: map.get(m.id)?.league_number || null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!fee.id && isPerMember,
  });

  /* Auto-count teams (per_team only) */
  const { data: autoTeamCount = 0 } = useQuery({
    queryKey: ["assoc-payable-team-count", clubId, fee.id],
    queryFn: async (): Promise<number> => {
      const assocIds = await resolveAssocIds(fee);
      if (assocIds.length === 0) return 0;
      const { data: leagues } = await fromExt("leagues")
        .select("id, club_id, association_id")
        .eq("club_id", clubId)
        .in("association_id", assocIds);
      return (leagues || []).length;
    },
    enabled: !!fee.id && isPerTeam,
  });

  const [teamCount, setTeamCount] = useState<string>("");
  const [teamCountTouched, setTeamCountTouched] = useState(false);
  useEffect(() => {
    if (isPerTeam && !teamCountTouched && autoTeamCount > 0) setTeamCount(String(autoTeamCount));
  }, [autoTeamCount, isPerTeam, teamCountTouched]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!isPerMember) return;
    const next: Record<string, boolean> = {};
    eligible.forEach((m) => { next[m.club_member_id] = true; });
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible.length, fee.id, seasonLabel]);

  const tickedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const teams = Math.max(0, parseInt(teamCount, 10) || 0);
  const units = isPerMember ? tickedIds.length : isPerTeam ? teams : 1;
  const total = units * fee.amount;

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    eligible.forEach((m) => { next[m.club_member_id] = val; });
    setSelected(next);
  };

  const create = async () => {
    if (units === 0) {
      toast.error(isPerMember ? "Select at least one member" : isPerTeam ? "Enter the number of teams" : "Invalid");
      return;
    }
    if (!seasonLabel.trim()) { toast.error("Enter a season label"); return; }
    setSubmitting(true);
    try {
      const journalRef = crypto.randomUUID();
      const { data: batchData, error: batchErr } = await fromExt("club_association_payable_batches" as any)
        .insert({
          club_id: clubId,
          payable_fee_id: fee.id,
          season_label: seasonLabel.trim(),
          total_amount: total,
          member_count: units,
          basis: fee.basis,
          unit_amount: fee.amount,
          status: "pending",
          journal_ref_raise: journalRef,
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;
      const batchId = batchData.id;

      // Audit lines for per-member flow
      if (isPerMember && tickedIds.length > 0) {
        const lines = tickedIds.map((id) => {
          const m = eligible.find((x) => x.club_member_id === id)!;
          return {
            batch_id: batchId,
            club_member_id: id,
            league_number: m.league_number,
            amount: fee.amount,
            paid: false,
          };
        });
        const { error: linesErr } = await fromExt("club_association_payable_lines").insert(lines);
        if (linesErr) throw linesErr;
      }

      const unitWord = basisUnit(fee.basis) + (units === 1 ? "" : "s");
      const desc = `Affiliation: ${fee.payee_name} – ${seasonLabel} (${units} ${unitWord})`;
      const { error: jErr } = await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "national_body_expense", debit: total, credit: 0, description: desc },
        { club_id: clubId, journal_ref: journalRef, account: "association_payable", debit: 0, credit: total, description: desc },
      ]);
      if (jErr) throw jErr;

      toast.success(`Payable raised: R${total.toFixed(2)} (${units} ${unitWord})`);
      onCreated();
    } catch (err: any) {
      const f = friendlyError(err);
      toast.error(f.title, { description: f.description });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate payable — {fee.payee_name}</DialogTitle>
          <DialogDescription>
            {isPerMember && `R${fee.amount.toFixed(2)} per member. Select members covered by this payable.`}
            {isPerTeam && `R${fee.amount.toFixed(2)} per team entered into the league.`}
            {isPerClub && `Flat club-level fee of R${fee.amount.toFixed(2)}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Season label</Label>
            <Input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} className="h-8 text-sm" placeholder="2026" />
          </div>
          <div className="flex items-end justify-end gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">
                {isPerMember ? "Selected:" : isPerTeam ? "Teams:" : "Units:"}
              </span>{" "}
              <span className="font-semibold tabular-nums">{units}</span>
            </div>
            <div><span className="text-muted-foreground text-xs">Total:</span> <span className="font-bold tabular-nums">R{total.toFixed(2)}</span></div>
          </div>
        </div>

        {isPerTeam && (
          <div className="border rounded-md p-4 space-y-2">
            <Label className="text-xs">Number of teams</Label>
            <Input
              type="number"
              min={1}
              value={teamCount}
              onChange={(e) => { setTeamCountTouched(true); setTeamCount(e.target.value); }}
              className="h-9 w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Auto-detected <span className="font-semibold">{autoTeamCount}</span> team{autoTeamCount === 1 ? "" : "s"} entered into linked leagues — edit if different.
              <br />
              R{fee.amount.toFixed(2)} × {teams} = R{total.toFixed(2)}.
            </p>
          </div>
        )}

        {isPerClub && (
          <div className="border rounded-md p-4 text-xs text-muted-foreground">
            This is a flat per-club fee. Total: <span className="font-semibold text-foreground">R{total.toFixed(2)}</span>.
          </div>
        )}

        {isPerMember && (
          <div className="border rounded-md max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading eligible members…</p>
            ) : eligible.length === 0 ? (
              <div className="p-6 text-xs text-muted-foreground text-center">
                <Users className="w-6 h-6 mx-auto mb-2 opacity-50" />
                No eligible members for this season. Either none have active league numbers, or all have been billed already.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={tickedIds.length === eligible.length}
                        onCheckedChange={(v) => toggleAll(!!v)}
                      />
                    </TableHead>
                    <TableHead className="text-[10px]">Member #</TableHead>
                    <TableHead className="text-[10px]">Name</TableHead>
                    <TableHead className="text-[10px]">League #</TableHead>
                    <TableHead className="text-[10px] text-right">Fee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligible.map((m) => (
                    <TableRow key={m.club_member_id}>
                      <TableCell>
                        <Checkbox
                          checked={!!selected[m.club_member_id]}
                          onCheckedChange={(v) => setSelected((s) => ({ ...s, [m.club_member_id]: !!v }))}
                        />
                      </TableCell>
                      <TableCell className="text-xs">{m.member_number || "—"}</TableCell>
                      <TableCell className="text-xs">{m.name}</TableCell>
                      <TableCell className="text-xs">{m.league_number || "—"}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">R{fee.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={create} disabled={submitting || units === 0}>
            {submitting ? "Creating…" : `Create payable batch — R${total.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Settle Dialog ─── */
function SettleDialog({
  clubId, batch, fee, onClose, onSettled,
}: {
  clubId: string;
  batch: BatchRow;
  fee: PayableFee | null;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [paidAmount, setPaidAmount] = useState(String(Number(batch.total_amount).toFixed(2)));
  const [paymentRef, setPaymentRef] = useState("");
  const [method, setMethod] = useState<"bank" | "cash">("bank");
  const [submitting, setSubmitting] = useState(false);

  const settle = async () => {
    const amt = parseFloat(paidAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSubmitting(true);
    try {
      const journalRef = crypto.randomUUID();
      const moneyAccount = method === "cash" ? "cash" : "bank_current";
      const desc = `Affiliation payment: ${fee?.payee_name || "Payable"} – ${batch.season_label}${paymentRef ? ` (${paymentRef})` : ""}`;

      const { error: jErr } = await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "association_payable", debit: amt, credit: 0, description: desc },
        { club_id: clubId, journal_ref: journalRef, account: moneyAccount, debit: 0, credit: amt, description: desc },
      ]);
      if (jErr) throw jErr;

      const { error: bErr } = await fromExt("club_association_payable_batches" as any)
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          paid_amount: amt,
          payment_reference: paymentRef || null,
          bank_account: method,
          journal_ref_settle: journalRef,
        })
        .eq("id", batch.id);
      if (bErr) throw bErr;

      const { error: lErr } = await fromExt("club_association_payable_lines")
        .update({ paid: true, paid_at: new Date().toISOString() })
        .eq("batch_id", batch.id);
      if (lErr) throw lErr;

      toast.success("Batch settled");
      onSettled();
    } catch (err: any) {
      const f = friendlyError(err);
      toast.error(f.title, { description: f.description });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settle batch — {fee?.payee_name}</DialogTitle>
          <DialogDescription>
            {batch.member_count} {batch.basis ? basisUnit(batch.basis as Basis) + (batch.member_count === 1 ? "" : "s") : "units"} · {batch.season_label} · Total R{Number(batch.total_amount).toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Amount paid</Label>
            <Input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Payment reference (optional)</Label>
            <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="EFT reference / cheque #" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Method</Label>
            <div className="flex gap-2 mt-1">
              <Button size="sm" variant={method === "bank" ? "default" : "outline"} onClick={() => setMethod("bank")}>Bank</Button>
              <Button size="sm" variant={method === "cash" ? "default" : "outline"} onClick={() => setMethod("cash")}>Cash</Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={settle} disabled={submitting}>{submitting ? "Settling…" : "Settle"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
