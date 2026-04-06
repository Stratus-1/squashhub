import { Club, useClubMembers } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { CheckCircle2, XCircle, Clock, Wallet, BookOpen, AlertTriangle, ArrowRightLeft, Plus, ListTree } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ─── Chart of Accounts definition ─── */

type GLAccount =
  | "debtors" | "creditors" | "bank" | "bank_current" | "cash"
  | "fee_income" | "bar_income" | "membership_income" | "league_fees_income" | "national_body_income"
  | "bar_expense" | "league_fees_expense" | "national_body_expense"
  | "maintenance" | "electricity" | "rent" | "bank_charges" | "gateway_fees" | "general_expense";

interface AccountMeta {
  label: string;
  type: "BS" | "IS";
  category: "Asset" | "Liability" | "Income" | "Expense";
  normal: "Dr" | "Cr"; // normal balance side
}

const CHART_OF_ACCOUNTS: Record<GLAccount, AccountMeta> = {
  // Balance Sheet – Assets
  bank:              { label: "Bank (Legacy)",       type: "BS", category: "Asset",     normal: "Dr" },
  bank_current:      { label: "Current Account",     type: "BS", category: "Asset",     normal: "Dr" },
  cash:              { label: "Cash / Petty Cash",   type: "BS", category: "Asset",     normal: "Dr" },
  debtors:           { label: "Accounts Receivable",  type: "BS", category: "Asset",     normal: "Dr" },
  // Balance Sheet – Liabilities
  creditors:         { label: "Accounts Payable",     type: "BS", category: "Liability", normal: "Cr" },
  // Income
  fee_income:        { label: "Fee Income",           type: "IS", category: "Income",    normal: "Cr" },
  membership_income: { label: "Membership Income",    type: "IS", category: "Income",    normal: "Cr" },
  bar_income:        { label: "Bar Sales Income",     type: "IS", category: "Income",    normal: "Cr" },
  league_fees_income:      { label: "League Fees Income",       type: "IS", category: "Income",  normal: "Cr" },
  national_body_income:    { label: "National Body Fees Income", type: "IS", category: "Income", normal: "Cr" },
  // Expenses
  bar_expense:             { label: "Bar Stock Purchases",       type: "IS", category: "Expense", normal: "Dr" },
  league_fees_expense:     { label: "League Fees Payouts",       type: "IS", category: "Expense", normal: "Dr" },
  national_body_expense:   { label: "National Body Fees Paid",   type: "IS", category: "Expense", normal: "Dr" },
  maintenance:             { label: "Maintenance",               type: "IS", category: "Expense", normal: "Dr" },
  electricity:             { label: "Electricity",               type: "IS", category: "Expense", normal: "Dr" },
  rent:                    { label: "Rent",                      type: "IS", category: "Expense", normal: "Dr" },
  bank_charges:            { label: "Bank Charges",              type: "IS", category: "Expense", normal: "Dr" },
  gateway_fees:            { label: "Payment Gateway Fees",      type: "IS", category: "Expense", normal: "Dr" },
  general_expense:         { label: "General Expenses",          type: "IS", category: "Expense", normal: "Dr" },
};

const ALL_ACCOUNTS = Object.keys(CHART_OF_ACCOUNTS) as GLAccount[];
const DEBIT_ACCOUNTS: GLAccount[] = ALL_ACCOUNTS.filter(a => CHART_OF_ACCOUNTS[a].category === "Asset" || CHART_OF_ACCOUNTS[a].category === "Expense");
const CREDIT_ACCOUNTS: GLAccount[] = ALL_ACCOUNTS.filter(a => CHART_OF_ACCOUNTS[a].category === "Liability" || CHART_OF_ACCOUNTS[a].category === "Income");

const GATEWAY_FEE_RATE = 0.035; // 3.5%

const getLabel = (account: string) => CHART_OF_ACCOUNTS[account as GLAccount]?.label || account;
const getMeta = (account: string) => CHART_OF_ACCOUNTS[account as GLAccount];

