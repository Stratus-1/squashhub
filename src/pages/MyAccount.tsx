import { PageHeader } from "@/components/PageHeader";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Wallet, CreditCard, Building2, CheckCircle2, XCircle, Upload, Copy, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-data";
import { useMyClub, useMyClubMember } from "@/hooks/use-club";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function MyAccount() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: clubData } = useMyClub();
  const { data: myClubMember } = useMyClubMember();
  const queryClient = useQueryClient();
  const club = clubData?.club as any;
  const memberNo = myClubMember?.club_member_number || "N/A";

  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("100");
  const [topUpMethod, setTopUpMethod] = useState<"eft" | "card">("eft");
  const [payFeeId, setPayFeeId] = useState<string | null>(null);
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [payMethod, setPayMethod] = useState<"eft" | "card" | "credit">("credit");

  // Credit transactions
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ["credit-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await fromExt("member_credit_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fee payments from club_member_fee_payments
  const clubMemberId = myClubMember?.id;
  const { data: fees, isLoading: feesLoading } = useQuery({
    queryKey: ["club-member-fee-payments", clubMemberId],
    queryFn: async () => {
      const { data, error } = await fromExt("club_member_fee_payments")
        .select("*")
        .eq("club_member_id", clubMemberId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubMemberId,
  });

  // Calculate credit balance
  const creditBalance = (transactions || []).reduce((sum: number, tx: any) => {
    if (tx.status !== "confirmed") return sum;
    if (tx.type === "topup") return sum + Number(tx.amount);
    if (tx.type === "payment") return sum - Number(tx.amount);
    if (tx.type === "refund") return sum + Number(tx.amount);
    return sum;
  }, 0);

  const pendingTopUps = (transactions || []).filter(
    (tx: any) => tx.type === "topup" && tx.status === "pending"
  );

  // Top-up mutation
  const topUpMutation = useMutation({
    mutationFn: async ({ amount, method }: { amount: number; method: string }) => {
      const { error } = await fromExt("member_credit_transactions").insert({
        user_id: user!.id,
        amount,
        type: "topup",
        method,
        description: `Top-up via ${method.toUpperCase()}`,
        status: method === "eft" ? "pending" : "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-transactions"] });
      toast.success(
        topUpMethod === "eft"
          ? "EFT top-up request submitted. Upload proof of payment for faster processing."
          : "Card payment request submitted. Admin will confirm shortly."
      );
      setTopUpOpen(false);
    },
    onError: (e: any) => toast.error(e.message || "Failed to submit top-up"),
  });

  // Pay fee mutation
  const payFeeMutation = useMutation({
    mutationFn: async ({ feeIds, method }: { feeIds: string[]; method: string }) => {
      const selectedFees = (fees || []).filter((f: any) => feeIds.includes(f.id));
      if (!selectedFees.length) throw new Error("No fees selected");
      const totalAmount = selectedFees.reduce((s: number, f: any) => s + Number(f.amount), 0);

      if (method === "credit") {
        if (creditBalance < totalAmount) {
          throw new Error("Insufficient credit balance. Please top up first.");
        }
        // Deduct from credit and mark paid
        const { error: txErr } = await fromExt("member_credit_transactions").insert({
          user_id: user!.id,
          amount: totalAmount,
          type: "payment",
          method: "credit",
          description: `Fee payment: ${selectedFees.map((f: any) => f.fee_label).join(", ")}`,
          status: "confirmed",
        });
        if (txErr) throw txErr;
        // Mark all selected fees as paid
        for (const fee of selectedFees) {
          const { error } = await fromExt("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", fee.id);
          if (error) throw error;
        }
      } else if (method === "card") {
        // Card payment — auto-confirm, mark fees paid immediately
        const { error: txErr } = await fromExt("member_credit_transactions").insert({
          user_id: user!.id,
          amount: totalAmount,
          type: "payment",
          method: "card",
          description: `Card payment: ${selectedFees.map((f: any) => f.fee_label).join(", ")}`,
          status: "confirmed",
        });
        if (txErr) throw txErr;
        for (const fee of selectedFees) {
          const { error } = await fromExt("club_member_fee_payments")
            .update({ paid: true, paid_at: new Date().toISOString() })
            .eq("id", fee.id);
          if (error) throw error;
        }
      } else {
        // EFT — pending admin confirmation
        const { error: txErr } = await fromExt("member_credit_transactions").insert({
          user_id: user!.id,
          amount: totalAmount,
          type: "payment",
          method: "eft",
          description: `EFT payment: ${selectedFees.map((f: any) => f.fee_label).join(", ")}`,
          reference: `${memberNo} - Fees`,
          status: "pending",
        });
        if (txErr) throw txErr;
        // Do NOT mark fees as paid — admin/secretary must confirm
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
    },
    onError: (e: any) => toast.error(e.message || "Payment failed"),
  });

  const copyBankDetails = () => {
    const details = [
      club?.bank_name && `Bank: ${club.bank_name}`,
      club?.bank_account_name && `Account: ${club.bank_account_name}`,
      club?.bank_account_number && `Number: ${club.bank_account_number}`,
      club?.bank_branch_code && `Branch: ${club.bank_branch_code}`,
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

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const unpaidFees = (fees || []).filter((f: any) => !f.paid);
  const paidFees = (fees || []).filter((f: any) => f.paid);

  return (
    <div className="bottom-nav-safe">
      <SEO title="My Account" description="Manage your credit balance and fee payments." path="/my-account" noIndex />
      <PageHeader title="My Account" subtitle="Credit balance & fee payments" />

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
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Credit Balance</p>
                <p className="text-2xl font-bold font-heading text-foreground">
                  R{creditBalance.toFixed(2)}
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
        {feesLoading ? (
          <Card className="p-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </Card>
        ) : unpaidFees.length > 0 ? (
          <div className="space-y-1.5">
            {unpaidFees.map((fee: any) => (
              <Card key={fee.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    <p className="text-sm font-medium truncate">{fee.fee_label}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-5.5">
                    R{Number(fee.amount).toFixed(2)}
                    {fee.due_date && ` · Due ${fee.due_date}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-[11px] gap-1 border-primary/30"
                  onClick={() => {
                    setPayFeeId(fee.id);
                    setPayMethod(creditBalance >= Number(fee.amount) ? "credit" : "eft");
                  }}
                >
                  Pay
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-3 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto mb-1" />
            All fees paid — you're up to date! ✅
          </Card>
        )}
      </motion.div>

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

      {/* Transaction History */}
      <motion.div
        className="px-4 mt-4 mb-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h2 className="text-sm font-semibold font-heading mb-2">Transaction History</h2>
        {txLoading ? (
          <Card className="p-4 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </Card>
        ) : (transactions || []).length > 0 ? (
          <div className="space-y-1.5">
            {(transactions || []).slice(0, 10).map((tx: any) => (
              <Card key={tx.id} className="p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{tx.description || tx.type}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString()} · {tx.method?.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "text-xs font-semibold",
                    tx.type === "topup" || tx.type === "refund" ? "text-green-600" : "text-destructive"
                  )}>
                    {tx.type === "topup" || tx.type === "refund" ? "+" : "-"}R{Number(tx.amount).toFixed(2)}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[9px]",
                      tx.status === "confirmed" && "bg-green-500/10 text-green-600",
                      tx.status === "pending" && "bg-amber-500/10 text-amber-600"
                    )}
                  >
                    {tx.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
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

            {topUpMethod === "eft" && club?.bank_name && (
              <Card className="p-3 bg-muted/50 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={copyBankDetails}>
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                </div>
                {club.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {club.bank_name}</p>}
                {club.bank_account_name && <p className="text-xs"><span className="text-muted-foreground">Account:</span> {club.bank_account_name}</p>}
                {club.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {club.bank_account_number}</p>}
                {club.bank_branch_code && <p className="text-xs"><span className="text-muted-foreground">Branch:</span> {club.bank_branch_code}</p>}
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
      <Dialog open={!!payFeeId} onOpenChange={(open) => !open && setPayFeeId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pay Fee</DialogTitle>
            <DialogDescription>
              {payingFee?.fee_label} — R{Number(payingFee?.amount || 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={payMethod === "credit" ? "default" : "outline"}
                className="gap-1.5 h-12 text-xs flex-col"
                onClick={() => setPayMethod("credit")}
                disabled={creditBalance < Number(payingFee?.amount || 0)}
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

            {payMethod === "eft" && club?.bank_name && (
              <Card className="p-3 bg-muted/50 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Bank Details</p>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={copyBankDetails}>
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                </div>
                {club.bank_name && <p className="text-xs"><span className="text-muted-foreground">Bank:</span> {club.bank_name}</p>}
                {club.bank_account_name && <p className="text-xs"><span className="text-muted-foreground">Account:</span> {club.bank_account_name}</p>}
                {club.bank_account_number && <p className="text-xs"><span className="text-muted-foreground">Number:</span> {club.bank_account_number}</p>}
                {club.bank_branch_code && <p className="text-xs"><span className="text-muted-foreground">Branch:</span> {club.bank_branch_code}</p>}
                <p className="text-xs font-semibold"><span className="text-muted-foreground">Reference:</span> {memberNo} - {payingFee?.fee_label}</p>
              </Card>
            )}

            {payMethod === "card" && (
              <Card className="p-3 bg-muted/50">
                <p className="text-xs text-muted-foreground">
                  Card payment via {club?.payment_gateway || "payment gateway"}. Admin will confirm after verification.
                </p>
              </Card>
            )}

            <Button
              className="w-full"
              disabled={payFeeMutation.isPending}
              onClick={() => payFeeId && payFeeMutation.mutate({ feeId: payFeeId, method: payMethod })}
            >
              {payFeeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Pay R{Number(payingFee?.amount || 0).toFixed(2)} via {payMethod === "credit" ? "Credit" : payMethod.toUpperCase()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
