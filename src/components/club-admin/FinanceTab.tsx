import { Club, useClubMembers } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt, rpcExt } from "@/lib/supabase-ext";
import { postJournal } from "@/lib/post-journal";
import { CheckCircle2, XCircle, Clock, Wallet, BookOpen, Plus, ListTree, Send, AlertTriangle, Trash2, Undo2, Receipt, MoreHorizontal, Search, ArrowLeft, CalendarDays, FileText, Layers, BarChart3, ChevronRight, Building2, Banknote } from "lucide-react";
import { format } from "date-fns";
import { useState, useRef, useEffect, type ReactNode, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

import { AssociationPayablesPanel } from "./AssociationPayablesPanel";
import { RenewalInvoicesTab } from "./RenewalInvoicesTab";
import { ReconcileFeesDialog } from "./ReconcileFeesDialog";
import { LedgerReconciliationDialog } from "./LedgerReconciliationDialog";
import { IncomeStatementTab } from "./IncomeStatementTab";
import { OpeningBalancesDialog } from "./OpeningBalancesDialog";
import DebitOrdersPanel from "./DebitOrdersPanel";

/* ─── Chart of Accounts definition ─── */

type GLAccount =
  | "debtors" | "creditors" | "bank_current" | "cash"
  | "opening_balance_equity" | "member_credits" | "association_payable"
  | "fee_income" | "bar_income" | "membership_income" | "league_fees_income" | "national_body_income" | "tournament_income" | "light_fees_income"
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
  bank_current:      { label: "Current Account",     type: "BS", category: "Asset",     normal: "Dr" },
  cash:              { label: "Petty Cash",          type: "BS", category: "Asset",     normal: "Dr" },
  debtors:           { label: "Accounts Receivable", type: "BS", category: "Asset",     normal: "Dr" },
  // Balance Sheet – Liabilities / Equity
  creditors:         { label: "Accounts Payable",     type: "BS", category: "Liability", normal: "Cr" },
  member_credits:    { label: "Member Credits",       type: "BS", category: "Liability", normal: "Cr" },
  association_payable: { label: "Association Payable", type: "BS", category: "Liability", normal: "Cr" },
  opening_balance_equity: { label: "Opening Balance Equity", type: "BS", category: "Liability", normal: "Cr" },
  // Income
  fee_income:        { label: "Fee Income",           type: "IS", category: "Income",    normal: "Cr" },
  membership_income: { label: "Membership Income",    type: "IS", category: "Income",    normal: "Cr" },
  bar_income:        { label: "Bar Sales Income",     type: "IS", category: "Income",    normal: "Cr" },
  league_fees_income:      { label: "League Fees Income",       type: "IS", category: "Income",  normal: "Cr" },
  national_body_income:    { label: "National Body Fees Income", type: "IS", category: "Income", normal: "Cr" },
  tournament_income:       { label: "Tournament Income",         type: "IS", category: "Income", normal: "Cr" },
  light_fees_income:       { label: "Light Fees Income",          type: "IS", category: "Income", normal: "Cr" },
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

// Fee options in the "Bill a Member" dialog are loaded from the actual
// Fees tables (member_fee_categories, league_associations, national_body_fees)
// so admins pick a real fee — the amount is pre-filled but editable.
// Honesty bar charges are handled in the Bar module, not here.
type BillFeeOption = {
  key: string;
  group: "Membership" | "League" | "National body";
  label: string;
  amount: number;
  income: GLAccount;
};

const getLabel = (account: string) => CHART_OF_ACCOUNTS[account as GLAccount]?.label || account;
const getMeta = (account: string) => CHART_OF_ACCOUNTS[account as GLAccount];

export function FinanceTab({ club, clubId }: { club: Club; clubId: string }) {
  const queryClient = useQueryClient();
  const { data: members } = useClubMembers(clubId);
  const [accountFilter, setAccountFilter] = useState<string>("all");
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
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [ledgerReconOpen, setLedgerReconOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [openingBalancesOpen, setOpeningBalancesOpen] = useState(false);
  const [statementMemberId, setStatementMemberId] = useState<string>("");
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementSearch, setStatementSearch] = useState("");
  const [balancesOpen, setBalancesOpen] = useState(false);
  const [balancesFilter, setBalancesFilter] = useState<"outstanding" | "credit" | "all">("outstanding");
  const [balancesSearch, setBalancesSearch] = useState("");

  // Member searchable dropdowns (shared pattern for statement, tx, bill)
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
  const memberSearchRef = useRef<HTMLDivElement>(null);

  const [txMemberSearch, setTxMemberSearch] = useState("");
  const [txMemberDropdownOpen, setTxMemberDropdownOpen] = useState(false);
  const txMemberSearchRef = useRef<HTMLDivElement>(null);

  const [billMemberSearch, setBillMemberSearch] = useState("");
  const [billMemberDropdownOpen, setBillMemberDropdownOpen] = useState(false);
  const billMemberSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (memberSearchRef.current && !memberSearchRef.current.contains(target)) {
        setMemberDropdownOpen(false);
      }
      if (txMemberSearchRef.current && !txMemberSearchRef.current.contains(target)) {
        setTxMemberDropdownOpen(false);
      }
      if (billMemberSearchRef.current && !billMemberSearchRef.current.contains(target)) {
        setBillMemberDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Bill Member dialog
  const [billOpen, setBillOpen] = useState(false);
  const [billMemberId, setBillMemberId] = useState<string>("");
  const [billAmount, setBillAmount] = useState("");
  const [billLabel, setBillLabel] = useState("");
  const [billIncome, setBillIncome] = useState<string>("membership_income");
  const [billFeeTypeKey, setBillFeeTypeKey] = useState<string>("");
  const [billDate, setBillDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [billSubmitting, setBillSubmitting] = useState(false);

  // Row-action confirm dialog (delete/reverse)
  const [rowAction, setRowAction] = useState<null | { ref: string; mode: "delete" | "reverse"; summary: string }>(null);
  const [rowActionBusy, setRowActionBusy] = useState(false);

  /* ─── Fee options for the Bill Member dialog (from Fees tables) ─── */
  const { data: billFeeOptions = [] } = useQuery({
    queryKey: ["bill-fee-options", clubId],
    queryFn: async (): Promise<BillFeeOption[]> => {
      const [cats, leagues, nationals] = await Promise.all([
        fromExt("member_fee_categories")
          .select("id,name,annual_fee,active")
          .eq("club_id", clubId).eq("active", true).order("sort_order"),
        fromExt("league_associations")
          .select("id,name,abbreviation,fee_annual,active")
          .eq("club_id", clubId).eq("active", true).order("name"),
        fromExt("national_body_fees")
          .select("id,body_name,abbreviation,fee_annual,active")
          .eq("club_id", clubId).eq("active", true).order("body_name"),
      ]);
      const opts: BillFeeOption[] = [];
      (cats.data || []).forEach((c: any) => opts.push({
        key: `cat:${c.id}`, group: "Membership",
        label: c.name, amount: Number(c.annual_fee) || 0,
        income: "membership_income" as GLAccount,
      }));
      (leagues.data || []).forEach((l: any) => opts.push({
        key: `lea:${l.id}`, group: "League",
        label: l.abbreviation ? `${l.name} (${l.abbreviation})` : l.name,
        amount: Number(l.fee_annual) || 0,
        income: "league_fees_income" as GLAccount,
      }));
      (nationals.data || []).forEach((n: any) => opts.push({
        key: `nat:${n.id}`, group: "National body",
        label: n.abbreviation ? `${n.body_name} (${n.abbreviation})` : n.body_name,
        amount: Number(n.fee_annual) || 0,
        income: "national_body_income" as GLAccount,
      }));
      return opts;
    },
    enabled: !!clubId,
  });



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
  const bankBalance = getBalance("bank_current");
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

      // Mark linked unpaid fees as paid — the journal_fee_payment_received trigger
      // will automatically post Dr Bank / Cr Debtors for each fee.
      let postedFromFees = false;
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
          postedFromFees = true;
        }
        queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      }

      // Fallback: if no fee rows could be matched (e.g. ad-hoc top-ups, light fees),
      // still record the cash receipt directly so the bank balance reflects it.
      if (!postedFromFees) {
        const memberName = getMemberName(tx.club_member_id);
        const desc = `Payment received: ${tx.description || "EFT"} — ${memberName}`;
        const amt = Math.abs(Number(tx.amount));
        await postJournal(clubId, [
          { account: "bank_current", debit: amt, description: desc, member_id: tx.club_member_id },
          { account: "member_credits", credit: amt, description: desc, member_id: tx.club_member_id },
        ]);
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
    const memberLinked = !!(txMemberId && txMemberId !== "__none__");
    // When a member is linked on an income transaction, force Accounts Receivable
    // (debtors) so the payment settles their outstanding bill instead of double-
    // counting income.
    const effectiveTxAccount = (txDirection === "income" && memberLinked) ? "debtors" : txAccount;
    if (!effectiveTxAccount) { toast.error("Select an account"); return; }
    if (!txDescription.trim()) { toast.error("Enter a description"); return; }

    // Determine the money account based on payment method
    const moneyAccount = txMethod === "cash" ? "cash" : "bank_current";

    // Income: Debit money account, Credit the selected income account
    // Expense: Debit the selected expense account, Credit money account
    const debitAccount = txDirection === "income" ? moneyAccount : effectiveTxAccount;
    const creditAccount = txDirection === "income" ? effectiveTxAccount : moneyAccount;

    setTxSubmitting(true);
    try {
      const memberId = (txMemberId && txMemberId !== "__none__") ? txMemberId : null;
      const desc = txDescription.trim();
      const lines: any[] = [
        { account: debitAccount, debit: amount, description: desc, member_id: memberId },
        { account: creditAccount, credit: amount, description: desc, member_id: memberId },
      ];
      await postJournal(clubId, lines, { description: desc });

      // Auto-charge 3.5% gateway fee for card payments
      if (txMethod === "card" && amount > 0) {
        const gatewayFee = Math.round(amount * GATEWAY_FEE_RATE * 100) / 100;
        await postJournal(clubId, [
          { account: "gateway_fees", debit: gatewayFee, description: `Gateway fee (3.5%) on card payment: ${desc}` },
          { account: "bank_current", credit: gatewayFee, description: `Gateway fee (3.5%) on card payment: ${desc}` },
        ]);
      }

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

  /* ─── Bill a member (creates Dr Debtors / Cr Income + fee row) ─── */
  const handleBillMember = async () => {
    const amount = parseFloat(billAmount);
    if (!billMemberId) return toast.error("Select a member");
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");
    if (!billLabel.trim()) return toast.error("Enter a fee description");
    setBillSubmitting(true);
    try {
      const { error } = await rpcExt("admin_bill_member_fee", {
        _club_member_id: billMemberId,
        _amount: amount,
        _fee_label: billLabel.trim(),
        _income_account: billIncome,
        _fee_type: "club",
        _date: new Date(billDate).toISOString(),
      });
      if (error) throw error;
      toast.success("Member billed");
      setBillOpen(false);
      setBillAmount(""); setBillLabel("");
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to bill member");
    } finally {
      setBillSubmitting(false);
    }
  };

  /* ─── Per-row Delete / Reverse a journal group (both legs together) ─── */
  const journalRefSummary = (ref: string): string => {
    const legs = (journalEntries || []).filter((e: any) => e.journal_ref === ref);
    if (legs.length === 0) return "";
    return legs.map((l: any) =>
      `${Number(l.debit) > 0 ? "Dr" : "Cr"} ${getLabel(l.account)} R${(Number(l.debit) || Number(l.credit)).toFixed(2)}`
    ).join("  ·  ");
  };

  const confirmRowAction = async () => {
    if (!rowAction) return;
    setRowActionBusy(true);
    try {
      const fn = rowAction.mode === "delete" ? "admin_delete_journal_group" : "admin_reverse_journal_group";
      const { error } = await rpcExt(fn, { _journal_ref: rowAction.ref, _note: null });
      if (error) throw error;
      toast.success(rowAction.mode === "delete" ? "Entry deleted" : "Reversal posted");
      setRowAction(null);
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setRowActionBusy(false);
    }
  };

  /* Action menu reused on journal & statement rows */
  const RowActionMenu = ({ entry }: { entry: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={() => setRowAction({ ref: entry.journal_ref, mode: "reverse", summary: journalRefSummary(entry.journal_ref) })}
        >
          <Undo2 className="w-3.5 h-3.5 mr-2" /> Reverse entry
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => setRowAction({ ref: entry.journal_ref, mode: "delete", summary: journalRefSummary(entry.journal_ref) })}
        >
          <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete entry
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );



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

  /**
   * Resync the GL from the current paid/unpaid state of every member fee.
   * Wipes prior auto-generated fee entries (rows with a fee_payment_id) and
   * rebuilds them using the same gross-up rules as MembersTab.
   */
  const handleResyncFeesGL = async () => {
    if (!confirm("Recalculate the general ledger from the current state of all member fees? Manual transactions are preserved.")) return;
    try {
      const { data: clubMemberRows, error: cmErr } = await fromExt("club_members")
        .select("id")
        .eq("club_id", clubId);
      if (cmErr) throw cmErr;
      const memberIds = (clubMemberRows || []).map((r: any) => r.id);
      if (memberIds.length === 0) {
        toast.info("No members found for this club");
        return;
      }
      const { data: fees, error: feeErr } = await fromExt("club_member_fee_payments")
        .select("id, club_member_id, fee_type, fee_label, amount, paid")
        .in("club_member_id", memberIds);
      if (feeErr) throw feeErr;

      const { error: delErr } = await fromExt("club_journal_entries")
        .delete()
        .eq("club_id", clubId)
        .not("fee_payment_id", "is", null);
      if (delErr) throw delErr;

      const accountsForFee = (feeType: string) => {
        switch (feeType) {
          case "club":
          case "membership":            return { side: "receivable" as const, income: "membership_income" };
          case "association":
          case "league_affiliation":    return { side: "receivable" as const, income: "league_fees_income" };
          case "national":
          case "national_body":         return { side: "receivable" as const, income: "national_body_income" };
          case "club_payable_assoc":    return { side: "payable" as const, expense: "association_payable" };
          case "club_payable_national": return { side: "payable" as const, expense: "association_payable" };
          default:                      return { side: "receivable" as const, income: "fee_income" };
        }
      };

      const memberName = (id: string) => {
        const m = (members as any[] | undefined)?.find(mm => mm.id === id);
        return m?.name || m?.profiles?.name || "Member";
      };

      let posted = 0;
      for (const f of fees || []) {
        if (!f.amount || f.amount <= 0) continue;
        const acct = accountsForFee(f.fee_type);
        const desc = `${f.paid ? "Fee paid" : "Fee accrued"}: ${f.fee_label} — ${memberName(f.club_member_id)}`;
        const meta = { description: desc, member_id: f.club_member_id, payment_id: f.id };
        if (acct.side === "receivable") {
          const debit = f.paid ? "bank_current" : "debtors";
          await postJournal(clubId, [
            { account: debit, debit: f.amount, ...meta },
            { account: acct.income!, credit: f.amount, ...meta },
          ]);
        } else {
          const credit = f.paid ? "bank_current" : "creditors";
          await postJournal(clubId, [
            { account: acct.expense!, debit: f.amount, ...meta },
            { account: credit, credit: f.amount, ...meta },
          ]);
        }
        posted += 2;
      }

      toast.success(`Resynced ${(fees || []).length} fees → ${posted} ledger entries`);
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries", clubId] });
    } catch (e: any) {
      toast.error(e.message || "Resync failed");
    }
  };

  /* ─── Reset all club finances (clean-slate onboarding) ─── */
  const handleResetFinances = async () => {
    if (resetConfirmText.trim() !== "RESET") {
      toast.error('Type RESET to confirm');
      return;
    }
    setResetSubmitting(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data, error } = await (supabase as any).rpc("reset_club_finances", { p_club_id: clubId });
      if (error) throw error;
      const r = (data || {}) as any;
      toast.success(
        `Finances reset · ${r.journal_entries_deleted ?? 0} GL entries, ${r.transactions_deleted ?? 0} payments, ${r.fee_payments_deleted ?? 0} fee rows removed`
      );
      setResetOpen(false);
      setResetConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["club-journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["pending-member-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      queryClient.invalidateQueries({ queryKey: ["income-statement"] });
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setResetSubmitting(false);
    }
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

      <FinanceHub
        pendingCount={(pendingTransactions || []).length}
        onStatement={() => setStatementOpen(true)}
        onBalances={(filter) => { setBalancesFilter(filter); setBalancesSearch(""); setBalancesOpen(true); }}
        onBill={() => { setBillMemberId(""); setBillMemberSearch(""); setBillOpen(true); }}
        onEnterTx={() => { setTxMemberSearch(""); setTxMemberId(""); setTxOpen(true); }}
      >
        {(view, setView) => (
          <Tabs value={view} onValueChange={setView} className="w-full mt-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <Button size="sm" variant="ghost" onClick={() => setView("")} className="gap-1.5 h-8 -ml-2">
                <ArrowLeft className="w-4 h-4" /> Back to Finance
              </Button>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => setStatementOpen(true)} className="gap-1.5 h-8">
                  <BookOpen className="w-3.5 h-3.5" /> Member Statement
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5 h-8">
                      <Wallet className="w-3.5 h-3.5" /> Member Balances
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setBalancesFilter("outstanding"); setBalancesSearch(""); setBalancesOpen(true); }}>
                      Outstanding (owes club)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setBalancesFilter("credit"); setBalancesSearch(""); setBalancesOpen(true); }}>
                      In Credit (overpaid)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setBalancesFilter("all"); setBalancesSearch(""); setBalancesOpen(true); }}>
                      All members
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="outline" onClick={() => { setBillMemberId(""); setBillMemberSearch(""); setBillOpen(true); }} className="gap-1.5 h-8">
                  <Receipt className="w-3.5 h-3.5" /> Bill Member
                </Button>
                <Button size="sm" onClick={() => { setTxMemberSearch(""); setTxMemberId(""); setTxOpen(true); }} className="gap-1.5 h-8">
                  <Plus className="w-3.5 h-3.5" /> Enter Transaction
                </Button>
              </div>
            </div>



        <TabsContent value="association-payables">
          <AssociationPayablesPanel clubId={clubId} />
        </TabsContent>

        <TabsContent value="renewals">
          <RenewalInvoicesTab clubId={clubId} />
        </TabsContent>

        <TabsContent value="debit-orders">
          <DebitOrdersPanel clubId={clubId} />
        </TabsContent>

        <TabsContent value="income">
          <IncomeStatementTab clubId={clubId} clubName={club?.name} accounts={CHART_OF_ACCOUNTS as any} />
        </TabsContent>

        {/* Journal Tab — all entries, unfiltered */}
        <TabsContent value="journal">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">All GL Entries</h3>
                <Badge variant="outline" className="text-[10px]">{(journalEntries || []).length} entries</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setReconcileOpen(true)} className="gap-1.5 h-8">
                  <Wallet className="w-3.5 h-3.5" /> Reconcile Fees
                </Button>
                <Button size="sm" variant="outline" onClick={() => setLedgerReconOpen(true)} className="gap-1.5 h-8">
                  <Wallet className="w-3.5 h-3.5" /> GL vs Member a/c
                </Button>
                <LedgerReconciliationDialog clubId={clubId} open={ledgerReconOpen} onOpenChange={setLedgerReconOpen} />
                <Button size="sm" variant="outline" onClick={handleResyncFeesGL} className="gap-1.5 h-8">
                  <ListTree className="w-3.5 h-3.5" /> Resync Fees
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpeningBalancesOpen(true)} className="gap-1.5 h-8">
                  <BookOpen className="w-3.5 h-3.5" /> Opening Balances
                </Button>
                <OpeningBalancesDialog
                  open={openingBalancesOpen}
                  onOpenChange={setOpeningBalancesOpen}
                  clubId={clubId}
                  accounts={CHART_OF_ACCOUNTS as any}
                />
                <Button size="sm" variant="outline" onClick={() => setResetOpen(true)} className="gap-1.5 h-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" /> Reset Finances
                </Button>
                <Button size="sm" onClick={() => { setTxMemberSearch(""); setTxMemberId(""); setTxOpen(true); }} className="gap-1.5 h-8">
                  <Plus className="w-3.5 h-3.5" /> Enter Transaction
                </Button>
                <ReconcileFeesDialog clubId={clubId} open={reconcileOpen} onOpenChange={setReconcileOpen} />
              </div>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (journalEntries || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No journal entries yet.</p>
            ) : (
              <div className="overflow-hidden border rounded-lg">
                <div className="grid grid-cols-[1fr_120px_80px_80px_32px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Description</span>
                  <span>Account</span>
                  <span className="text-right">Debit</span>
                  <span className="text-right">Credit</span>
                  <span />
                </div>
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {(journalEntries || []).map((entry: any) => (
                    <div key={entry.id} className="grid grid-cols-[1fr_120px_80px_80px_32px] gap-1 px-3 py-2 text-xs items-center">
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
                      <RowActionMenu entry={entry} />
                    </div>
                  ))}
                </div>

              </div>
            )}
          </Card>
        </TabsContent>

        {/* By Account Tab — filter dropdown */}
        <TabsContent value="by-account">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ListTree className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Transactions by Account</h3>
              </div>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="w-[240px] h-8 text-xs">
                  <SelectValue placeholder="Select an account…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {(["Income", "Expense", "Asset", "Liability"] as const).map(cat => {
                    const accts = ALL_ACCOUNTS.filter(a => CHART_OF_ACCOUNTS[a].category === cat);
                    if (accts.length === 0) return null;
                    return (
                      <SelectGroup key={cat}>
                        <SelectLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</SelectLabel>
                        {accts.map(a => (
                          <SelectItem key={a} value={a}>{CHART_OF_ACCOUNTS[a].label}</SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}

                </SelectContent>
              </Select>
            </div>

            {accountFilter === "all" ? (
              <p className="text-sm text-muted-foreground">Select an account above to view its transactions.</p>
            ) : filteredEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transactions for <strong>{getLabel(accountFilter)}</strong>.</p>
            ) : (() => {
              const totalDebit = filteredEntries.reduce((s: number, e: any) => s + Number(e.debit || 0), 0);
              const totalCredit = filteredEntries.reduce((s: number, e: any) => s + Number(e.credit || 0), 0);
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Card className="p-2"><p className="text-[10px] text-muted-foreground">Account</p><p className="text-sm font-semibold">{getLabel(accountFilter)}</p></Card>
                    <Card className="p-2"><p className="text-[10px] text-muted-foreground">Total Debit</p><p className="text-sm font-semibold text-destructive tabular-nums">R{totalDebit.toFixed(2)}</p></Card>
                    <Card className="p-2"><p className="text-[10px] text-muted-foreground">Total Credit</p><p className="text-sm font-semibold text-green-600 tabular-nums">R{totalCredit.toFixed(2)}</p></Card>
                  </div>
                  <div className="overflow-hidden border rounded-lg">
                    <div className="grid grid-cols-[1fr_80px_80px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>Description</span>
                      <span className="text-right">Debit</span>
                      <span className="text-right">Credit</span>
                    </div>
                    <div className="divide-y max-h-[500px] overflow-y-auto">
                      {filteredEntries.map((entry: any) => (
                        <div key={entry.id} className="grid grid-cols-[1fr_80px_80px] gap-1 px-3 py-2 text-xs items-center">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{entry.description}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(entry.created_at), "dd MMM yyyy HH:mm")}
                              {entry.club_member_id && ` · ${getMemberName(entry.club_member_id)}`}
                            </p>
                          </div>
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
                </>
              );
            })()}
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
        )}
      </FinanceHub>


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
              {txDirection === "income" && txMemberId && txMemberId !== "__none__" ? (
                <>
                  <div className="h-9 px-3 flex items-center rounded-md border bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                    Accounts Receivable — settles this member's outstanding bill
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    A member is linked, so this payment is automatically posted against their outstanding balance
                    (Dr {txMethod === "cash" ? "Cash" : "Current Account"} / Cr Accounts Receivable). Do NOT credit an income
                    account here — the income was already recognised when the fee was raised.
                  </p>
                </>
              ) : (
                <Select value={txAccount} onValueChange={setTxAccount}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select account..." /></SelectTrigger>
                  <SelectContent>
                    {txDirection === "income" && (
                      <SelectItem value="debtors">
                        Member Paying Outstanding Account (settles their bill)
                      </SelectItem>
                    )}
                    {(txDirection === "income" ? CREDIT_ACCOUNTS : DEBIT_ACCOUNTS)
                      .filter(a => !["bank", "bank_current", "cash", "debtors"].includes(a))
                      .map(a => (
                        <SelectItem key={a} value={a}>{CHART_OF_ACCOUNTS[a].label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {txAmount && parseFloat(txAmount) > 0 && (txAccount || (txDirection === "income" && txMemberId && txMemberId !== "__none__")) && (
                <div className="mt-2 p-2 rounded bg-muted/60 text-[10px] text-muted-foreground space-y-0.5">
                  <p className="font-semibold text-foreground text-xs">GL Preview:</p>
                  {txDirection === "income" ? (
                    <>
                      <p>• Debit {txMethod === "cash" ? "Cash" : "Current Account"} R{parseFloat(txAmount).toFixed(2)}</p>
                      <p>• Credit {(txMemberId && txMemberId !== "__none__") ? "Accounts Receivable" : getLabel(txAccount)} R{parseFloat(txAmount).toFixed(2)}</p>
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
              <div className="relative" ref={txMemberSearchRef}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
                <Input
                  placeholder={txMemberId ? getMemberName(txMemberId) : "Type a name to search…"}
                  value={txMemberSearch}
                  onChange={e => { setTxMemberSearch(e.target.value); setTxMemberDropdownOpen(true); }}
                  onFocus={() => setTxMemberDropdownOpen(true)}
                  className="pl-8 h-9 text-xs"
                />
                {txMemberDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-md shadow-lg max-h-52 overflow-y-auto">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2 text-muted-foreground"
                      onClick={() => {
                        setTxMemberId("__none__");
                        setTxMemberSearch("");
                        setTxMemberDropdownOpen(false);
                      }}
                    >
                      <span className="flex-1">None</span>
                    </button>
                    {(members || [])
                      .slice()
                      .filter((m: any) => {
                        const term = txMemberSearch.toLowerCase();
                        const name = (m.name || m.profiles?.name || "").toLowerCase();
                        const email = (m.email || "").toLowerCase();
                        const num = (m.club_member_number || "").toLowerCase();
                        return !term || name.includes(term) || email.includes(term) || num.includes(term);
                      })
                      .sort((a: any, b: any) => (a.name || a.profiles?.name || "").localeCompare(b.name || b.profiles?.name || ""))
                      .map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
                          onClick={() => {
                            setTxMemberId(m.id);
                            setTxMemberSearch(m.name || m.profiles?.name || m.email || "");
                            setTxMemberDropdownOpen(false);
                          }}
                        >
                          <span className="flex-1 truncate">
                            {m.name || m.profiles?.name || m.email || "Unnamed"}
                            {m.club_member_number ? ` · ${m.club_member_number}` : ""}
                          </span>
                        </button>
                      ))}
                    {(members || []).filter((m: any) => {
                      const term = txMemberSearch.toLowerCase();
                      const name = (m.name || m.profiles?.name || "").toLowerCase();
                      const email = (m.email || "").toLowerCase();
                      const num = (m.club_member_number || "").toLowerCase();
                      return !term || name.includes(term) || email.includes(term) || num.includes(term);
                    }).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No members found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Button className="w-full" onClick={handleRecordTransaction} disabled={txSubmitting}>
              {txSubmitting ? "Recording..." : "Record Transaction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Member Statement Dialog */}
      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Member Statement
            </DialogTitle>
            <DialogDescription>Select a member to view their account statement.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1" ref={memberSearchRef}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
                <Input
                  placeholder={statementMemberId ? "Change member…" : "Type a name to search…"}
                  value={statementSearch}
                  onChange={e => { setStatementSearch(e.target.value); setMemberDropdownOpen(true); }}
                  onFocus={() => setMemberDropdownOpen(true)}
                  className="pl-8 h-9 text-xs"
                />
                {memberDropdownOpen && (
                  <div className="absolute z-[100] left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-xl max-h-[60vh] overflow-y-auto overscroll-contain">
                    {(members || [])
                      .slice()
                      .filter((m: any) => {
                        const term = statementSearch.toLowerCase();
                        const name = (m.name || m.profiles?.name || "").toLowerCase();
                        const email = (m.email || "").toLowerCase();
                        const num = (m.club_member_number || "").toLowerCase();
                        return !term || name.includes(term) || email.includes(term) || num.includes(term);
                      })
                      .sort((a: any, b: any) => (a.name || a.profiles?.name || "").localeCompare(b.name || b.profiles?.name || ""))
                      .map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          style={{ touchAction: "manipulation" }}
                          className="w-full text-left px-3 py-3 min-h-[44px] text-sm hover:bg-muted active:bg-muted flex items-center gap-2 border-b last:border-b-0"
                          onPointerDown={(e) => {
                            e.preventDefault();
                            setStatementMemberId(m.id);
                            setStatementSearch(m.name || m.profiles?.name || m.email || "");
                            setMemberDropdownOpen(false);
                          }}
                        >
                          <span className="flex-1 truncate">
                            {m.name || m.profiles?.name || m.email || "Unnamed"}
                            {m.club_member_number ? ` · ${m.club_member_number}` : ""}
                          </span>
                        </button>
                      ))}
                    {(members || []).filter((m: any) => {
                      const term = statementSearch.toLowerCase();
                      const name = (m.name || m.profiles?.name || "").toLowerCase();
                      const email = (m.email || "").toLowerCase();
                      const num = (m.club_member_number || "").toLowerCase();
                      return !term || name.includes(term) || email.includes(term) || num.includes(term);
                    }).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No members found</div>
                    )}
                  </div>
                )}
              </div>
              {statementMemberId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 shrink-0 text-muted-foreground"
                  onClick={() => { setStatementMemberId(""); setStatementSearch(""); }}
                >
                  Clear
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 shrink-0"
                onClick={() => {
                  setBillMemberId(statementMemberId || "");
                  setBillMemberSearch(statementMemberId ? getMemberName(statementMemberId) : "");
                  setBillOpen(true);
                }}
              >
                <Receipt className="w-3.5 h-3.5" /> Bill Member
              </Button>
            </div>


            {!statementMemberId ? (
              <p className="text-sm text-muted-foreground">Select a member to view their statement.</p>
            ) : (() => {
              const memberEntries = (journalEntries || [])
                .filter((e: any) => e.club_member_id === statementMemberId && e.account === "debtors")
                .slice()
                .sort((a: any, b: any) => {
                  const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                  if (t !== 0) return t;
                  // On ties, post debits (fees raised) before credits (payments) so running balance stays sensible
                  const aIsDebit = Number(a.debit || 0) > 0 ? 0 : 1;
                  const bIsDebit = Number(b.debit || 0) > 0 ? 0 : 1;
                  return aIsDebit - bIsDebit;
                });
              const billed = memberEntries.reduce((s: number, e: any) => s + Number(e.debit || 0), 0);
              const paid = memberEntries.reduce((s: number, e: any) => s + Number(e.credit || 0), 0);
              const outstanding = billed - paid;
              let running = 0;
              const rowsDesc = memberEntries
                .map((e: any) => {
                  running += Number(e.debit || 0) - Number(e.credit || 0);
                  return { ...e, running };
                })
                .reverse();

              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Card className="p-2">
                      <p className="text-[10px] text-muted-foreground">Total Billed</p>
                      <p className="text-sm font-bold text-destructive tabular-nums">R{billed.toFixed(2)}</p>
                    </Card>
                    <Card className="p-2">
                      <p className="text-[10px] text-muted-foreground">Total Paid</p>
                      <p className="text-sm font-bold text-green-600 tabular-nums">R{paid.toFixed(2)}</p>
                    </Card>
                    <Card className="p-2">
                      <p className="text-[10px] text-muted-foreground">Outstanding Balance</p>
                      <p className={cn("text-sm font-bold tabular-nums", outstanding > 0.01 ? "text-destructive" : outstanding < -0.01 ? "text-green-600" : "text-muted-foreground")}>
                        R{outstanding.toFixed(2)} {outstanding < -0.01 ? "Cr" : ""}
                      </p>
                    </Card>
                  </div>

                  {memberEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No transactions for this member.</p>
                  ) : (
                    <div className="overflow-hidden border rounded-lg">
                      <div className="grid grid-cols-[80px_1fr_110px_70px_70px_80px_32px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Date</span>
                        <span>Description</span>
                        <span>Account</span>
                        <span className="text-right">Debit</span>
                        <span className="text-right">Credit</span>
                        <span className="text-right">Balance</span>
                        <span />
                      </div>
                      <div className="divide-y max-h-[400px] overflow-y-auto">
                        {rowsDesc.map((entry: any) => (
                          <div key={entry.id} className="grid grid-cols-[80px_1fr_110px_70px_70px_80px_32px] gap-1 px-3 py-2 text-xs items-center">
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {format(new Date(entry.created_at), "dd MMM yy")}
                            </span>
                            <p className="truncate font-medium">{entry.description}</p>
                            <Badge variant="outline" className="text-[10px] w-fit">
                              {getLabel(entry.account)}
                            </Badge>
                            <span className={cn("text-right tabular-nums", Number(entry.debit) > 0 && "text-destructive font-medium")}>
                              {Number(entry.debit) > 0 ? `R${Number(entry.debit).toFixed(2)}` : ""}
                            </span>
                            <span className={cn("text-right tabular-nums", Number(entry.credit) > 0 && "text-green-600 font-medium")}>
                              {Number(entry.credit) > 0 ? `R${Number(entry.credit).toFixed(2)}` : ""}
                            </span>
                            <span className={cn("text-right tabular-nums font-medium",
                              entry.running > 0.01 ? "text-destructive" : entry.running < -0.01 ? "text-green-600" : "text-muted-foreground"
                            )}>
                              R{entry.running.toFixed(2)}
                            </span>
                            <RowActionMenu entry={entry} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Use the ⋯ menu on any row to <strong>Reverse</strong> (audit-safe) or <strong>Delete</strong> the transaction. Both the debit and credit legs are updated together so the books stay balanced.
                  </p>

                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Member Balances Dialog */}
      <Dialog open={balancesOpen} onOpenChange={setBalancesOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Member Balances
            </DialogTitle>
            <DialogDescription>
              Net of <strong>Accounts Receivable</strong> (billed minus paid) less <strong>Member Credits</strong> (EFT top-ups not yet applied). Positive = owes the club; negative = in credit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-md border overflow-hidden">
                {(["outstanding", "credit", "all"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setBalancesFilter(f)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors",
                      balancesFilter === f ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
                    )}
                  >
                    {f === "outstanding" ? "Outstanding" : f === "credit" ? "In Credit" : "All"}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Search name…"
                value={balancesSearch}
                onChange={(e) => setBalancesSearch(e.target.value)}
                className="h-8 text-xs flex-1 min-w-[160px]"
              />
            </div>
            {(() => {
              const memberMap = new Map<string, { debtors: number; credits: number }>();
              (journalEntries || []).forEach((e: any) => {
                if (!e.club_member_id) return;
                const row = memberMap.get(e.club_member_id) || { debtors: 0, credits: 0 };
                if (e.account === "debtors") {
                  row.debtors += Number(e.debit || 0) - Number(e.credit || 0);
                } else if (e.account === "member_credits") {
                  row.credits += Number(e.credit || 0) - Number(e.debit || 0);
                }
                memberMap.set(e.club_member_id, row);
              });
              const term = balancesSearch.trim().toLowerCase();
              let rows = Array.from(memberMap.entries()).map(([id, v]) => ({
                id,
                name: getMemberName(id),
                debtors: v.debtors,
                credits: v.credits,
                net: v.debtors - v.credits,
              }));
              if (balancesFilter === "outstanding") rows = rows.filter(r => r.net > 0.01);
              else if (balancesFilter === "credit") rows = rows.filter(r => r.net < -0.01);
              if (term) rows = rows.filter(r => r.name.toLowerCase().includes(term));
              rows.sort((a, b) => balancesFilter === "credit" ? a.net - b.net : b.net - a.net);
              const total = rows.reduce((s, r) => s + r.net, 0);

              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Card className="p-2">
                      <p className="text-[10px] text-muted-foreground">Members shown</p>
                      <p className="text-sm font-bold tabular-nums">{rows.length}</p>
                    </Card>
                    <Card className="p-2">
                      <p className="text-[10px] text-muted-foreground">Total {balancesFilter === "credit" ? "Credit" : "Outstanding"}</p>
                      <p className={cn("text-sm font-bold tabular-nums", total > 0.01 ? "text-destructive" : total < -0.01 ? "text-green-600" : "text-muted-foreground")}>
                        R{Math.abs(total).toFixed(2)} {total < -0.01 ? "Cr" : ""}
                      </p>
                    </Card>
                    <Card className="p-2">
                      <p className="text-[10px] text-muted-foreground">View</p>
                      <p className="text-sm font-bold capitalize">{balancesFilter}</p>
                    </Card>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No members match this filter.</p>
                  ) : (
                    <div className="overflow-hidden border rounded-lg">
                      <div className="grid grid-cols-[1fr_90px_90px_100px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Member</span>
                        <span className="text-right">Receivable</span>
                        <span className="text-right">Credits</span>
                        <span className="text-right">Net Balance</span>
                      </div>
                      <div className="divide-y max-h-[420px] overflow-y-auto">
                        {rows.map(r => (
                          <button
                            key={r.id}
                            onClick={() => { setStatementMemberId(r.id); setStatementSearch(""); setBalancesOpen(false); setStatementOpen(true); }}
                            className="w-full grid grid-cols-[1fr_90px_90px_100px] gap-1 px-3 py-2 text-xs items-center hover:bg-accent text-left"
                          >
                            <span className="truncate font-medium">{r.name}</span>
                            <span className="text-right tabular-nums text-destructive">
                              {r.debtors > 0.01 ? `R${r.debtors.toFixed(2)}` : ""}
                            </span>
                            <span className="text-right tabular-nums text-green-600">
                              {r.credits > 0.01 ? `R${r.credits.toFixed(2)}` : ""}
                            </span>
                            <span className={cn("text-right tabular-nums font-bold",
                              r.net > 0.01 ? "text-destructive" : r.net < -0.01 ? "text-green-600" : "text-muted-foreground"
                            )}>
                              R{Math.abs(r.net).toFixed(2)} {r.net < -0.01 ? "Cr" : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">Click any member to open their full statement.</p>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Finances Confirm Dialog */}

      <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setResetConfirmText(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Reset Club Finances
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">This will <strong>permanently delete</strong> for this club:</span>
              <ul className="list-disc list-inside text-xs space-y-0.5 pl-2">
                <li>All general ledger entries (journal)</li>
                <li>All pending and confirmed payment transactions</li>
                <li>All member fee charges (paid &amp; unpaid)</li>
              </ul>
              <span className="block text-xs">Honesty bar stock, prices and tabs are <strong>not</strong> affected.</span>
              <span className="block text-xs text-muted-foreground pt-1">After resetting, use <em>Reconcile Fees</em> on the Members tab to set who owes what, then <em>Resync Fees</em> to rebuild the GL.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Type <code className="font-mono bg-muted px-1 rounded">RESET</code> to confirm</Label>
              <Input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="h-9 text-xs mt-1 font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setResetOpen(false)} disabled={resetSubmitting}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleResetFinances}
                disabled={resetSubmitting || resetConfirmText.trim() !== "RESET"}
                className="gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {resetSubmitting ? "Resetting…" : "Permanently Reset"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bill Member Dialog */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Bill a Member
            </DialogTitle>
            <DialogDescription>
              Raises a fee on the member's statement. Posts Dr Debtors / Cr the chosen income account, and creates a matching unpaid fee row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Fee</Label>
              <Select
                value={billFeeTypeKey}
                onValueChange={(key) => {
                  setBillFeeTypeKey(key);
                  const opt = (billFeeOptions as BillFeeOption[]).find(o => o.key === key);
                  if (!opt) return;
                  setBillIncome(opt.income);
                  setBillLabel(opt.label);
                  if (opt.amount > 0) setBillAmount(opt.amount.toFixed(2));
                }}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select a fee…" /></SelectTrigger>
                <SelectContent>
                  {(["Membership", "League", "National body"] as const).map(group => {
                    const items = (billFeeOptions as BillFeeOption[]).filter(o => o.group === group);
                    if (items.length === 0) return null;
                    return (
                      <SelectGroup key={group}>
                        <SelectLabel className="text-[10px]">{group}</SelectLabel>
                        {items.map(o => (
                          <SelectItem key={o.key} value={o.key} className="text-xs">
                            {o.label} <span className="text-muted-foreground">— R{o.amount.toFixed(2)}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                  {(billFeeOptions as BillFeeOption[]).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No fees defined. Add them in the Fees tab.</div>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Posts to GL account: <strong>{getLabel(billIncome)}</strong> • Amount is editable below.
              </p>
            </div>
            <div>
              <Label className="text-xs">Member</Label>
              <div className="relative" ref={billMemberSearchRef}>
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground z-10" />
                <Input
                  placeholder={billMemberId ? getMemberName(billMemberId) : "Type a name to search…"}
                  value={billMemberSearch}
                  onChange={e => { setBillMemberSearch(e.target.value); setBillMemberDropdownOpen(true); }}
                  onFocus={() => setBillMemberDropdownOpen(true)}
                  className="pl-8 h-9 text-xs"
                />
                {billMemberDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-background border rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {(members || [])
                      .slice()
                      .filter((m: any) => {
                        const term = billMemberSearch.toLowerCase();
                        const name = (m.name || m.profiles?.name || "").toLowerCase();
                        const email = (m.email || "").toLowerCase();
                        const num = (m.club_member_number || "").toLowerCase();
                        return !term || name.includes(term) || email.includes(term) || num.includes(term);
                      })
                      .sort((a: any, b: any) => (a.name || a.profiles?.name || "").localeCompare(b.name || b.profiles?.name || ""))
                      .map((m: any) => (
                        <button
                          key={m.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center gap-2"
                          onClick={() => {
                            setBillMemberId(m.id);
                            setBillMemberSearch(m.name || m.profiles?.name || m.email || "");
                            setBillMemberDropdownOpen(false);
                          }}
                        >
                          <span className="flex-1 truncate">
                            {m.name || m.profiles?.name || m.email || "Unnamed"}
                            {m.club_member_number ? ` · ${m.club_member_number}` : ""}
                          </span>
                        </button>
                      ))}
                    {(members || []).filter((m: any) => {
                      const term = billMemberSearch.toLowerCase();
                      const name = (m.name || m.profiles?.name || "").toLowerCase();
                      const email = (m.email || "").toLowerCase();
                      const num = (m.club_member_number || "").toLowerCase();
                      return !term || name.includes(term) || email.includes(term) || num.includes(term);
                    }).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No members found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Amount (R)</Label>
                <Input type="number" step="0.01" min="0" placeholder="0.00" value={billAmount} onChange={e => setBillAmount(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Fee description</Label>
              <Input placeholder="e.g. Court hire — 12 June" value={billLabel} onChange={e => setBillLabel(e.target.value)} className="h-9 text-xs" />
            </div>
            {billAmount && parseFloat(billAmount) > 0 && (
              <div className="p-2 rounded bg-muted/60 text-[10px] space-y-0.5">
                <p className="font-semibold text-foreground text-xs">GL Preview:</p>
                <p>• Debit Accounts Receivable R{parseFloat(billAmount).toFixed(2)}</p>
                <p>• Credit {getLabel(billIncome)} R{parseFloat(billAmount).toFixed(2)}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBillOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleBillMember} disabled={billSubmitting}>
              {billSubmitting ? "Posting…" : "Bill Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Row-action Confirm Dialog (Delete / Reverse) */}
      <Dialog open={!!rowAction} onOpenChange={(o) => { if (!o) setRowAction(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {rowAction?.mode === "delete"
                ? <><Trash2 className="w-4 h-4 text-destructive" /> Delete transaction</>
                : <><Undo2 className="w-4 h-4 text-amber-600" /> Reverse transaction</>}
            </DialogTitle>
            <DialogDescription>
              {rowAction?.mode === "delete"
                ? "Permanently removes both sides of this double-entry. If the entry created a fee row, the unpaid fee is removed too. Use this only for entries posted by mistake."
                : "Posts an equal-and-opposite entry dated today. The original line stays visible for audit, but the net effect on balances is zero."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-2 rounded bg-muted/60 text-[11px]">
            <p className="font-semibold mb-1">Affected legs</p>
            <p className="text-muted-foreground">{rowAction?.summary || "—"}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRowAction(null)} disabled={rowActionBusy}>Cancel</Button>
            <Button
              size="sm"
              variant={rowAction?.mode === "delete" ? "destructive" : "default"}
              onClick={confirmRowAction}
              disabled={rowActionBusy}
            >
              {rowActionBusy ? "Working…" : (rowAction?.mode === "delete" ? "Delete" : "Post reversal")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Finance Hub: tile-based navigation ─── */
type FinanceView = "" | "by-account" | "journal" | "pending" | "association-payables" | "renewals" | "trial" | "income" | "coa" | "debit-orders";

interface FinanceHubProps {
  pendingCount: number;
  onStatement: () => void;
  onBalances: (filter: "outstanding" | "credit" | "all") => void;
  onBill: () => void;
  onEnterTx: () => void;
  children: (view: FinanceView, setView: (v: string) => void) => ReactNode;
}

function FinanceHub({ pendingCount, onStatement, onBalances, onBill, onEnterTx, children }: FinanceHubProps) {
  const [view, setView] = useState<FinanceView>("");

  if (view) {
    return <>{children(view, (v) => setView(v as FinanceView))}</>;
  }

  const groups: Array<{
    title: string;
    description: string;
    tiles: Array<{
      key: FinanceView;
      label: string;
      desc: string;
      icon: ComponentType<{ className?: string }>;
      badge?: number;
      onClick?: () => void;
    }>;
  }> = [
    {
      title: "Daily Operations",
      description: "Day-to-day bookkeeping and reconciliation",
      tiles: [
        { key: "by-account", label: "By Account", desc: "Filter ledger entries per GL account", icon: Layers },
        { key: "journal", label: "All GL Entries", desc: "Every double-entry line, newest first", icon: BookOpen },
        { key: "pending", label: "Pending", desc: "Unposted transactions awaiting review", icon: Clock, badge: pendingCount },
        
      ],
    },
    {
      title: "Affiliations",
      description: "Payables to national bodies & associations",
      tiles: [
        { key: "association-payables", label: "Association Payables", desc: "Generate & settle lump-sum dues to SSA / NSA per season", icon: Building2 },
      ],
    },
    {
      title: "Member Billing",
      description: "Statements, balances and invoicing",
      tiles: [
        { key: "renewals", label: "Annual Renewals", desc: "Generate & send yearly invoices", icon: CalendarDays },
        { key: "" as FinanceView, label: "Member Statement", desc: "Full transaction history for one member", icon: FileText, onClick: onStatement },
        { key: "" as FinanceView, label: "Member Balances", desc: "Who owes and who's in credit", icon: Wallet, onClick: () => onBalances("outstanding") },
        { key: "" as FinanceView, label: "Bill Member", desc: "Add an ad-hoc charge to a member", icon: Receipt, onClick: onBill },
        { key: "debit-orders", label: "Debit Orders", desc: "Stitch mandates, queued collections & approvals", icon: Banknote },
      ],
    },
    {
      title: "Reports",
      description: "Accounting reports & chart structure",
      tiles: [
        { key: "trial", label: "Trial Balance", desc: "Debits vs credits across all accounts", icon: BarChart3 },
        { key: "income", label: "Income Statement", desc: "Revenue & expenses for the period", icon: BarChart3 },
        { key: "coa", label: "Chart of Accounts", desc: "All GL accounts and balances", icon: ListTree },
      ],
    },
  ];

  return (
    <div className="space-y-6 mt-2">
      {/* Primary action */}
      <div className="flex justify-end">
        <Button onClick={onEnterTx} className="gap-1.5">
          <Plus className="w-4 h-4" /> Enter Transaction
        </Button>
      </div>

      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2">
            <h3 className="text-sm font-semibold tracking-tight">{g.title}</h3>
            <p className="text-xs text-muted-foreground">{g.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {g.tiles.map((t, i) => {
              const Icon = t.icon;
              const handleClick = t.onClick ? t.onClick : () => setView(t.key);
              return (
                <button
                  key={`${g.title}-${i}`}
                  onClick={handleClick}
                  className="group text-left rounded-lg border bg-card hover:border-primary/50 hover:shadow-md transition-all p-4 relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="rounded-md bg-primary/10 text-primary p-2">
                      <Icon className="w-4 h-4" />
                    </div>
                    {t.badge && t.badge > 0 ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t.badge}</Badge>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                  <p className="text-sm font-semibold mt-3">{t.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

