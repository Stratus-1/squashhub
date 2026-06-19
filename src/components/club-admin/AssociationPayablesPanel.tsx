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
import { Building2, Plus, CheckCircle2, Clock, Wallet, XCircle, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";

interface Props { clubId: string }

interface NationalBody {
  id: string;
  body_name: string;
  abbreviation: string | null;
  fee_annual: number;
}
interface EligibleMember {
  club_member_id: string;
  name: string;
  member_number: string | null;
  league_number: string | null;
}
interface BatchRow {
  id: string;
  national_body_fee_id: string;
  season_label: string;
  total_amount: number;
  member_count: number;
  status: "pending" | "paid" | "void";
  paid_at: string | null;
  paid_amount: number | null;
  payment_reference: string | null;
  created_at: string;
}

export function AssociationPayablesPanel({ clubId }: Props) {
  const qc = useQueryClient();
  const [generateBody, setGenerateBody] = useState<NationalBody | null>(null);
  const [settleBatch, setSettleBatch] = useState<BatchRow | null>(null);

  /* ─── National bodies (eligible fees only) ─── */
  const { data: bodies = [] } = useQuery({
    queryKey: ["assoc-payable-bodies", clubId],
    queryFn: async (): Promise<NationalBody[]> => {
      const { data, error } = await fromExt("national_body_fees")
        .select("id, body_name, abbreviation, fee_annual, active")
        .eq("club_id", clubId)
        .eq("active", true)
        .order("body_name");
      if (error) throw error;
      return (data || []).map((b: any) => ({
        id: b.id,
        body_name: b.body_name,
        abbreviation: b.abbreviation,
        fee_annual: Number(b.fee_annual) || 0,
      }));
    },
    enabled: !!clubId,
  });

  /* ─── Existing batches for this club ─── */
  const { data: batches = [] } = useQuery({
    queryKey: ["assoc-payable-batches", clubId],
    queryFn: async (): Promise<BatchRow[]> => {
      const { data, error } = await fromExt("club_association_payable_batches")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const outstandingByBody = useMemo(() => {
    const m: Record<string, number> = {};
    batches.forEach((b) => {
      if (b.status === "pending") {
        m[b.national_body_fee_id] = (m[b.national_body_fee_id] || 0) + Number(b.total_amount || 0);
      }
    });
    return m;
  }, [batches]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Association Payables</h3>
        <Badge variant="outline" className="text-[10px]">{bodies.length} bodies linked</Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Generate annual lump-sum payables to national bodies. The club is invoiced; eligible members are tracked
        per-batch so you have a permanent audit trail of who has been covered.
      </p>

      {bodies.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No national bodies are configured. Add one under Fees → National body fees first.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {bodies.map((b) => (
            <Card key={b.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{b.body_name}</p>
                  {b.abbreviation && (
                    <p className="text-[11px] text-muted-foreground">{b.abbreviation}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px]">R{b.fee_annual.toFixed(2)} / member</Badge>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Wallet className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Outstanding:</span>
                <span className={outstandingByBody[b.id] ? "text-destructive font-semibold tabular-nums" : "tabular-nums"}>
                  R{(outstandingByBody[b.id] || 0).toFixed(2)}
                </span>
              </div>
              <Button size="sm" className="w-full gap-1.5 h-8" onClick={() => setGenerateBody(b)}>
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
                  <TableHead className="text-[10px]">Body</TableHead>
                  <TableHead className="text-[10px]">Season</TableHead>
                  <TableHead className="text-[10px] text-right">Members</TableHead>
                  <TableHead className="text-[10px] text-right">Total</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px]">Created</TableHead>
                  <TableHead className="text-[10px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => {
                  const body = bodies.find((x) => x.id === b.national_body_fee_id);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs font-medium">{body?.body_name || "—"}</TableCell>
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

      {generateBody && (
        <GenerateDialog
          clubId={clubId}
          body={generateBody}
          existingBatches={batches}
          onClose={() => setGenerateBody(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["assoc-payable-batches", clubId] });
            qc.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
            setGenerateBody(null);
          }}
        />
      )}

      {settleBatch && (
        <SettleDialog
          clubId={clubId}
          batch={settleBatch}
          body={bodies.find((x) => x.id === settleBatch.national_body_fee_id) || null}
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

/* ─── Generate Payable Dialog ─── */
function GenerateDialog({
  clubId, body, existingBatches, onClose, onCreated,
}: {
  clubId: string;
  body: NationalBody;
  existingBatches: BatchRow[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const defaultSeason = String(new Date().getFullYear());
  const [seasonLabel, setSeasonLabel] = useState(defaultSeason);
  const [submitting, setSubmitting] = useState(false);

  /* Fetch the league_associations linked to this national body, then eligible members */
  const { data: eligible = [], isLoading } = useQuery({
    queryKey: ["assoc-payable-eligible", clubId, body.id, seasonLabel],
    queryFn: async (): Promise<EligibleMember[]> => {
      // 1) linked associations
      const { data: linkRows, error: linkErr } = await fromExt("league_association_national_bodies")
        .select("league_association_id")
        .eq("national_body_fee_id", body.id);
      if (linkErr) throw linkErr;
      const assocIds = (linkRows || []).map((r: any) => r.league_association_id);
      if (assocIds.length === 0) return [];

      // 2) active affiliations
      const { data: affils, error: afErr } = await fromExt("member_association_affiliations")
        .select("club_member_id, association_id, league_association_number, active")
        .in("association_id", assocIds)
        .eq("active", true);
      if (afErr) throw afErr;

      // Dedupe by club_member_id; pick first league number
      const map = new Map<string, { league_number: string | null }>();
      (affils || []).forEach((a: any) => {
        if (!map.has(a.club_member_id)) map.set(a.club_member_id, { league_number: a.league_association_number || null });
      });
      const memberIds = Array.from(map.keys());
      if (memberIds.length === 0) return [];

      // 3) club members (must belong to this club & active)
      const { data: members, error: mErr } = await fromExt("club_members")
        .select("id, name, club_member_number, status, club_id")
        .eq("club_id", clubId)
        .in("id", memberIds);
      if (mErr) throw mErr;

      // 4) already-billed in a non-void batch for this season+fee
      const { data: existingLines } = await fromExt("club_association_payable_lines")
        .select("club_member_id, batch_id")
        .in("club_member_id", memberIds);
      const seasonBatchIds = new Set(
        existingBatches
          .filter((b) => b.national_body_fee_id === body.id && b.season_label === seasonLabel && b.status !== "void")
          .map((b) => b.id),
      );
      const alreadyBilled = new Set(
        (existingLines || [])
          .filter((l: any) => seasonBatchIds.has(l.batch_id))
          .map((l: any) => l.club_member_id),
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
    enabled: !!body.id,
  });

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // Initialise selection when eligible list arrives
  useEffect(() => {
    const next: Record<string, boolean> = {};
    eligible.forEach((m) => { next[m.club_member_id] = true; });
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible.length, body.id, seasonLabel]);

  const tickedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const total = tickedIds.length * body.fee_annual;

  const toggleAll = (val: boolean) => {
    const next: Record<string, boolean> = {};
    eligible.forEach((m) => { next[m.club_member_id] = val; });
    setSelected(next);
  };

  const create = async () => {
    if (tickedIds.length === 0) { toast.error("Select at least one member"); return; }
    if (!seasonLabel.trim()) { toast.error("Enter a season label"); return; }
    setSubmitting(true);
    try {
      const journalRef = crypto.randomUUID();
      // 1) batch
      const { data: batchData, error: batchErr } = await fromExt("club_association_payable_batches")
        .insert({
          club_id: clubId,
          national_body_fee_id: body.id,
          season_label: seasonLabel.trim(),
          total_amount: total,
          member_count: tickedIds.length,
          status: "pending",
          journal_ref_raise: journalRef,
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;
      const batchId = batchData.id;

      // 2) lines
      const lines = tickedIds.map((id) => {
        const m = eligible.find((x) => x.club_member_id === id)!;
        return {
          batch_id: batchId,
          club_member_id: id,
          league_number: m.league_number,
          amount: body.fee_annual,
          paid: false,
        };
      });
      const { error: linesErr } = await fromExt("club_association_payable_lines").insert(lines);
      if (linesErr) throw linesErr;

      // 3) GL journal: Dr Affiliation Expense / Cr Association Payable
      const desc = `Affiliation: ${body.body_name} – ${seasonLabel} (${tickedIds.length} members)`;
      const { error: jErr } = await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "national_body_expense", debit: total, credit: 0, description: desc },
        { club_id: clubId, journal_ref: journalRef, account: "association_payable", debit: 0, credit: total, description: desc },
      ]);
      if (jErr) throw jErr;

      toast.success(`Payable raised: R${total.toFixed(2)} (${tickedIds.length} members)`);
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
          <DialogTitle>Generate payable — {body.body_name}</DialogTitle>
          <DialogDescription>
            Select members covered by this payable. R{body.fee_annual.toFixed(2)} per member.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Season label</Label>
            <Input value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} className="h-8 text-sm" placeholder="2026" />
          </div>
          <div className="flex items-end justify-end gap-3 text-sm">
            <div><span className="text-muted-foreground text-xs">Selected:</span> <span className="font-semibold tabular-nums">{tickedIds.length}</span></div>
            <div><span className="text-muted-foreground text-xs">Total:</span> <span className="font-bold tabular-nums">R{total.toFixed(2)}</span></div>
          </div>
        </div>

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
                    <TableCell className="text-xs text-right tabular-nums">R{body.fee_annual.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={create} disabled={submitting || tickedIds.length === 0}>
            {submitting ? "Creating…" : `Create payable batch — R${total.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Settle Dialog ─── */
function SettleDialog({
  clubId, batch, body, onClose, onSettled,
}: {
  clubId: string;
  batch: BatchRow;
  body: NationalBody | null;
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
      const desc = `Affiliation payment: ${body?.body_name || "Body"} – ${batch.season_label}${paymentRef ? ` (${paymentRef})` : ""}`;

      // GL: Dr Association Payable / Cr Bank|Cash
      const { error: jErr } = await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "association_payable", debit: amt, credit: 0, description: desc },
        { club_id: clubId, journal_ref: journalRef, account: moneyAccount, debit: 0, credit: amt, description: desc },
      ]);
      if (jErr) throw jErr;

      // Update batch
      const { error: bErr } = await fromExt("club_association_payable_batches")
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

      // Flip lines to paid
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
          <DialogTitle>Settle batch — {body?.body_name}</DialogTitle>
          <DialogDescription>
            {batch.member_count} members · {batch.season_label} · Total R{Number(batch.total_amount).toFixed(2)}
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
