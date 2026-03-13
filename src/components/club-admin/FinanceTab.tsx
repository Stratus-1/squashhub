import { useState } from "react";
import { Club, useUpdateClub, useClubMembers } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { CheckCircle2, XCircle, Clock, Wallet } from "lucide-react";
import { format } from "date-fns";

export function FinanceTab({ club, clubId }: { club: Club; clubId: string }) {
  const updateClub = useUpdateClub();
  const queryClient = useQueryClient();
  const { data: members } = useClubMembers(clubId);

  const [form, setForm] = useState({
    bank_name: club.bank_name || "",
    bank_account_name: club.bank_account_name || "",
    bank_account_number: club.bank_account_number || "",
    bank_branch_code: club.bank_branch_code || "",
    bank_reference: club.bank_reference || "",
    payment_gateway: club.payment_gateway || "",
    payment_gateway_public_key: club.payment_gateway_public_key || "",
    payment_gateway_secret_key: club.payment_gateway_secret_key || "",
  });

  // Get all member user_ids for this club
  const memberUserIds = (members || []).map(m => m.user_id).filter(Boolean) as string[];

  // Fetch pending credit transactions for club members
  const { data: pendingTransactions, isLoading: pendingLoading } = useQuery({
    queryKey: ["pending-member-transactions", clubId, memberUserIds],
    queryFn: async () => {
      if (memberUserIds.length === 0) return [];
      const { data, error } = await fromExt("member_credit_transactions")
        .select("*")
        .in("user_id", memberUserIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: memberUserIds.length > 0,
  });

  const pendingOnly = (pendingTransactions || []).filter((t: any) => t.status === "pending");
  const recentConfirmed = (pendingTransactions || []).filter((t: any) => t.status !== "pending").slice(0, 10);

  const getMemberName = (userId: string) => {
    const member = (members || []).find(m => m.user_id === userId);
    return member?.name || member?.profiles?.name || member?.email || "Unknown";
  };

  const getMemberNumber = (userId: string) => {
    const member = (members || []).find(m => m.user_id === userId);
    return member?.club_member_number || "";
  };

  const handleConfirm = async (txId: string) => {
    try {
      const { error } = await fromExt("member_credit_transactions")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", txId);
      if (error) throw error;
      toast.success("Payment confirmed");
      queryClient.invalidateQueries({ queryKey: ["pending-member-transactions"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm");
    }
  };

  const handleReject = async (txId: string) => {
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

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const setSelect = (k: string) => (value: string) =>
    setForm(p => ({ ...p, [k]: value === "__none__" ? "" : value }));

  const handleSave = async () => {
    try {
      const payload: any = { ...form };
      if (!payload.payment_gateway) payload.payment_gateway = null;
      if (!payload.payment_gateway_public_key) payload.payment_gateway_public_key = null;
      if (!payload.payment_gateway_secret_key) payload.payment_gateway_secret_key = null;
      await updateClub.mutateAsync({ id: club.id, ...payload });
      toast.success("Finance settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Pending EFT Payments */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-warning" />
          <h3 className="font-semibold">Pending EFT Payments</h3>
          {pendingOnly.length > 0 && (
            <Badge variant="destructive" className="ml-2">{pendingOnly.length}</Badge>
          )}
        </div>
        {pendingLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : pendingOnly.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending payments to confirm.</p>
        ) : (
          <div className="space-y-3">
            {pendingOnly.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                <div className="space-y-0.5">
                  <div className="font-medium text-sm">
                    {getMemberName(tx.user_id)}
                    {getMemberNumber(tx.user_id) && (
                      <span className="text-xs text-muted-foreground ml-2">#{getMemberNumber(tx.user_id)}</span>
                    )}
                  </div>
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
                  <Button size="sm" variant="outline" onClick={() => handleReject(tx.id)}>
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => handleConfirm(tx.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent Transaction History */}
      {recentConfirmed.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Recent Transactions</h3>
          </div>
          <div className="space-y-2">
            {recentConfirmed.map((tx: any) => (
              <div key={tx.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                <div>
                  <span className="font-medium">{getMemberName(tx.user_id)}</span>
                  <span className="text-muted-foreground ml-2">R{Number(tx.amount).toFixed(2)}</span>
                  {tx.reference && <span className="text-xs text-muted-foreground ml-2">Ref: {tx.reference}</span>}
                </div>
                <Badge variant={tx.status === "confirmed" ? "default" : "destructive"}>
                  {tx.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Bank Details */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Bank Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1"><Label>Bank Name</Label><Input value={form.bank_name} onChange={set("bank_name")} /></div>
          <div className="space-y-1"><Label>Account Name</Label><Input value={form.bank_account_name} onChange={set("bank_account_name")} /></div>
          <div className="space-y-1"><Label>Account Number</Label><Input value={form.bank_account_number} onChange={set("bank_account_number")} /></div>
          <div className="space-y-1"><Label>Branch Code</Label><Input value={form.bank_branch_code} onChange={set("bank_branch_code")} /></div>
          <div className="space-y-1"><Label>Payment Reference</Label><Input value={form.bank_reference} onChange={set("bank_reference")} /></div>
        </div>
      </Card>

      {/* Payment Gateway */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold">Payment Gateway</h3>
        <p className="text-sm text-muted-foreground">Configure an online payment gateway (e.g. Yoco) for collecting fees.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Gateway Provider</Label>
            <Select value={form.payment_gateway || "__none__"} onValueChange={setSelect("payment_gateway")}>
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                <SelectItem value="yoco">Yoco</SelectItem>
                <SelectItem value="payfast">PayFast</SelectItem>
                <SelectItem value="paystack">Paystack</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div />
          <div className="space-y-1"><Label>Public / Publishable Key</Label><Input value={form.payment_gateway_public_key} onChange={set("payment_gateway_public_key")} placeholder="pk_live_..." /></div>
          <div className="space-y-1"><Label>Secret Key</Label><Input type="password" value={form.payment_gateway_secret_key} onChange={set("payment_gateway_secret_key")} placeholder="sk_live_..." /></div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={updateClub.isPending} className="w-full md:w-auto">
        {updateClub.isPending ? "Saving..." : "Save Finance Settings"}
      </Button>
    </div>
  );
}
