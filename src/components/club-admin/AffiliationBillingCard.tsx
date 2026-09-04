import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { postJournal } from "@/lib/post-journal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClubCurrency } from "@/hooks/use-currency";
import { toast } from "sonner";
import { Plus, FileUp, Building2 } from "lucide-react";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface StatementRow {
  association_tenant_id: string;
  association_name: string;
  fee_item_id: string;
  label: string;
  basis: "member" | "club" | "league_team" | string;
  amount: number;
  due_month: number | null;
  due_day: number | null;
  units_submitted: number;
  units_pending: number;
  total_submitted: number;
  total_pending: number;
}

interface PaymentRow {
  id: string;
  season_year: number;
  amount: number;
  paid_on: string;
  method: string;
  reference: string | null;
  proof_path: string | null;
  status: "pending" | "confirmed" | "disputed";
  notes: string | null;
}

const BASIS_LABEL: Record<string, string> = {
  club: "Per club",
  league_team: "Per team",
  member: "Per member",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "border-amber-500 text-amber-600",
  confirmed: "border-emerald-500 text-emerald-600",
  disputed: "border-destructive text-destructive",
};

export function AffiliationBillingCard({ clubId }: { clubId: string }) {
  const qc = useQueryClient();
  const { format: money } = useClubCurrency();
  const thisYear = new Date().getFullYear();
  const [season, setSeason] = useState<number>(thisYear + 1);
  const [payOpen, setPayOpen] = useState(false);

  const seasons = useMemo(() => {
    const list: number[] = [];
    for (let y = thisYear + 1; y >= thisYear - 3; y--) list.push(y);
    return list;
  }, [thisYear]);

  const { data: statement = [], isLoading } = useQuery({
    queryKey: ["club-association-statement", clubId, season],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("club_association_statement", {
        _club_id: clubId,
        _season_year: season,
      });
      if (error) throw error;
      return (data || []) as StatementRow[];
    },
    enabled: !!clubId,
  });

  const associationTenantId = statement[0]?.association_tenant_id || null;
  const associationName = statement[0]?.association_name || "association";

  const { data: payments = [] } = useQuery({
    queryKey: ["club-association-payments", clubId, season],
    queryFn: async () => {
      const { data, error } = await fromExt("club_association_payments")
        .select("*")
        .eq("club_id", clubId)
        .eq("season_year", season)
        .order("paid_on", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PaymentRow[];
    },
    enabled: !!clubId,
  });

  const billed = statement.reduce((s, r) => s + Number(r.total_submitted || 0), 0);
  const pending = statement.reduce((s, r) => s + Number(r.total_pending || 0), 0);
  const paid = payments
    .filter((p) => p.status !== "disputed")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = billed - paid;

  const openProof = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast.error("Could not open the proof of payment");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Building2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm flex-1 min-w-[160px]">
          Affiliation billing{associationTenantId ? ` — ${associationName}` : ""}
        </h3>
        <Select value={String(season)} onValueChange={(v) => setSeason(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {seasons.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 gap-1" disabled={!associationTenantId} onClick={() => setPayOpen(true)}>
          <Plus className="w-3 h-3" /> Record payment
        </Button>
      </div>

      {!associationTenantId && !isLoading && (
        <p className="text-xs text-muted-foreground">
          This club is not linked to an association yet, so there is nothing billed here.
        </p>
      )}

      {associationTenantId && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Stat label="Total billed" value={money(billed)} />
            <Stat label="Paid to date" value={money(paid)} tone="text-emerald-600" />
            <Stat label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "text-amber-600" : "text-emerald-600"} />
            <Stat label="Not yet submitted" value={money(pending)} tone="text-muted-foreground" />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Fee</TableHead>
                <TableHead className="text-[11px]">Basis</TableHead>
                <TableHead className="text-[11px] text-right">Rate</TableHead>
                <TableHead className="text-[11px] text-right">Submitted</TableHead>
                <TableHead className="text-[11px] text-right">Billed</TableHead>
                <TableHead className="text-[11px] text-right">Pending</TableHead>
                <TableHead className="text-[11px]">Renewal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statement.map((r) => (
                <TableRow key={r.fee_item_id}>
                  <TableCell className="text-xs">{r.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{BASIS_LABEL[r.basis] || r.basis}</TableCell>
                  <TableCell className="text-xs text-right">{money(Number(r.amount))}</TableCell>
                  <TableCell className="text-xs text-right">{r.units_submitted}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{money(Number(r.total_submitted))}</TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">
                    {r.units_pending > 0 ? `${r.units_pending} · ${money(Number(r.total_pending))}` : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.due_month && r.due_day ? `${r.due_day} ${SHORT_MONTHS[r.due_month - 1]}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {statement.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-xs text-muted-foreground text-center py-4">
                    No fees published by the association for {season}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {pending > 0 && (
            <p className="text-[11px] text-amber-600">
              Teams or players that have not been submitted yet are shown separately and are only billed once you submit them.
            </p>
          )}

          <div className="border-t pt-2 space-y-1">
            <p className="text-xs font-medium">Payments</p>
            {payments.length === 0 && <p className="text-[11px] text-muted-foreground">No payments recorded for {season}.</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="w-20">{p.paid_on}</span>
                <span className="font-medium">{money(Number(p.amount))}</span>
                <span className="text-muted-foreground capitalize">{p.method}</span>
                {p.reference && <span className="text-muted-foreground truncate max-w-[140px]">{p.reference}</span>}
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${STATUS_STYLE[p.status]}`}>{p.status}</Badge>
                {p.proof_path && (
                  <button className="text-primary hover:underline" onClick={() => openProof(p.proof_path!)}>proof</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {payOpen && associationTenantId && (
        <RecordPaymentDialog
          clubId={clubId}
          associationTenantId={associationTenantId}
          season={season}
          suggested={outstanding > 0 ? outstanding : 0}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["club-association-payments", clubId, season] });
            setPayOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${tone || ""}`}>{value}</p>
    </div>
  );
}

function RecordPaymentDialog({
  clubId, associationTenantId, season, suggested, onClose, onSaved,
}: {
  clubId: string;
  associationTenantId: string;
  season: number;
  suggested: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [postLedger, setPostLedger] = useState(true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.error("Enter the amount paid"); return; }
    setSaving(true);
    try {
      let proofPath: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "pdf";
        proofPath = `${clubId}/association/${season}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("payment-proofs").upload(proofPath, file);
        if (upErr) throw upErr;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await fromExt("club_association_payments").insert({
        club_id: clubId,
        association_tenant_id: associationTenantId,
        season_year: season,
        amount: amt,
        paid_on: paidOn,
        method,
        reference: reference || null,
        notes: notes || null,
        proof_path: proofPath,
        created_by: userRes?.user?.id ?? null,
      } as any);
      if (error) throw error;

      if (postLedger) {
        const desc = `Affiliation payment ${season}${reference ? ` (${reference})` : ""}`;
        await postJournal(clubId, [
          { account: "national_body_expense", debit: amt, description: desc },
          { account: method === "cash" ? "cash" : "bank_current", credit: amt, description: desc },
        ]);
      }

      toast.success("Payment recorded and sent to the association");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Could not record the payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record payment to the association</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Date paid</Label>
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="EFT reference" />
            </div>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><FileUp className="w-3 h-3" /> Proof of payment</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={postLedger} onCheckedChange={(v) => setPostLedger(!!v)} />
            Record this payment in the club ledger
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