export function FinanceTab({ club, clubId }: { club: Club; clubId: string }) {
  const queryClient = useQueryClient();
  const { data: members } = useClubMembers(clubId);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [payOverOpen, setPayOverOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);

  // Manual transaction form state
  const [txDate, setTxDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [txDescription, setTxDescription] = useState("");
  const [txAmount, setTxAmount] = useState("");
  const [txDirection, setTxDirection] = useState<"income" | "expense">("expense");
  const [txAccount, setTxAccount] = useState<string>("");
  const [txMethod, setTxMethod] = useState<"bank" | "cash" | "card">("bank");
  const [txMemberId, setTxMemberId] = useState<string>("");
  const [txSubmitting, setTxSubmitting] = useState(false);

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
  type TrialBal = Record<string, BalEntry>;

  // Calculate trial balance from ALL journal entries
  const trialBalance: TrialBal = (journalEntries || []).reduce(
    (acc: TrialBal, entry: any) => {
      const account = entry.account as string;
      if (!acc[account]) acc[account] = { debit: 0, credit: 0 };
      acc[account].debit += Number(entry.debit);
      acc[account].credit += Number(entry.credit);
      return acc;
    },
    {}
  );

  // Convenience helpers
  const getBalance = (account: string) => {
    const b = trialBalance[account] || { debit: 0, credit: 0 };
    const meta = getMeta(account);
    if (!meta) return b.debit - b.credit;
    return meta.normal === "Dr" ? b.debit - b.credit : b.credit - b.debit;
  };

  const totalIncome = ALL_ACCOUNTS.filter(a => CHART_OF_ACCOUNTS[a].category === "Income").reduce((s, a) => s + getBalance(a), 0);
  const totalExpenses = ALL_ACCOUNTS.filter(a => CHART_OF_ACCOUNTS[a].category === "Expense").reduce((s, a) => s + getBalance(a), 0);
  const bankBalance = getBalance("bank") + getBalance("bank_current");
  const cashBalance = getBalance("cash");

  const filteredEntries = accountFilter === "all"
    ? (journalEntries || [])
    : (journalEntries || []).filter((e: any) => e.account === accountFilter);

  /* ─── Confirm EFT payment ─── */
  const handleConfirmPayment = async (txId: string) => {
    try {
      const tx = (pendingTransactions || []).find((t: any) => t.id === txId);
      if (!tx) return;

      const { error } = await fromExt("member_credit_transactions")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", txId);
      if (error) throw error;

      // Cash-basis: Payment received → Debit Bank, Credit Membership Income
      const journalRef = crypto.randomUUID();
      const memberName = getMemberName(tx.club_member_id);
      const desc = `Payment received: ${tx.description || "EFT"} — ${memberName}`;

      await fromExt("club_journal_entries").insert([
        { club_id: clubId, journal_ref: journalRef, account: "bank_current", debit: Math.abs(Number(tx.amount)), credit: 0, description: desc, club_member_id: tx.club_member_id, transaction_id: txId },
        { club_id: clubId, journal_ref: journalRef, account: "membership_income", debit: 0, credit: Math.abs(Number(tx.amount)), description: desc, club_member_id: tx.club_member_id, transaction_id: txId },
      ]);

      if (tx.type === "debit" && tx.club_member_id) {
        const { data: unpaidFees } = await fromExt("club_member_fee_payments")
          .select("id, fee_label")
          .eq("club_member_id", tx.club_member_id)
          .eq("paid", false);
        const descStr = (tx.description || "") as string;
        const feesToMark = (unpaidFees || []).filter((f: any) => descStr.includes(f.fee_label));
        for (const fee of feesToMark) {
          await fromExt("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", fee.id);
        }
        queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      }

      toast.success("Payment confirmed & recorded as income");
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

  /* ─── Manual transaction entry ─── */
  const handleRecordTransaction = async () => {
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (!txAccount) { toast.error("Select an account"); return; }
    if (!txDescription.trim()) { toast.error("Enter a description"); return; }

    // Determine the money account based on payment method
    const moneyAccount = txMethod === "cash" ? "cash" : "bank_current";

    // Income: Debit money account, Credit the selected income account
    // Expense: Debit the selected expense account, Credit money account
    const debitAccount = txDirection === "income" ? moneyAccount : txAccount;
    const creditAccount = txDirection === "income" ? txAccount : moneyAccount;

    setTxSubmitting(true);
    try {
      const memberId = (txMemberId && txMemberId !== "__none__") ? txMemberId : null;
      const journalRef = crypto.randomUUID();
      const entries: any[] = [
        { club_id: clubId, journal_ref: journalRef, account: debitAccount, debit: amount, credit: 0, description: txDescription.trim(), club_member_id: memberId, created_at: new Date(txDate).toISOString() },
        { club_id: clubId, journal_ref: journalRef, account: creditAccount, debit: 0, credit: amount, description: txDescription.trim(), club_member_id: memberId, created_at: new Date(txDate).toISOString() },
      ];

      // Auto-charge 3.5% gateway fee for card payments
      if (txMethod === "card" && amount > 0) {
        const gatewayFee = Math.round(amount * GATEWAY_FEE_RATE * 100) / 100;
        const feeRef = crypto.randomUUID();
        entries.push(
          { club_id: clubId, journal_ref: feeRef, account: "gateway_fees", debit: gatewayFee, credit: 0, description: `Gateway fee (3.5%) on card payment: ${txDescription.trim()}`, created_at: new Date(txDate).toISOString() },
          { club_id: clubId, journal_ref: feeRef, account: "bank_current", debit: 0, credit: gatewayFee, description: `Gateway fee (3.5%) on card payment: ${txDescription.trim()}`, created_at: new Date(txDate).toISOString() },
        );
      }

      const { error } = await fromExt("club_journal_entries").insert(entries);
      if (error) throw error;

      toast.success("Transaction recorded");
      setTxOpen(false);
      setTxDescription("");
      setTxAmount("");
      setTxAccount("");
      setTxMemberId("");
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to record");
    } finally {
      setTxSubmitting(false);
    }
  };

  /* ─── Accounts grouped by category for Chart of Accounts display ─── */
  const accountsByCategory = (["Asset", "Liability", "Income", "Expense"] as const).map(cat => ({
    category: cat,
    accounts: ALL_ACCOUNTS.filter(a => CHART_OF_ACCOUNTS[a].category === cat),
  }));

  const categoryColor: Record<string, string> = {
    Asset: "text-blue-600",
    Liability: "text-amber-600",
    Income: "text-green-600",
    Expense: "text-destructive",
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total Income</p>
          <p className="text-xl font-bold tabular-nums text-green-600">
            R{totalIncome.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Revenue received</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Total Expenses</p>
          <p className={cn("text-xl font-bold tabular-nums", totalExpenses > 0 ? "text-destructive" : "text-muted-foreground")}>
            R{totalExpenses.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Costs paid</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Bank</p>
          <p className={cn("text-xl font-bold tabular-nums", bankBalance >= 0 ? "text-green-600" : "text-destructive")}>
            R{bankBalance.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Current account</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Cash</p>
          <p className={cn("text-xl font-bold tabular-nums", cashBalance >= 0 ? "text-green-600" : "text-destructive")}>
            R{cashBalance.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">Petty cash</p>
        </Card>
      </div>

      <Tabs defaultValue="journal" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="journal" className="text-xs">Journal</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">
            Pending
            {(pendingTransactions || []).length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">{(pendingTransactions || []).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trial" className="text-xs">Trial Balance</TabsTrigger>
          <TabsTrigger value="coa" className="text-xs">Chart of Accounts</TabsTrigger>
        </TabsList>

        {/* Journal Tab */}
        <TabsContent value="journal">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">General Journal</h3>
              </div>
              <div className="flex items-center gap-2">
                <Select value={accountFilter} onValueChange={setAccountFilter}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Filter account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {ALL_ACCOUNTS.map(a => (
                      <SelectItem key={a} value={a}>{CHART_OF_ACCOUNTS[a].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={() => setTxOpen(true)} className="gap-1.5 h-8">
                  <Plus className="w-3.5 h-3.5" /> Enter Transaction
                </Button>
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No journal entries yet.</p>
            ) : (
              <div className="overflow-hidden border rounded-lg">
                <div className="grid grid-cols-[1fr_120px_80px_80px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Description</span>
                  <span>Account</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {filteredEntries.map((entry: any) => (
                    <div key={entry.id} className="grid grid-cols-[1fr_120px_80px_80px] gap-1 px-3 py-2 text-xs items-center">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{entry.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                          {entry.club_member_id && ` · ${getMemberName(entry.club_member_id)}`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] w-fit">
                        {getLabel(entry.account)}
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
              <div className="grid grid-cols-[1fr_80px_90px_90px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Account</span>
                <span>Category</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
              </div>
              {ALL_ACCOUNTS.filter(a => {
                const b = trialBalance[a];
                return b && (b.debit > 0 || b.credit > 0);
              }).map(account => {
                const bal = trialBalance[account] || { debit: 0, credit: 0 };
                const meta = CHART_OF_ACCOUNTS[account];
                return (
                  <div key={account} className="grid grid-cols-[1fr_80px_90px_90px] gap-1 px-3 py-2.5 text-sm items-center border-b last:border-b-0">
                    <span className="font-medium text-xs">{meta.label}</span>
                    <Badge variant="outline" className={cn("text-[10px] w-fit", categoryColor[meta.category])}>
                      {meta.category}
                    </Badge>
                    <span className="text-right tabular-nums font-medium text-xs">R{bal.debit.toFixed(2)}</span>
                    <span className="text-right tabular-nums font-medium text-xs">R{bal.credit.toFixed(2)}</span>
                  </div>
                );
              })}
              {(() => {
                const totalDebit = Object.values(trialBalance).reduce((s: number, b: any) => s + (b.debit || 0), 0);
                const totalCredit = Object.values(trialBalance).reduce((s: number, b: any) => s + (b.credit || 0), 0);
                return (
                  <div className="grid grid-cols-[1fr_80px_90px_90px] gap-1 px-3 py-2.5 text-sm items-center bg-muted/40 font-bold border-t-2">
                    <span>Total</span>
                    <span />
                    <span className="text-right tabular-nums">R{totalDebit.toFixed(2)}</span>
                    <span className="text-right tabular-nums">R{totalCredit.toFixed(2)}</span>
                  </div>
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

        {/* Chart of Accounts Tab */}
        <TabsContent value="coa">
          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <ListTree className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">Chart of Accounts</h3>
            </div>
            {accountsByCategory.map(({ category, accounts }) => (
              <div key={category}>
                <h4 className={cn("text-xs font-bold uppercase tracking-wider mb-2", categoryColor[category])}>{category}</h4>
                <div className="border rounded-lg overflow-hidden mb-3">
                  <div className="grid grid-cols-[1fr_60px_70px_90px] gap-1 px-3 py-1.5 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Account</span>
                    <span>Type</span>
                    <span>Normal</span>
                    <span className="text-right">Balance</span>
                  </div>
                  {accounts.map(account => {
                    const meta = CHART_OF_ACCOUNTS[account];
                    const balance = getBalance(account);
                    return (
                      <div key={account} className="grid grid-cols-[1fr_60px_70px_90px] gap-1 px-3 py-2 text-xs items-center border-b last:border-b-0">
                        <span className="font-medium">{meta.label}</span>
                        <Badge variant="outline" className="text-[10px] w-fit">{meta.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{meta.normal}</span>
                        <span className={cn("text-right tabular-nums font-medium",
                          balance > 0 ? (meta.category === "Expense" ? "text-destructive" : "text-green-600") :
                          balance < 0 ? "text-destructive" : "text-muted-foreground"
                        )}>
                          R{Math.abs(balance).toFixed(2)}
                          {balance < 0 ? " Cr" : balance > 0 ? " Dr" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pay-Over Dialog */}
      <Dialog open={payOverOpen} onOpenChange={setPayOverOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Pay-Over</DialogTitle>
            <DialogDescription>
              Confirm that R{outstandingCreditors.toFixed(2)} has been paid to associations/suppliers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Card className="p-3 bg-muted/50 text-sm space-y-1">
              <p>This will create GL entries:</p>
              <p className="text-xs text-muted-foreground">• Debit Creditors R{outstandingCreditors.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">• Credit Current Account R{outstandingCreditors.toFixed(2)}</p>
            </Card>
            <Button className="w-full" onClick={handlePayOver}>
              Confirm Pay-Over · R{outstandingCreditors.toFixed(2)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enter Transaction Dialog */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Transaction</DialogTitle>
            <DialogDescription>
              Record a payment. The system automatically posts the correct double entry based on your selections. Card payments incur a 3.5% gateway fee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Income or Expense */}
            <div>
              <Label className="text-xs">Transaction Type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button
                  type="button"
                  variant={txDirection === "income" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => { setTxDirection("income"); setTxAccount(""); }}
                >
                  💰 Income (Money In)
                </Button>
                <Button
                  type="button"
                  variant={txDirection === "expense" ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => { setTxDirection("expense"); setTxAccount(""); }}
                >
                  💸 Expense (Money Out)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Paid via</Label>
                <Select value={txMethod} onValueChange={v => setTxMethod(v as any)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank / EFT</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Amount (R)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={txAmount} onChange={e => setTxAmount(e.target.value)} className="h-9 text-xs" />
              {txMethod === "card" && txAmount && parseFloat(txAmount) > 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  + R{(parseFloat(txAmount) * GATEWAY_FEE_RATE).toFixed(2)} gateway fee (3.5%) will be auto-charged
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">{txDirection === "income" ? "Income Account" : "Expense Account"}</Label>
              <Select value={txAccount} onValueChange={setTxAccount}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent>
                  {(txDirection === "income" ? CREDIT_ACCOUNTS : DEBIT_ACCOUNTS)
                    .filter(a => !["bank", "bank_current", "cash", "debtors"].includes(a))
                    .map(a => (
                      <SelectItem key={a} value={a}>{CHART_OF_ACCOUNTS[a].label}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {txAccount && txAmount && parseFloat(txAmount) > 0 && (
                <div className="mt-2 p-2 rounded bg-muted/60 text-[10px] text-muted-foreground space-y-0.5">
                  <p className="font-semibold text-foreground text-xs">GL Preview:</p>
                  {txDirection === "income" ? (
                    <>
                      <p>• Debit {txMethod === "cash" ? "Cash" : "Current Account"} R{parseFloat(txAmount).toFixed(2)}</p>
                      <p>• Credit {getLabel(txAccount)} R{parseFloat(txAmount).toFixed(2)}</p>
                    </>
                  ) : (
                    <>
                      <p>• Debit {getLabel(txAccount)} R{parseFloat(txAmount).toFixed(2)}</p>
                      <p>• Credit {txMethod === "cash" ? "Cash" : "Current Account"} R{parseFloat(txAmount).toFixed(2)}</p>
                    </>
                  )}
                  {txMethod === "card" && (
                    <>
                      <p>• Debit Gateway Fees R{(parseFloat(txAmount) * GATEWAY_FEE_RATE).toFixed(2)}</p>
                      <p>• Credit Current Account R{(parseFloat(txAmount) * GATEWAY_FEE_RATE).toFixed(2)}</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Textarea placeholder="e.g. Monthly rent payment" value={txDescription} onChange={e => setTxDescription(e.target.value)} className="text-xs min-h-[60px]" />
            </div>

            <div>
              <Label className="text-xs">Member (optional)</Label>
              <Select value={txMemberId} onValueChange={setTxMemberId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {(members || []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name || m.profiles?.name || m.email || "Unnamed"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={handleRecordTransaction} disabled={txSubmitting}>
              {txSubmitting ? "Recording..." : "Record Transaction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
