import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Wallet, CreditCard, Building2, CheckCircle2, XCircle, Copy, ChevronRight, Wine } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMemberContext } from "@/contexts/MemberContext";
import { useMyClub } from "@/hooks/use-club";
import { useClubSecrets } from "@/hooks/use-club-secrets";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { JoinLeagueAssociationCard } from "@/components/JoinLeagueAssociationCard";
import { JoinedAssociationsCard } from "@/components/JoinedAssociationsCard";

export default function MyAccount() {
  const { activeMember, isViewingAs, isLoading: memberContextLoading } = useMemberContext();
  const { data: clubData, isLoading: clubLoading } = useMyClub();
  const queryClient = useQueryClient();
  const club = clubData?.club as any;
  const { data: clubSecrets } = useClubSecrets(club?.id);
  const navigate = useNavigate();

  const { data: activeClubMember, isLoading: activeClubMemberLoading } = useQuery({
    queryKey: ["account-club-member", club?.id, activeMember?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("club_members")
        .select("*, fee_category:fee_category_id(id, name, annual_fee)")
        .eq("id", activeMember!.id)
        .eq("club_id", club.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!club?.id && !!activeMember?.id,
  });

  const clubMemberId = activeMember?.id || (activeClubMember as any)?.id || null;
  const clubId = club?.id || (activeClubMember as any)?.club_id || null;
  const feeCategoryId = (activeClubMember as any)?.fee_category_id;
  const playsLeague = !!(activeClubMember as any)?.plays_league;
  const memberNo = (activeClubMember as any)?.club_member_number || activeMember?.club_member_number || "N/A";
  const accountName = (activeClubMember as any)?.name || activeMember?.name || "Unknown member";

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("100");
  const [topUpMethod, setTopUpMethod] = useState<"eft" | "card">("eft");
  const [payFeeId, setPayFeeId] = useState<string | null>(null);
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<"eft" | "card" | "credit">("credit");
  const [payMode, setPayMode] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [payBarOpen, setPayBarOpen] = useState(false);
  const [payBarMethod, setPayBarMethod] = useState<"eft" | "card" | "credit">("card");

  // Auto-open bar payment dialog from URL param
  const [searchParams, setSearchParams] = useSearchParams();
  const barPayAutoOpened = useRef(false);

  // Credit transactions scoped by club_member_id (primary identity for all transactions)
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["credit-transactions", clubMemberId, clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_credit_transactions")
        .select("*")
        .eq("club_member_id", clubMemberId!)
        .eq("club_id", clubId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubMemberId && !!clubId,
  });

  const { data: fees, isLoading: feesLoading } = useQuery({
    queryKey: ["club-member-fee-payments", clubMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("*")
        .eq("club_member_id", clubMemberId!)
        // Exclude "fees payable by the club" — those are the club's onward
        // obligations to NSA/SSA, not the member's own dues.
        .not("fee_type", "in", "(club_payable_assoc,club_payable_national)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubMemberId,
  });

  // Honesty bar unsettled entries
  const { data: barTabEntries = [], isLoading: barTabLoading } = useQuery({
    queryKey: ["my-bar-tab", clubMemberId, clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("bar_tab_entries")
        .select("*, bar_items:bar_item_id(name, category)")
        .eq("club_member_id", clubMemberId!)
        .eq("club_id", clubId!)
        .eq("settled", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubMemberId && !!clubId && !!club?.honesty_bar_enabled,
  });

  const barTabTotal = (barTabEntries as any[]).reduce((s: number, e: any) => s + Number(e.total), 0);

  // Light sessions no longer needed separately — light fees come through member_credit_transactions

  // Build unified statement lines sorted chronologically (oldest first)
  // NEW ACCOUNTING MODEL:
  // - Fees charged → Credit on member statement (they owe the club)
  // - Payments/top-ups → Debit on member statement (reduces what they owe)
  // Transaction types:
  // - "credit" = fee/charge applied to member → shows in Credit column (member owes)
  // - "debit"  = payment/topup by member → shows in Debit column (member paid)
  // - "refund" = reversal → shows in Debit column
  // Balance: debits - credits; positive = member in credit, negative = member owes
  type StatementLine = { id: string; date: string; description: string; debit: number; credit: number; balance: number; status: string };
  const statementLines: StatementLine[] = (() => {
    const lines: Omit<StatementLine, "balance">[] = [];

    // Build a set of "fee charges" already represented by a credit transaction,
    // so we don't double-count them as "Opening balance" lines below.
    const txChargeKeys = new Set<string>();
    for (const tx of (transactions || [])) {
      if ((tx as any).type !== "credit") continue;
      const desc = String((tx as any).description || "").trim().toLowerCase();
      const amt = Math.abs(Number((tx as any).amount));
      if (!desc || !(amt > 0)) continue;
      txChargeKeys.add(`${desc}|${amt.toFixed(2)}`);
    }

    // Inject fee records as opening balance entries (the original charge that was raised).
    // We include unpaid fees always, and paid fees ONLY when there is a matching payment
    // transaction to offset them. Paid fees without a matching payment are treated as
    // administratively cleared (e.g. waived for pre-existing members) and skipped to avoid
    // showing a phantom balance.
    // Skip when a matching credit transaction already represents the charge (avoid double-counting).
    for (const fee of (fees || [])) {
      // For paid fees, the original amount may have been zeroed out by partial payments.
      // We need the ORIGINAL charge amount — fall back to the payment amount if available.
      const feeAmt = Number((fee as any).amount) || 0;
      const isPaid = !!(fee as any).paid;
      const label = String((fee as any).fee_label || "").trim().toLowerCase();
      // If fee was fully paid, amount is still the unpaid remainder (0 for full pay).
      // We still want to show the original charge — use amount if > 0, otherwise look for
      // a matching debit tx to infer the original amount.
      let chargeAmt = Math.abs(feeAmt);
      const matchingPaymentTx = (transactions || []).find((tx: any) => {
        if (tx.type !== "debit") return false;
        const d = String(tx.description || "").toLowerCase();
        return d.includes(label) && label.length > 0;
      });
      if (isPaid && chargeAmt === 0) {
        if (matchingPaymentTx) chargeAmt = Math.abs(Number((matchingPaymentTx as any).amount));
      }
      if (chargeAmt <= 0) continue;
      // Suppress paid fees that have no matching payment (administratively cleared)
      if (isPaid && !matchingPaymentTx) continue;
      if (txChargeKeys.has(`${label}|${chargeAmt.toFixed(2)}`)) continue;
      lines.push({
        id: `fee-${(fee as any).id}`,
        date: (fee as any).created_at,
        description: `Fee charge: ${(fee as any).fee_label || "Outstanding fee"}`,
        debit: 0,
        credit: chargeAmt,
        status: "confirmed",
      });
    }

    for (const tx of (transactions || [])) {
      const txType = (tx as any).type;
      const amt = Math.abs(Number((tx as any).amount));

      if (txType === "credit") {
        // Fee charged to member → Credit column
        lines.push({
          id: `tx-${(tx as any).id}`,
          date: (tx as any).created_at,
          description: (tx as any).description || "Fee charged",
          debit: 0,
          credit: amt,
          status: (tx as any).status,
        });
      } else if (txType === "debit" || txType === "refund") {
        // Payment, top-up, or refund → Debit column
        lines.push({
          id: `tx-${(tx as any).id}`,
          date: (tx as any).created_at,
          description: (tx as any).description || (txType === "refund" ? "Reversal" : "Payment"),
          debit: amt,
          credit: 0,
          status: (tx as any).status,
        });
      }
    }

    // Sort oldest first
    lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Compute running balance (debits - credits; positive = in credit, negative = owes money)
    let balance = 0;
    return lines.map((line) => {
      if (line.status === "confirmed" || line.status === "outstanding") {
        balance = balance + line.debit - line.credit;
      }
      return { ...line, balance };
    });
  })();

  // Balance is now debits - credits: positive = in credit, negative = owes money
  const creditBalance = (() => {
    if (statementLines.length === 0) return 0;
    return statementLines[statementLines.length - 1]?.balance || 0;
  })();

  // Auto-open bar payment dialog if navigated with ?payBar=1
  useEffect(() => {
    if (searchParams.get("payBar") === "1" && !barPayAutoOpened.current && barTabTotal > 0) {
      barPayAutoOpened.current = true;
      setPayBarMethod(creditBalance >= barTabTotal ? "credit" : "card");
      setPayBarOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, barTabTotal, creditBalance]);

  const pendingTopUps = (transactions || []).filter(
    (tx: any) => tx.type === "debit" && tx.method === "eft" && tx.status === "pending"
  );

  // Top-up mutation
  const topUpMutation = useMutation({
    mutationFn: async ({ amount, method }: { amount: number; method: string }) => {
      if (!clubId || !clubMemberId) throw new Error("No club membership found for this account.");
      const { error } = await fromExt("member_credit_transactions").insert({
        club_id: clubId,
        club_member_id: clubMemberId,
        amount,
        type: "debit",
        method,
        description: `Top-up via ${method.toUpperCase()}`,
        status: method === "card" ? "confirmed" : "pending",
        confirmed_at: method === "card" ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      toast.success(
        topUpMethod === "eft"
          ? "EFT top-up request submitted. Upload proof of payment for faster processing."
          : "Card top-up confirmed! Your balance has been updated."
      );
      setTopUpOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to submit top-up"),
  });

  // Pay fee mutation
  const payFeeMutation = useMutation({
    mutationFn: async ({ feeIds, method, customAmount }: { feeIds: string[]; method: string; customAmount?: number }) => {
      if (!clubId || !clubMemberId) throw new Error("No club membership found for this account.");
      const selectedFees = (fees || []).filter((f: any) => feeIds.includes(f.id));
      if (!selectedFees.length) throw new Error("No fees selected");
      const totalOwed = selectedFees.reduce((s: number, f: any) => s + Number(f.amount), 0);
      const payAmount = customAmount != null ? customAmount : totalOwed;
      if (payAmount <= 0) throw new Error("Payment amount must be greater than zero");
      if (payAmount > totalOwed) throw new Error("Payment amount exceeds outstanding balance");
      const isPartial = payAmount < totalOwed;

      // GL journal entries are posted automatically by database triggers
      // (journal_fee_assessment on insert, journal_fee_payment_received on paid=true).
      // We just record the member_credit_transactions row and flip the fee to paid.

      const feeDescription = selectedFees.map((f: any) => f.fee_label).join(", ");
      const txDescription = isPartial
        ? `Partial payment: ${feeDescription}`
        : `Fee payment: ${feeDescription}`;

      if (method === "credit") {
        if (creditBalance < payAmount) {
          throw new Error("Insufficient credit balance. Please top up first.");
        }
        const { data: txData, error: txErr } = await fromExt("member_credit_transactions").insert({
          club_id: clubId,
          club_member_id: clubMemberId,
          amount: payAmount,
          type: "debit",
          method: "credit",
          description: txDescription,
          status: "confirmed",
        }).select("id").single();
        if (txErr) throw txErr;

        if (isPartial) {
          // Reduce the fee amount by the partial payment (distribute across selected fees)
          let remaining = payAmount;
          for (const fee of selectedFees) {
            const feeAmt = Number(fee.amount);
            const deduction = Math.min(remaining, feeAmt);
            remaining -= deduction;
            const newAmount = feeAmt - deduction;
            if (newAmount <= 0) {
              await fromExt("club_member_fee_payments").update({ paid: true, paid_at: new Date().toISOString(), amount: 0 }).eq("id", fee.id);
            } else {
              await fromExt("club_member_fee_payments").update({ amount: newAmount }).eq("id", fee.id);
            }
          }
        } else {
          for (const fee of selectedFees) {
            await fromExt("club_member_fee_payments").update({ paid: true, paid_at: new Date().toISOString() }).eq("id", fee.id);
          }
        }
      } else if (method === "card") {
        const { data: txData, error: txErr } = await fromExt("member_credit_transactions").insert({
          club_id: clubId,
          club_member_id: clubMemberId,
          amount: payAmount,
          type: "debit",
          method: "card",
          description: txDescription.replace("Fee payment", "Card payment").replace("Partial payment", "Partial card payment"),
          status: "confirmed",
        }).select("id").single();
        if (txErr) throw txErr;
        

        if (isPartial) {
          let remaining = payAmount;
          for (const fee of selectedFees) {
            const feeAmt = Number(fee.amount);
            const deduction = Math.min(remaining, feeAmt);
            remaining -= deduction;
            const newAmount = feeAmt - deduction;
            if (newAmount <= 0) {
              await fromExt("club_member_fee_payments").update({ paid: true, paid_at: new Date().toISOString(), amount: 0 }).eq("id", fee.id);
            } else {
              await fromExt("club_member_fee_payments").update({ amount: newAmount }).eq("id", fee.id);
            }
          }
        } else {
          for (const fee of selectedFees) {
            await fromExt("club_member_fee_payments").update({ paid: true, paid_at: new Date().toISOString() }).eq("id", fee.id);
          }
        }
      } else {
        const { error: txErr } = await fromExt("member_credit_transactions").insert({
          club_id: clubId,
          club_member_id: clubMemberId,
          amount: payAmount,
          type: "debit",
          method: "eft",
          description: `EFT payment: ${feeDescription}`,
          reference: `${memberNo} - Fees`,
          status: "pending",
        });
        if (txErr) throw txErr;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["club-member-fee-payments"] });
      if (vars.method === "eft") {
        toast.success("EFT payment recorded. Your secretary/admin will confirm receipt.");
      } else {
        toast.success("Payment recorded successfully!");
      }
      setPayFeeId(null);
      setSelectedFeeIds([]);
      setPayMode("full");
      setPartialAmount("");
    },
    onError: (e: any) => toast.error(e.message || "Payment failed"),
  });

  // Pay bar tab mutation
  const payBarMutation = useMutation({
    mutationFn: async ({ method }: { method: string }) => {
      if (!clubId || !clubMemberId) throw new Error("No club membership found.");
      if (barTabTotal <= 0) throw new Error("No outstanding bar tab.");

      const desc = `Honesty Bar payment (${(barTabEntries as any[]).length} items)`;

      // Record transaction
      const { data: txData, error: txErr } = await fromExt("member_credit_transactions").insert({
        club_id: clubId,
        club_member_id: clubMemberId,
        amount: barTabTotal,
        type: "debit",
        method,
        description: desc,
        status: method === "card" ? "confirmed" : method === "credit" ? "confirmed" : "pending",
        confirmed_at: method !== "eft" ? new Date().toISOString() : null,
      }).select("id").single();
      if (txErr) throw txErr;

      // Post GL entries for confirmed payments
      if (method !== "eft") {
        const journalRef = crypto.randomUUID();
        await fromExt("club_journal_entries").insert([
          {
            club_id: clubId,
            journal_ref: journalRef,
            account: "bank" as any,
            debit: barTabTotal,
            credit: 0,
            description: desc,
            club_member_id: clubMemberId,
            transaction_id: txData.id,
          },
          {
            club_id: clubId,
            journal_ref: journalRef,
            account: "debtors" as any,
            debit: 0,
            credit: barTabTotal,
            description: desc,
            club_member_id: clubMemberId,
            transaction_id: txData.id,
          },
        ]);
      }

      // Mark entries as settled
      if (method !== "eft") {
        for (const entry of (barTabEntries as any[])) {
          await fromExt("bar_tab_entries")
            .update({ settled: true, settled_at: new Date().toISOString() })
            .eq("id", entry.id);
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["my-bar-tab"] });
      queryClient.invalidateQueries({ queryKey: ["bar-tab-unsettled"] });
      setPayBarOpen(false);
      if (vars.method === "eft") {
        toast.success("EFT payment recorded. Admin will confirm and settle your bar tab.");
      } else {
        toast.success("Bar tab paid! Items have been settled.");
      }
    },
    onError: (e: any) => toast.error(e.message || "Payment failed"),
  });

  const copyBankDetails = () => {
    const details = [
      clubSecrets?.bank_name && `Bank: ${clubSecrets?.bank_name}`,
      clubSecrets?.bank_account_name && `Account: ${clubSecrets?.bank_account_name}`,
      clubSecrets?.bank_account_number && `Number: ${clubSecrets?.bank_account_number}`,
      clubSecrets?.bank_branch_code && `Branch: ${clubSecrets?.bank_branch_code}`,
      `Reference: ${memberNo} - Top-up`,
    ]
      .filter(Boolean)
      .join("\n");
    if (details) {
      navigator.clipboard.writeText(details);
      toast.success("Bank details copied!");
    }
  };

  const payingFee = (fees || []).find((f: any) => f.id === payFeeId);

  const unpaidFees = (fees || []).filter((f: any) => !f.paid);
  const paidFees = (fees || []).filter((f: any) => f.paid);
  const selectedFeeTotal = unpaidFees
    .filter((f: any) => selectedFeeIds.includes(f.id))
    .reduce((s: number, f: any) => s + Number(f.amount), 0);
  const actualPayAmount = payMode === "partial" && partialAmount ? Number(partialAmount) : selectedFeeTotal;

  if (memberContextLoading || clubLoading || activeClubMemberLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bottom-nav-safe">
      <SEO title="My Account" description="Manage your credit balance and fee payments." path="/my-account" noIndex />
      <PageHeader
        title={isViewingAs ? `${accountName}'s Account` : "My Account"}
        subtitle={`Active account: ${accountName}${memberNo !== "N/A" ? ` · #${memberNo}` : (club as any)?.tenant_type === "association" ? " · league number pending" : ""}`}
      />

      {/* Join an affiliated league association */}
      {clubId && (club as any)?.tenant_type !== "association" && (
        <div className="px-4 mt-3 space-y-3">
          <JoinLeagueAssociationCard clubId={clubId} variant="card" />
          <JoinedAssociationsCard clubId={clubId} />
        </div>
      )}

      {/* Credit Balance Card */}
      <motion.div
        className="px-4 mt-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="p-4 bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {creditBalance >= 0 ? "Credit Balance" : "Amount Owing"}
                </p>
                <p className={cn("text-2xl font-bold font-heading", creditBalance >= 0 ? "text-foreground" : "text-destructive")}>
                  {creditBalance < 0 ? "-" : ""}R{Math.abs(creditBalance).toFixed(2)}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => setTopUpOpen(true)} className="gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              Top Up
            </Button>
          </div>

          {pendingTopUps.length > 0 && (
            <div className="mt-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {pendingTopUps.length} pending top-up{pendingTopUps.length > 1 ? "s" : ""} awaiting admin confirmation
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Outstanding Fees */}
      <motion.div
        className="px-4 mt-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <h2 className="text-sm font-semibold font-heading mb-2">Outstanding Fees</h2>
        {!clubMemberId ? (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            No member profile linked to your account yet.
          </Card>
        ) : feesLoading ? (
          <Card className="p-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </Card>
        ) : unpaidFees.length > 0 ? (
          <div className="space-y-1.5">
            {unpaidFees.map((fee: any) => (
              <Card key={fee.id} className="p-3 flex items-center gap-3">
                <Checkbox
                  checked={selectedFeeIds.includes(fee.id)}
                  onCheckedChange={(checked) => {
                    setSelectedFeeIds((prev) =>
                      checked ? [...prev, fee.id] : prev.filter((id) => id !== fee.id)
                    );
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <p className="text-sm font-medium truncate">{fee.fee_label}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-5.5">
                    R{Number(fee.amount).toFixed(2)}
                    {fee.season_year && ` · ${fee.season_year}`}
                  </p>
                </div>
              </Card>
            ))}
            {selectedFeeIds.length > 0 && (
              <Button
                className="w-full mt-2 gap-2"
                onClick={() => {
                  setPayFeeId("batch");
                  setPayMethod(creditBalance >= selectedFeeTotal ? "credit" : "eft");
                  setPayMode("full");
                  setPartialAmount("");
                }}
              >
                Make Payment · R{selectedFeeTotal.toFixed(2)}
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
            {selectedFeeIds.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center mt-1">
                Select fees above to pay
              </p>
            )}
          </div>
        ) : (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
            All fees paid — you're up to date! ✅
          </Card>
        )}
      </motion.div>

      {/* Honesty Bar Tab */}
      {club?.honesty_bar_enabled && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
        >
          <h2 className="text-sm font-semibold font-heading mb-2 flex items-center gap-1.5">
            <Wine className="w-3.5 h-3.5 text-primary" />
            Honesty Bar
          </h2>
          {barTabLoading ? (
            <Card className="p-4 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </Card>
          ) : barTabTotal > 0 ? (
            <Card className="p-3 space-y-3 border-destructive/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{(barTabEntries as any[]).length} unsettled item{(barTabEntries as any[]).length !== 1 ? "s" : ""}</p>
                  <p className="text-lg font-bold text-destructive">R{barTabTotal.toFixed(2)}</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/honesty-bar")}>
                  <Wine className="w-3.5 h-3.5" />
                  View Tab
                </Button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(barTabEntries as any[]).slice(0, 5).map((e: any) => (
                  <div key={e.id} className="flex justify-between text-xs text-muted-foreground">
                    <span>{e.quantity}× {e.bar_items?.name || "Item"}</span>
                    <span>R{Number(e.total).toFixed(2)}</span>
                  </div>
                ))}
                {(barTabEntries as any[]).length > 5 && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    +{(barTabEntries as any[]).length - 5} more items
                  </p>
                )}
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  setPayBarMethod(creditBalance >= barTabTotal ? "credit" : "card");
                  setPayBarOpen(true);
                }}
              >
                <CreditCard className="w-3.5 h-3.5" />
                Pay Now · R{barTabTotal.toFixed(2)}
              </Button>
            </Card>
          ) : (
            <Card className="p-3 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
              No outstanding bar tab 🎉
            </Card>
          )}
        </motion.div>
      )}

      {/* Paid Fees */}
      {paidFees.length > 0 && (
        <motion.div
          className="px-4 mt-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-sm font-semibold font-heading mb-2">Paid</h2>
          <div className="space-y-1.5">
            {paidFees.map((fee: any) => (
              <Card key={fee.id} className="p-2.5 flex items-center justify-between opacity-70">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <p className="text-xs truncate">{fee.fee_label}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  R{Number(fee.amount).toFixed(2)}
                </Badge>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Account Statement */}
      <motion.div
        className="px-4 mt-4 mb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h2 className="text-sm font-semibold font-heading mb-2">Account Statement</h2>
        {(txLoading || feesLoading) ? (
          <Card className="p-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </Card>
        ) : statementLines.length > 0 ? (
          <Card className="overflow-hidden border">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_90px] gap-1 px-3 py-2 bg-muted/60 border-b text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Credit</span>
              <span className="text-right">Balance</span>
            </div>
            {/* Rows */}
            <div className="divide-y">
              {statementLines.map((line, i) => (
                <div
                  key={line.id}
                  className={cn(
                    "grid grid-cols-[1fr_80px_80px_90px] gap-1 px-3 py-2 text-xs items-center",
                    line.status === "pending" && "opacity-60 bg-amber-500/5"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(line.date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}
                      {line.status === "pending" && (
                        <Badge variant="secondary" className="ml-1.5 text-[8px] bg-amber-500/10 text-amber-600 py-0 px-1">pending</Badge>
                      )}
                    </p>
                  </div>
                  <span className={cn("text-right tabular-nums", line.debit > 0 && "text-green-600")}>
                    {line.debit > 0 ? `R${line.debit.toFixed(2)}` : ""}
                  </span>
                  <span className={cn("text-right tabular-nums", line.credit > 0 && "text-destructive")}>
                    {line.credit > 0 ? `-R${line.credit.toFixed(2)}` : ""}
                  </span>
                  <span className={cn(
                    "text-right font-semibold tabular-nums",
                    line.balance > 0 ? "text-green-600" : line.balance < 0 ? "text-destructive" : ""
                  )}>
                    {line.balance < 0 ? "-" : ""}R{Math.abs(line.balance).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            No transactions yet
          </Card>
        )}
      </motion.div>

      {/* Top Up Dialog */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Top Up Credit</DialogTitle>
            <DialogDescription>Add funds to your account via EFT or card.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Amount (R)</Label>
              <Input
                type="number"
                min="10"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={topUpMethod === "eft" ? "default" : "outline"}
                className="gap-2 h-12"
                onClick={() => setTopUpMethod("eft")}
              >
                <Building2 className="w-4 h-4" />
                EFT
              </Button>
              <Button
                variant={topUpMethod === "card" ? "default" : "outline"}
                className="gap-2 h-12"
                onClick={() => setTopUpMethod("card")}
              >
                <CreditCard className="w-4 h-4" />
                Card
              </Button>
            </div>

            {topUpMethod === "eft" && clubSecrets?.bank_name && (
              <Card className="p-3 bg-muted/50 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={copyBankDetails}>
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                </div>
                {clubSecrets?.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {clubSecrets?.bank_name}</p>}
                {clubSecrets?.bank_account_name && <p className="text-xs"><span className="text-muted-foreground">Account:</span> {clubSecrets?.bank_account_name}</p>}
                {clubSecrets?.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {clubSecrets?.bank_account_number}</p>}
                {clubSecrets?.bank_branch_code && <p className="text-xs"><span className="text-muted-foreground">Branch:</span> {clubSecrets?.bank_branch_code}</p>}
                <p className="text-xs font-semibold"><span className="text-muted-foreground">Reference:</span> {memberNo} - Top-up</p>
              </Card>
            )}

            {topUpMethod === "card" && (
              <Card className="p-3 bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  Card payments are processed via {club?.payment_gateway || "the club's payment gateway"}.
                  Your top-up will be confirmed by the admin after payment is verified.
                </p>
              </Card>
            )}

            <Button
              className="w-full"
              disabled={topUpMutation.isPending || !topUpAmount || Number(topUpAmount) < 10}
              onClick={() => topUpMutation.mutate({ amount: Number(topUpAmount), method: topUpMethod })}
            >
              {topUpMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Submit {topUpMethod.toUpperCase()} Top-Up · R{Number(topUpAmount || 0).toFixed(2)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Fee Dialog */}
      <Dialog open={!!payFeeId} onOpenChange={(open) => { if (!open) { setPayFeeId(null); setPayMode("full"); setPartialAmount(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Make Payment</DialogTitle>
            <DialogDescription>
              {selectedFeeIds.length} fee{selectedFeeIds.length !== 1 ? "s" : ""} — Outstanding R{selectedFeeTotal.toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            <div className="space-y-1">
              {unpaidFees.filter((f: any) => selectedFeeIds.includes(f.id)).map((f: any) => (
                <div key={f.id} className="flex justify-between text-xs">
                  <span className="truncate">{f.fee_label}</span>
                  <span className="font-medium shrink-0 ml-2">R{Number(f.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <Separator />

            {/* Pay Full / Pay Partial toggle */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={payMode === "full" ? "default" : "outline"}
                className="h-10 text-xs"
                onClick={() => { setPayMode("full"); setPartialAmount(""); }}
              >
                Pay in Full
              </Button>
              <Button
                variant={payMode === "partial" ? "default" : "outline"}
                className="h-10 text-xs"
                onClick={() => { setPayMode("partial"); setPartialAmount(""); }}
              >
                Pay Partial
              </Button>
            </div>

            {payMode === "partial" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Amount to pay (R)</Label>
                <Input
                  type="number"
                  min="1"
                  max={selectedFeeTotal}
                  step="0.01"
                  placeholder={`Max R${selectedFeeTotal.toFixed(2)}`}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                />
                {Number(partialAmount) > selectedFeeTotal && (
                  <p className="text-[10px] text-destructive">Amount cannot exceed R{selectedFeeTotal.toFixed(2)}</p>
                )}
                {Number(partialAmount) > 0 && Number(partialAmount) < selectedFeeTotal && (
                  <p className="text-[10px] text-muted-foreground">
                    Remaining after payment: R{(selectedFeeTotal - Number(partialAmount)).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <Separator />

            {/* Payment method */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={payMethod === "credit" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayMethod("credit")}
                disabled={creditBalance < actualPayAmount}
              >
                <Wallet className="w-4 h-4" />
                Credit
              </Button>
              <Button
                variant={payMethod === "eft" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayMethod("eft")}
              >
                <Building2 className="w-4 h-4" />
                EFT
              </Button>
              <Button
                variant={payMethod === "card" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayMethod("card")}
              >
                <CreditCard className="w-4 h-4" />
                Card
              </Button>
            </div>

            {payMethod === "credit" && (
              <Card className="p-3 bg-green-500/5 border-green-500/20">
                <p className="text-xs text-green-700 dark:text-green-400">
                  Pay from your credit balance of R{creditBalance.toFixed(2)}
                </p>
              </Card>
            )}

            {payMethod === "eft" && clubSecrets?.bank_name && (
              <Card className="p-3 bg-muted/50 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={copyBankDetails}>
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                </div>
                {clubSecrets?.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {clubSecrets?.bank_name}</p>}
                {clubSecrets?.bank_account_name && <p className="text-xs"><span className="text-muted-foreground">Account:</span> {clubSecrets?.bank_account_name}</p>}
                {clubSecrets?.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {clubSecrets?.bank_account_number}</p>}
                {clubSecrets?.bank_branch_code && <p className="text-xs"><span className="text-muted-foreground">Branch:</span> {clubSecrets?.bank_branch_code}</p>}
                <p className="text-xs font-semibold"><span className="text-muted-foreground">Reference:</span> {memberNo} - Fees</p>
              </Card>
            )}

            {payMethod === "eft" && (
              <Card className="p-2.5 bg-amber-500/5 border-amber-500/20">
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  After making your EFT, your secretary/admin will confirm receipt and mark the fees as paid.
                </p>
              </Card>
            )}

            {payMethod === "card" && (
              <Card className="p-3 bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  Card payment via {club?.payment_gateway || "payment gateway"}. Fees will be marked as paid immediately.
                </p>
              </Card>
            )}

            <Button
              className="w-full"
              disabled={payFeeMutation.isPending || selectedFeeIds.length === 0 || actualPayAmount <= 0 || (payMode === "partial" && Number(partialAmount) > selectedFeeTotal)}
              onClick={() => payFeeMutation.mutate({
                feeIds: selectedFeeIds,
                method: payMethod,
                customAmount: payMode === "partial" ? Number(partialAmount) : undefined,
              })}
            >
              {payFeeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Pay R{actualPayAmount.toFixed(2)} via {payMethod === "credit" ? "Credit" : payMethod.toUpperCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Bar Tab Dialog */}
      <Dialog open={payBarOpen} onOpenChange={setPayBarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wine className="w-4 h-4 text-primary" />
              Pay Honesty Bar Tab
            </DialogTitle>
            <DialogDescription>
              {(barTabEntries as any[]).length} item{(barTabEntries as any[]).length !== 1 ? "s" : ""} — Total R{barTabTotal.toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-1">
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {(barTabEntries as any[]).map((e: any) => (
                <div key={e.id} className="flex justify-between text-xs">
                  <span className="truncate text-muted-foreground">{e.quantity}× {e.bar_items?.name || "Item"}</span>
                  <span className="font-medium shrink-0 ml-2">R{Number(e.total).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={payBarMethod === "credit" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayBarMethod("credit")}
                disabled={creditBalance < barTabTotal}
              >
                <Wallet className="w-4 h-4" />
                Credit
              </Button>
              <Button
                variant={payBarMethod === "eft" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayBarMethod("eft")}
              >
                <Building2 className="w-4 h-4" />
                EFT
              </Button>
              <Button
                variant={payBarMethod === "card" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayBarMethod("card")}
              >
                <CreditCard className="w-4 h-4" />
                Card
              </Button>
            </div>

            {payBarMethod === "credit" && (
              <Card className="p-3 bg-green-500/5 border-green-500/20">
                <p className="text-xs text-green-700 dark:text-green-400">
                  Pay from your credit balance of R{creditBalance.toFixed(2)}
                </p>
              </Card>
            )}

            {payBarMethod === "card" && (
              <Card className="p-3 bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  Card payment via {club?.payment_gateway || "Yoco"}. Your bar tab will be settled immediately.
                </p>
              </Card>
            )}

            {payBarMethod === "eft" && clubSecrets?.bank_name && (
              <Card className="p-3 bg-muted/50 space-y-1">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
                {clubSecrets?.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {clubSecrets?.bank_name}</p>}
                {clubSecrets?.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {clubSecrets?.bank_account_number}</p>}
                <p className="text-xs font-semibold"><span className="text-muted-foreground">Reference:</span> {memberNo} - Bar</p>
              </Card>
            )}

            {payBarMethod === "eft" && (
              <Card className="p-2.5 bg-amber-500/5 border-amber-500/20">
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  After making your EFT, admin will confirm and settle your bar tab.
                </p>
              </Card>
            )}

            <Button
              className="w-full"
              disabled={payBarMutation.isPending || barTabTotal <= 0}
              onClick={() => payBarMutation.mutate({ method: payBarMethod })}
            >
              {payBarMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Pay R{barTabTotal.toFixed(2)} via {payBarMethod === "credit" ? "Credit" : payBarMethod.toUpperCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <BackToDashboard />
    </div>
  );
}
