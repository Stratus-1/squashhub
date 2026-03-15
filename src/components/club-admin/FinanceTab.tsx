import { Club, useClubMembers } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromExt } from "@/lib/supabase-ext";
import { CheckCircle2, XCircle, Clock, Wallet } from "lucide-react";
import { format } from "date-fns";

export function FinanceTab({ club, clubId }: { club: Club; clubId: string }) {
  const queryClient = useQueryClient();
  const { data: members } = useClubMembers(clubId);

  // Fetch pending credit transactions for this tenant only
  const { data: pendingTransactions, isLoading: pendingLoading } = useQuery({
    queryKey: ["pending-member-transactions", clubId],
    queryFn: async () => {
      const { data, error } = await fromExt("member_credit_transactions")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!clubId,
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
    </div>
  );
}
