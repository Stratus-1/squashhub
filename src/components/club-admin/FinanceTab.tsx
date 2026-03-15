import { Club, useClubMembers } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { CheckCircle2, XCircle, Clock, Wallet, BookOpen, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type GLAccount = "debtors" | "fee_income" | "bank" | "creditors";

const ACCOUNT_LABELS: Record<GLAccount, string> = {
  debtors: "Debtors",
  fee_income: "Fee Income",
  bank: "Bank",
  creditors: "Creditors",
};

const ACCOUNT_TYPE: Record<GLAccount, "BS" | "IS"> = {
  debtors: "BS",
  fee_income: "IS",
  bank: "BS",
  creditors: "BS",
};

export function FinanceTab({ club, clubId }: { club: Club; clubId: string }) {
  const queryClient = useQueryClient();
  const { data: members } = useClubMembers(clubId);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [payOverOpen, setPayOverOpen] = useState(false);

  // Fetch journal entries
  const { data: journalEntries, isLoading } = useQuery({
    queryKey: ["club-journal-entries", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_journal_entries")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  // Fetch pending EFT payments
  const { data: pendingTransactions, isLoading: pendingLoading } = useQuery({
    queryKey: ["pending-member-transactions", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_credit_transactions")
        .select("*")
        .eq("club_id", clubId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
  });

  const getMemberName = (memberId: string) => {
    const member = (members || []).find(m => m.id === memberId);
    return member?.name || member?.profiles?.name || "Unknown";
  };

  type BalEntry = { debit: number; credit: number };
  type TrialBal = Record<GLAccount, BalEntry>;

  // Calculate trial balance
  const trialBalance: TrialBal = (journalEntries || []).reduce(
    (acc: TrialBal, entry: any) => {
      const account = entry.account as GLAccount;
      if (!acc[account]) acc[account] = { debit: 0, credit: 0 };
      acc[account].debit += Number(entry.debit);
      acc[account].credit += Number(entry.credit);
      return acc;
    },
    { debtors: { debit: 0, credit: 0 }, fee_income: { debit: 0, credit: 0 }, bank: { debit: 0, credit: 0 }, creditors: { debit: 0, credit: 0 } }
  );

  // Outstanding creditors = credit - debit on creditors account (what club owes to associations)
  const outstandingCreditors = trialBalance.creditors.credit - trialBalance.creditors.debit;

  // Outstanding debtors = debit - credit on debtors account (what members owe)
  const outstandingDebtors = trialBalance.debtors.debit - trialBalance.debtors.credit;

  // Fee income = credit - debit on fee_income account
  const feeIncome = trialBalance.fee_income.credit - trialBalance.fee_income.debit;

  // Bank balance (from GL perspective)
  const bankBalance = trialBalance.bank.debit - trialBalance.bank.credit;

  const filteredEntries = accountFilter === "all"
    ? (journalEntries || [])
    : (journalEntries || []).filter((e: any) => e.account === accountFilter);

  // Group by journal_ref for display
  const groupedByRef = (filteredEntries || []).reduce((acc: Record<string, any[]>, entry: any) => {
    const ref = entry.journal_ref;
    if (!acc[ref]) acc[ref] = [];
    acc[ref].push(entry);
    return acc;
  }, {});

  // Handle confirm payment (EFT)
  const handleConfirmPayment = async (txId: string) => {
    try {
      const tx = (pendingTransactions || []).find((t: any) => t.id === txId);
      if (!tx) return;

      // Confirm the transaction
      const { error } = await fromExt("member_credit_transactions")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", txId);
      if (error) throw error;

      // Create GL entries: Dt Bank, Ct Debtors
      const journalRef = crypto.randomUUID();
      const memberName = getMemberName(tx.club_member_id);
      const desc = `Payment received: ${tx.description || "EFT"} — ${memberName}`;

      await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "bank", debit: Math.abs(Number(tx.amount)), credit: 0, description: desc, club_member_id: tx.club_member_id, transaction_id: txId },
        { club_id: clubId, journal_ref: journalRef, account: "debtors", debit: 0, credit: Math.abs(Number(tx.amount)), description: desc, club_member_id: tx.club_member_id, transaction_id: txId },
      ]);

      // Mark associated fees as paid if this was a fee payment (EFT)
      if (tx.type === "payment" && tx.club_member_id) {
        const { data: unpaidFees } = await fromExt("club_member_fee_payments")
          .select("id, fee_label")
          .eq("club_member_id", tx.club_member_id)
          .eq("paid", false);
        const desc = (tx.description || "") as string;
        const feesToMark = (unpaidFees || []).filter((f: any) => desc.includes(f.fee_label));
        for (const fee of feesToMark) {
          await fromExt("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", fee.id);
        }
        queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      }

      toast.success("Payment confirmed with GL entries");
      queryClient.invalidateQueries({ queryKey: ["pending-member-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm");
    }
  };

  const handleRejectPayment = async (txId: string) => {
    try {
      const { error } = await fromExt("member_credit_transactions")
        .update({ status: "rejected" })
        .eq("id", txId);
      if (error) throw error;
      toast.success("Payment rejected");
      queryClient.invalidateQueries({ queryKey: ["pending-member-transactions"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject");
    }
  };

  // Handle pay-over to associations/SSA
  const handlePayOver = async () => {
    if (outstandingCreditors <= 0) return;
    try {
      const journalRef = crypto.randomUUID();
      const desc = `Pay-over to associations/federations`;
      await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "creditors", debit: outstandingCreditors, credit: 0, description: desc },
        { club_id: clubId, journal_ref: journalRef, account: "bank", debit: 0, credit: outstandingCreditors, description: desc },
      ]);
      toast.success("Pay-over recorded. Creditors cleared.");
      setPayOverOpen(false);
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to record pay-over");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Debtors</p>
          <p className={cn("text-xl font-bold tabular-nums", outstandingDebtors > 0 ? "text-amber-600" : "text-green-600")}>
            R{outstandingDebtors.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Owed by members</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Fee Income</p>
          <p className="text-xl font-bold tabular-nums text-green-600">R{feeIncome.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">Club revenue</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Bank</p>
          <p className={cn("text-xl font-bold tabular-nums", bankBalance >= 0 ? "text-green-600" : "text-destructive")}>
            R{bankBalance.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">GL bank balance</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Creditors</p>
          <p className={cn("text-xl font-bold tabular-nums", outstandingCreditors > 0 ? "text-amber-600" : "text-green-600")}>
            R{outstandingCreditors.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Owed to associations</p>
        </Card>
      </div>

      {/* Creditors Pay-Over Reminder */}
      {outstandingCreditors > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-semibold text-sm">Outstanding Association/SSA Fees</p>
                <p className="text-xs text-muted-foreground">
                  R{outstandingCreditors.toFixed(2)} collected from members needs to be paid over to associations/federations.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPayOverOpen(true)} className="gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Record Pay-Over
            </Button>
          </div>
        </Card>
      )}

      <Tabs defaultValue="journal" className="w-full">
        <TabsList>
          <TabsTrigger value="journal" className="text-xs">Journal</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">
            Pending Payments
            {(pendingTransactions || []).length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">{(pendingTransactions || []).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trial" className="text-xs">Trial Balance</TabsTrigger>
        </TabsList>

        {/* Journal Tab */}
        <TabsContent value="journal">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">General Journal</h3>
              </div>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Filter account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  <SelectItem value="debtors">Debtors</SelectItem>
                  <SelectItem value="fee_income">Fee Income</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="creditors">Creditors</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No journal entries yet. Untick a fee on the Members tab to start.</p>
            ) : (
              <div className="overflow-hidden border rounded-lg">
                <div className="grid grid-cols-[1fr_100px_80px_80px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Description</span>
                  <span>Account</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {filteredEntries.map((entry: any) => (
                    <div key={entry.id} className="grid grid-cols-[1fr_100px_80px_80px] gap-1 px-3 py-2 text-xs items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{entry.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                          {entry.club_member_id && ` · ${getMemberName(entry.club_member_id)}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] w-fit">
                        {ACCOUNT_LABELS[entry.account as GLAccount] || entry.account}
                        <span className="ml-1 opacity-50">{ACCOUNT_TYPE[entry.account as GLAccount]}</span>
                      </Badge>
                      <span className={cn("text-right tabular-nums", Number(entry.debit) > 0 && "text-destructive font-medium")}>
                        {Number(entry.debit) > 0 ? `R${Number(entry.debit).toFixed(2)}` : ""}
                      </span>
                      <span className={cn("text-right tabular-nums", Number(entry.credit) > 0 && "text-green-600 font-medium")}>
                        {Number(entry.credit) > 0 ? `R${Number(entry.credit).toFixed(2)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Pending Payments Tab */}
        <TabsContent value="pending">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="font-semibold text-sm">Pending EFT Payments</h3>
            </div>
            {pendingLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (pendingTransactions || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending payments.</p>
            ) : (
              <div className="space-y-2">
                {(pendingTransactions || []).map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm">{getMemberName(tx.club_member_id)}</div>
                      <div className="text-xs text-muted-foreground">
                        R{Number(tx.amount).toFixed(2)} via {tx.method?.toUpperCase() || "EFT"}
                        {tx.reference && <> · Ref: {tx.reference}</>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tx.description && <>{tx.description} · </>}
                        {format(new Date(tx.created_at), "dd MMM yyyy HH:mm")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleRejectPayment(tx.id)}>
                        <XCircle className="w-4 h-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => handleConfirmPayment(tx.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Trial Balance Tab */}
        <TabsContent value="trial">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Trial Balance</h3>
            </div>
            <div className="overflow-hidden border rounded-lg">
              <div className="grid grid-cols-[1fr_60px_90px_90px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Account</span>
                <span>Type</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
              </div>
              {(["debtors", "bank", "creditors", "fee_income"] as GLAccount[]).map((account) => {
                const bal = trialBalance[account];
                return (
                  <div key={account} className="grid grid-cols-[1fr_60px_90px_90px] gap-1 px-3 py-2.5 text-sm items-center border-b last:border-b-0">
                    <span className="font-medium">{ACCOUNT_LABELS[account]}</span>
                    <Badge variant="outline" className="text-[10px] w-fit">{ACCOUNT_TYPE[account]}</Badge>
                    <span className="text-right tabular-nums font-medium">R{bal.debit.toFixed(2)}</span>
                    <span className="text-right tabular-nums font-medium">R{bal.credit.toFixed(2)}</span>
                  </div>
                );
              })}
              {(() => {
                const totalDebit = Object.values(trialBalance).reduce((s: number, b: any) => s + (b.debit || 0), 0);
                const totalCredit = Object.values(trialBalance).reduce((s: number, b: any) => s + (b.credit || 0), 0);
                return (
                  <>
                    <div className="grid grid-cols-[1fr_60px_90px_90px] gap-1 px-3 py-2.5 text-sm items-center bg-muted/40 font-bold border-t-2">
                      <span>Total</span>
                      <span />
                      <span className="text-right tabular-nums">R{totalDebit.toFixed(2)}</span>
                      <span className="text-right tabular-nums">R{totalCredit.toFixed(2)}</span>
                    </div>
                  </>
                );
              })()}
            </div>
            {(() => {
              const totalDebit = Object.values(trialBalance).reduce((s: number, b: any) => s + (b.debit || 0), 0);
              const totalCredit = Object.values(trialBalance).reduce((s: number, b: any) => s + (b.credit || 0), 0);
              return (
                <p className="text-[10px] text-muted-foreground text-center">
                  {totalDebit.toFixed(2) === totalCredit.toFixed(2)
                    ? "✅ Trial balance is in balance"
                    : "⚠️ Trial balance is out of balance"}
                </p>
              );
            })()}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pay-Over Dialog */}
      <Dialog open={payOverOpen} onOpenChange={setPayOverOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Pay-Over</DialogTitle>
            <DialogDescription>
              Confirm that R{outstandingCreditors.toFixed(2)} has been paid to associations/federations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Card className="p-3 bg-muted/50 text-sm space-y-1">
              <p>This will create GL entries:</p>
              <p className="text-xs text-muted-foreground">• Debit Creditors R{outstandingCreditors.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">• Credit Bank R{outstandingCreditors.toFixed(2)}</p>
            </Card>
            <Button className="w-full" onClick={handlePayOver}>
              Confirm Pay-Over · R{outstandingCreditors.toFixed(2)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
